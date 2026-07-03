import { Router } from "express";
import { protect } from "../middleware/authMiddleware";
import {
  scheduleMeeting,
  acceptMeeting,
  rejectMeeting,
  cancelMeeting,
  getMyMeetings,
  getMeetingById,
  getCalendarFeed,
} from "../controllers/meetingController";

const router = Router();

// Every meeting route requires a logged-in user
router.use(protect);

router.post("/", scheduleMeeting);
router.get("/", getMyMeetings);
router.get("/calendar", getCalendarFeed); // must come before /:id
router.get("/:id", getMeetingById);
router.patch("/:id/accept", acceptMeeting);
router.patch("/:id/reject", rejectMeeting);
router.patch("/:id/cancel", cancelMeeting);

export default router;
