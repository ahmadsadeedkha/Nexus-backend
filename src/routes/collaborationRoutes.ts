import { Router } from "express";
import {
  createRequest,
  getRequestsForEntrepreneur,
  getRequestsFromInvestor,
  updateRequestStatus,
} from "../controllers/collaborationController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.post("/", protect, createRequest);
router.get(
  "/entrepreneur/:entrepreneurId",
  protect,
  getRequestsForEntrepreneur,
);
router.get("/investor/:investorId", protect, getRequestsFromInvestor);
router.patch("/:id/status", protect, updateRequestStatus);

export default router;
