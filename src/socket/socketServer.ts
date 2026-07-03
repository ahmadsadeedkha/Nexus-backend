import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { User } from "../models/User";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
  userRole?: string;
}

// userId -> set of socket ids (a user can have multiple tabs/devices open)
const onlineUsers = new Map<string, Set<string>>();

// roomId -> set of userIds currently joined to that call room (max 2, 1-to-1 only)
const activeRooms = new Map<string, Set<string>>();

// roomId -> userId of whoever sent the original call:invite.
// Used so the frontend knows who should create the WebRTC offer (avoids glare).
const roomInitiators = new Map<string, string>();

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
  socket.on("call:invite", (payload: { toUserId: string }) =>
    onCallInvite(socket, payload),
  );
  socket.on("call:accept", (payload: { roomId: string; toUserId: string }) =>
    onCallAccept(socket, payload),
  );
  socket.on("call:reject", (payload: { roomId: string; toUserId: string }) =>
    onCallReject(socket, payload),
  );
  socket.on("call:cancel", (payload: { roomId: string; toUserId: string }) =>
    onCallCancel(socket, payload),
  );
  socket.on("call:join", (payload: { roomId: string }) =>
    onCallJoin(socket, payload),
  );
  socket.on("call:end", (payload: { roomId: string }) =>
    onCallEnd(socket, payload),
  );
  socket.on(
    "call:media-toggle",
    (payload: { roomId: string; kind: "audio" | "video"; enabled: boolean }) =>
      onMediaToggle(socket, payload),
  );

  // ---- WebRTC signal relay (server never inspects these, just forwards) ----
  socket.on("webrtc:offer", (payload: { roomId: string; sdp: unknown }) =>
    relayToRoom(socket, payload?.roomId, "webrtc:offer", { sdp: payload?.sdp }),
  );
  socket.on("webrtc:answer", (payload: { roomId: string; sdp: unknown }) =>
    relayToRoom(socket, payload?.roomId, "webrtc:answer", {
      sdp: payload?.sdp,
    }),
  );
  socket.on(
    "webrtc:ice-candidate",
    (payload: { roomId: string; candidate: unknown }) =>
      relayToRoom(socket, payload?.roomId, "webrtc:ice-candidate", {
        candidate: payload?.candidate,
      }),
  );

  socket.on("disconnect", () => handleDisconnect(socket));
};

const handleDisconnect = async (socket: AuthenticatedSocket) => {
  const userId = socket.userId;
  if (!userId) return;

  // If this socket was in an active call room, tell the peer and tear the room down.
  for (const [roomId, members] of activeRooms.entries()) {
    if (members.has(userId)) {
      socket
        .to(roomId)
        .emit("call:ended", { roomId, reason: "peer-disconnected" });
      cleanupRoom(roomId);
    }
  }

  const sockets = onlineUsers.get(userId);
  if (sockets) {
    sockets.delete(socket.id);
    if (sockets.size === 0) {
      onlineUsers.delete(userId);
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
  payload: { toUserId: string },
) => {
  const fromUserId = socket.userId as string;
  const toUserId = payload?.toUserId;

  if (!toUserId) {
    return socket.emit("call:error", { message: "toUserId is required" });
  }
  if (toUserId === fromUserId) {
    return socket.emit("call:error", { message: "You cannot call yourself" });
  }
  if (!onlineUsers.has(toUserId) || onlineUsers.get(toUserId)!.size === 0) {
    return socket.emit("call:unavailable", { toUserId });
  }

  const roomId = `call-${fromUserId}-${toUserId}-${Date.now()}`;
  roomInitiators.set(roomId, fromUserId);

  io.to(`user:${toUserId}`).emit("call:incoming", {
    roomId,
    from: { id: fromUserId, name: socket.userName, role: socket.userRole },
  });

  socket.emit("call:invite-sent", { roomId, toUserId });
};

const onCallAccept = (
  socket: AuthenticatedSocket,
  payload: { roomId: string; toUserId: string },
) => {
  const { roomId, toUserId } = payload || {};
  if (!roomId || !toUserId) return;

  io.to(`user:${toUserId}`).emit("call:accepted", {
    roomId,
    by: { id: socket.userId, name: socket.userName, role: socket.userRole },
  });
};

const onCallReject = (
  socket: AuthenticatedSocket,
  payload: { roomId: string; toUserId: string },
) => {
  const { roomId, toUserId } = payload || {};
  if (!roomId || !toUserId) return;

  io.to(`user:${toUserId}`).emit("call:rejected", { roomId });
  roomInitiators.delete(roomId);
};

const onCallCancel = (
  socket: AuthenticatedSocket,
  payload: { roomId: string; toUserId: string },
) => {
  const { roomId, toUserId } = payload || {};
  if (!roomId || !toUserId) return;

  io.to(`user:${toUserId}`).emit("call:cancelled", { roomId });
  roomInitiators.delete(roomId);
};

const onCallJoin = (
  socket: AuthenticatedSocket,
  payload: { roomId: string },
) => {
  const roomId = payload?.roomId;
  const userId = socket.userId as string;
  if (!roomId) return;

  socket.join(roomId);

  if (!activeRooms.has(roomId)) {
    activeRooms.set(roomId, new Set());
  }
  const members = activeRooms.get(roomId)!;

  if (members.size >= 2 && !members.has(userId)) {
    socket.emit("call:error", { message: "Call room is full" });
    socket.leave(roomId);
    return;
  }

  members.add(userId);

  const isInitiator = roomInitiators.get(roomId) === userId;
  socket.emit("call:joined", { roomId, isInitiator });

  if (members.size === 2) {
    io.to(roomId).emit("call:ready", { roomId });
  }
};

const onCallEnd = (
  socket: AuthenticatedSocket,
  payload: { roomId: string },
) => {
  const roomId = payload?.roomId;
  if (!roomId) return;

  socket.to(roomId).emit("call:ended", { roomId, reason: "peer-left" });
  cleanupRoom(roomId);
};

const onMediaToggle = (
  socket: AuthenticatedSocket,
  payload: { roomId: string; kind: "audio" | "video"; enabled: boolean },
) => {
  const { roomId, kind, enabled } = payload || {};
  if (!roomId) return;
  socket
    .to(roomId)
    .emit("call:media-toggle", { userId: socket.userId, kind, enabled });
};

const relayToRoom = (
  socket: AuthenticatedSocket,
  roomId: string | undefined,
  event: string,
  data: Record<string, unknown>,
) => {
  if (!roomId) return;
  socket.to(roomId).emit(event, data);
};

const cleanupRoom = (roomId: string) => {
  activeRooms.delete(roomId);
  roomInitiators.delete(roomId);
  io.socketsLeave(roomId);
};
