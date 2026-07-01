import { Response } from "express";
import { CollaborationRequest } from "../models/CollaborationRequest";
import { AuthRequest } from "../middleware/authMiddleware";

// POST /api/collaboration-requests
export const createRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { entrepreneurId, message } = req.body;
    const investorId = req.userId;

    if (req.userRole !== "investor") {
      return res
        .status(403)
        .json({ message: "Only investors can send collaboration requests" });
    }

    // Prevent duplicate requests
    const existing = await CollaborationRequest.findOne({
      investorId,
      entrepreneurId,
    });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Request already sent to this entrepreneur" });
    }

    const newRequest = await CollaborationRequest.create({
      investorId,
      entrepreneurId,
      message,
    });

    res.status(201).json(newRequest);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

// GET /api/collaboration-requests/entrepreneur/:entrepreneurId
export const getRequestsForEntrepreneur = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const requests = await CollaborationRequest.find({
      entrepreneurId: req.params.entrepreneurId,
    })
      .populate("investorId", "name email avatarUrl")
      .sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

// GET /api/collaboration-requests/investor/:investorId
export const getRequestsFromInvestor = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const requests = await CollaborationRequest.find({
      investorId: req.params.investorId,
    })
      .populate("entrepreneurId", "name email avatarUrl")
      .sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

// PATCH /api/collaboration-requests/:id/status
export const updateRequestStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;

    if (!["pending", "accepted", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const request = await CollaborationRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    // Only the entrepreneur who received the request can update its status
    if (request.entrepreneurId.toString() !== req.userId) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this request" });
    }

    request.status = status;
    await request.save();

    res.status(200).json(request);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};
