import { Router, Response } from "express";
import mongoose from "mongoose";
import { User } from "../models/User";
import { protect, AuthRequest } from "../middleware/authMiddleware";

const router = Router();

// GET current logged-in user
router.get("/me", protect, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId as string);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
});

// GET a single user by ID
router.get("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id as string)) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
});

// GET /api/users?role=entrepreneur or ?role=investor
router.get('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    const role = req.query.role as string | undefined;
    const filter = role ? { role: role as "entrepreneur" | "investor" } : {};
    const users = await User.find(filter);
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
});

// PATCH update profile
router.patch("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id as string)) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.params.id !== (req.userId as string)) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this profile" });
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(updatedUser);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
});

export default router;
