import { Router } from "express";
import {
  getConversations,
  getMessagesBetweenUsers,
  sendMessage,
} from "../controllers/messageController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.get("/conversations", protect, getConversations);
router.get("/:userId", protect, getMessagesBetweenUsers);
router.post("/", protect, sendMessage);

export default router;
