import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { User } from "../models/User";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
  userRole?: string;
}

interface PeerInfo {
  id: string;
  name: string;
  role: string;
}

// A "basic" mesh call keeps every participant directly connected to every
// other participant (no SFU/media server). That works well for small groups;
// bandwidth/CPU cost grows with the square of the participant count, so we
// cap it to keep call quality reasonable.
const MAX_PARTICIPANTS = 6;

// userId -> set of socket ids (a user can have multiple tabs/devices open)
const onlineUsers = new Map<string, Set<string>>();

// userId -> light profile info, used to build peer lists without hitting the DB
const connectedUserInfo = new Map<string, PeerInfo>();

// roomId -> set of userIds currently joined to that call (the mesh members)
const activeRooms = new Map<string, Set<string>>();

// roomId -> who started the call and who is still pending a response
const pendingCalls = new Map<
  string,
  { initiatorId: string; invitedUserIds: Set<string> }
>();

let io: SocketIOServer;

export const initSocket = (httpServer: HTTPServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
    },
  });

  // --- Authenticate every socket connection using the same JWT used for REST ---
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const authToken = socket.handshake.auth?.token as string | undefined;
      const headerToken = (
        socket.handshake.headers.authorization as string | undefined
      )?.split(" ")[1];
      const token = authToken || headerToken;

      if (!token) {
        return next(new Error("Not authorized, no token"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
        id: string;
      };

      const user = await User.findById(decoded.id);
      if (!user) {
        return next(new Error("Not authorized, user not found"));
      }

      socket.userId = String(user._id);
      socket.userName = user.name;
      socket.userRole = user.role;
      next();
    } catch (error) {
      next(new Error("Not authorized, token failed"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    handleConnection(socket);
  });

  return io;
};

export const getIO = (): SocketIOServer => {
  if (!io) {
    throw new Error("Socket.IO not initialized. Call initSocket first.");
  }
  return io;
};

// ---------------------------------------------------------------------------
// Connection lifecycle & presence
// ---------------------------------------------------------------------------

const handleConnection = async (socket: AuthenticatedSocket) => {
  const userId = socket.userId as string;

  // Personal room so we can reach this user by id regardless of socket/tab count.
  socket.join(`user:${userId}`);

  const wasOffline =
    !onlineUsers.has(userId) || onlineUsers.get(userId)!.size === 0;
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId)!.add(socket.id);
  connectedUserInfo.set(userId, {
    id: userId,
    name: socket.userName || "Unknown",
    role: socket.userRole || "user",
  });

  if (wasOffline) {
    await User.findByIdAndUpdate(userId, { isOnline: true }).catch(
      () => undefined,
    );
    socket.broadcast.emit("presence:online", { userId });
  }

  console.log(
    `[socket] ${socket.userName} (${userId}) connected: ${socket.id}`,
  );

  // ---- Call handshake ----
  socket.on("call:invite", (payload: { toUserIds: string[] }) =>
    onCallInvite(socket, payload),
  );
  socket.on("call:accept", (payload: { roomId: string }) =>
    onCallAccept(socket, payload),
  );
  socket.on("call:reject", (payload: { roomId: string }) =>
    onCallReject(socket, payload),
  );
  socket.on("call:leave", (payload: { roomId: string }) =>
    onCallLeave(socket, payload),
  );
  socket.on(
    "call:media-toggle",
    (payload: { roomId: string; kind: "audio" | "video"; enabled: boolean }) =>
      onMediaToggle(socket, payload),
  );

  // ---- WebRTC signal relay, targeted per-peer (server never inspects SDP/ICE) ----
  socket.on(
    "webrtc:offer",
    (payload: { roomId: string; toUserId: string; sdp: unknown }) =>
      relayToPeer(socket, payload, "webrtc:offer", { sdp: payload?.sdp }),
  );
  socket.on(
    "webrtc:answer",
    (payload: { roomId: string; toUserId: string; sdp: unknown }) =>
      relayToPeer(socket, payload, "webrtc:answer", { sdp: payload?.sdp }),
  );
  socket.on(
    "webrtc:ice-candidate",
    (payload: { roomId: string; toUserId: string; candidate: unknown }) =>
      relayToPeer(socket, payload, "webrtc:ice-candidate", {
        candidate: payload?.candidate,
      }),
  );

  socket.on("disconnect", () => handleDisconnect(socket));
};

const handleDisconnect = async (socket: AuthenticatedSocket) => {
  const userId = socket.userId;
  if (!userId) return;

  // Leave any active call rooms this socket was part of (this also notifies
  // any still-pending invitees if the room becomes empty as a result).
  for (const [roomId, members] of activeRooms.entries()) {
    if (members.has(userId)) {
      removeFromRoom(roomId, userId);
    }
  }

  // If they were invited to a call but hadn't responded yet, drop them from
  // the pending invite list so the host isn't left waiting on a ghost.
  for (const pending of pendingCalls.values()) {
    pending.invitedUserIds.delete(userId);
  }

  const sockets = onlineUsers.get(userId);
  if (sockets) {
    sockets.delete(socket.id);
    if (sockets.size === 0) {
      onlineUsers.delete(userId);
      connectedUserInfo.delete(userId);
      await User.findByIdAndUpdate(userId, { isOnline: false }).catch(
        () => undefined,
      );
      socket.broadcast.emit("presence:offline", { userId });
    }
  }

  console.log(
    `[socket] ${socket.userName} (${userId}) disconnected: ${socket.id}`,
  );
};

// ---------------------------------------------------------------------------
// Call handshake handlers
// ---------------------------------------------------------------------------

const onCallInvite = (
  socket: AuthenticatedSocket,
  payload: { toUserIds: string[] },
) => {
  const fromUserId = socket.userId as string;
  const toUserIds = (payload?.toUserIds || []).filter(
    (id) => id && id !== fromUserId,
  );

  if (toUserIds.length === 0) {
    return socket.emit("call:error", {
      message: "Select at least one person to call",
    });
  }
  if (toUserIds.length + 1 > MAX_PARTICIPANTS) {
    return socket.emit("call:error", {
      message: `A call can have at most ${MAX_PARTICIPANTS} participants`,
    });
  }

  const roomId = `call-${fromUserId}-${Date.now()}`;
  pendingCalls.set(roomId, {
    initiatorId: fromUserId,
    invitedUserIds: new Set(toUserIds),
  });
  activeRooms.set(roomId, new Set([fromUserId]));
  socket.join(roomId);

  const unavailable: string[] = [];
  const reached: string[] = [];

  for (const toUserId of toUserIds) {
    if (!onlineUsers.has(toUserId) || onlineUsers.get(toUserId)!.size === 0) {
      unavailable.push(toUserId);
      continue;
    }
    reached.push(toUserId);
    io.to(`user:${toUserId}`).emit("call:incoming", {
      roomId,
      from: { id: fromUserId, name: socket.userName, role: socket.userRole },
      invitedCount: toUserIds.length,
    });
  }

  socket.emit("call:invite-sent", { roomId, reached, unavailable });
  socket.emit("call:room-peers", { roomId, peers: [] });
};

const onCallAccept = (
  socket: AuthenticatedSocket,
  payload: { roomId: string },
) => {
  const userId = socket.userId as string;
  const roomId = payload?.roomId;
  const pending = roomId ? pendingCalls.get(roomId) : undefined;

  if (!roomId || !pending) {
    return socket.emit("call:error", {
      message: "This call is no longer available",
    });
  }

  const members = activeRooms.get(roomId) ?? new Set<string>();

  if (members.size >= MAX_PARTICIPANTS && !members.has(userId)) {
    return socket.emit("call:error", { message: "This call is full" });
  }

  // Snapshot who's already in before we add ourselves — that's who we need
  // to create outgoing offers to.
  const existingPeers: PeerInfo[] = Array.from(members)
    .map((id) => connectedUserInfo.get(id))
    .filter((info): info is PeerInfo => Boolean(info));

  socket.join(roomId);
  members.add(userId);
  activeRooms.set(roomId, members);
  pending.invitedUserIds.delete(userId);

  socket.emit("call:room-peers", { roomId, peers: existingPeers });
  socket.to(roomId).emit("call:peer-joined", {
    roomId,
    peer: { id: userId, name: socket.userName, role: socket.userRole },
  });
};

const onCallReject = (
  socket: AuthenticatedSocket,
  payload: { roomId: string },
) => {
  const userId = socket.userId as string;
  const roomId = payload?.roomId;
  const pending = roomId ? pendingCalls.get(roomId) : undefined;
  if (!roomId || !pending) return;

  pending.invitedUserIds.delete(userId);
  io.to(`user:${pending.initiatorId}`).emit("call:rejected", {
    roomId,
    by: { id: userId, name: socket.userName },
  });
};

const onCallLeave = (
  socket: AuthenticatedSocket,
  payload: { roomId: string },
) => {
  const roomId = payload?.roomId;
  const userId = socket.userId as string;
  if (!roomId) return;
  removeFromRoom(roomId, userId, socket);
};

const removeFromRoom = (
  roomId: string,
  userId: string,
  socket?: AuthenticatedSocket,
) => {
  const members = activeRooms.get(roomId);
  if (!members || !members.has(userId)) return;

  members.delete(userId);
  (socket ?? io).to(roomId).emit("call:peer-left", { roomId, peerId: userId });
  socket?.leave(roomId);

  if (members.size === 0) {
    // Nobody's left in the room. If there were still invitees who hadn't
    // responded (e.g. the host hung up before anyone joined), let them know
    // the call is no longer happening.
    const pending = pendingCalls.get(roomId);
    if (pending) {
      for (const invitedId of pending.invitedUserIds) {
        io.to(`user:${invitedId}`).emit("call:cancelled", { roomId });
      }
    }
    activeRooms.delete(roomId);
    pendingCalls.delete(roomId);
    io.socketsLeave(roomId);
  }
};

const onMediaToggle = (
  socket: AuthenticatedSocket,
  payload: { roomId: string; kind: "audio" | "video"; enabled: boolean },
) => {
  const { roomId, kind, enabled } = payload || {};
  if (!roomId) return;
  socket
    .to(roomId)
    .emit("call:media-toggle", {
      roomId,
      userId: socket.userId,
      kind,
      enabled,
    });
};

// ---------------------------------------------------------------------------
// Targeted WebRTC relay (mesh: every pair signals directly, server just forwards)
// ---------------------------------------------------------------------------

const relayToPeer = (
  socket: AuthenticatedSocket,
  payload: { roomId: string; toUserId: string },
  event: string,
  data: Record<string, unknown>,
) => {
  const fromUserId = socket.userId as string;
  const { roomId, toUserId } = payload || {};
  if (!roomId || !toUserId) return;

  const members = activeRooms.get(roomId);
  if (!members || !members.has(fromUserId) || !members.has(toUserId)) {
    return; // ignore signals for rooms/peers that aren't actually connected
  }

  io.to(`user:${toUserId}`).emit(event, { roomId, fromUserId, ...data });
};
