import { Response } from "express";
import mongoose from "mongoose";
import { Message } from "../models/Message";
import { AuthRequest } from "../middleware/authMiddleware";

// GET /api/messages/conversations — all conversations for current user
export const getConversations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);

    // Find all messages where user is sender or receiver
    const messages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    }).sort({ timestamp: -1 });

    // Build unique conversations
    const conversationMap = new Map<string, any>();

    for (const msg of messages) {
      const otherId =
        msg.senderId.toString() === req.userId
          ? msg.receiverId.toString()
          : msg.senderId.toString();

      const convId = [req.userId, otherId].sort().join("-");

      if (!conversationMap.has(convId)) {
        conversationMap.set(convId, {
          id: convId,
          participants: [req.userId, otherId],
          lastMessage: msg.toJSON(),
          updatedAt: msg.timestamp,
        });
      }
    }

    res.status(200).json(Array.from(conversationMap.values()));
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

// GET /api/messages/:userId — messages between current user and another user
export const getMessagesBetweenUsers = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const currentUserId = new mongoose.Types.ObjectId(req.userId);
    const otherUserId = new mongoose.Types.ObjectId(req.params.userId as string);

    const messages = await Message.find({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId },
      ],
    }).sort({ timestamp: 1 });

    // Mark received messages as read
    await Message.updateMany(
      { senderId: otherUserId, receiverId: currentUserId, isRead: false },
      { isRead: true },
    );

    res.status(200).json(messages.map((m) => m.toJSON()));
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

// POST /api/messages — send a message
export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { receiverId, content } = req.body;

    if (!receiverId || !content) {
      return res
        .status(400)
        .json({ message: "receiverId and content are required" });
    }

    const message = await Message.create({
      senderId: new mongoose.Types.ObjectId(req.userId),
      receiverId: new mongoose.Types.ObjectId(receiverId),
      content,
    });

    res.status(201).json(message.toJSON());
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};
