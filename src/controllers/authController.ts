import { Request, Response } from "express";
import crypto from "crypto";
import { User, Entrepreneur, Investor } from "../models/User";
import { generateToken } from "../utils/generateToken";

// In-memory reset token store (replace with DB field or Redis in production)
const resetTokens = new Map<string, { userId: string; expires: number }>();

// @route POST /api/auth/register
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, ...roleFields } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

    let newUser;
    if (role === "entrepreneur") {
      newUser = await Entrepreneur.create({
        name,
        email,
        password,
        role,
        avatarUrl,
        bio: "",
        isOnline: true,
        startupName: roleFields.startupName || "",
        pitchSummary: roleFields.pitchSummary || "",
        fundingNeeded: roleFields.fundingNeeded || "",
        industry: roleFields.industry || "",
        location: roleFields.location || "",
        foundedYear: roleFields.foundedYear || new Date().getFullYear(),
        teamSize: roleFields.teamSize || 1,
      });
    } else if (role === "investor") {
      newUser = await Investor.create({
        name,
        email,
        password,
        role,
        avatarUrl,
        bio: "",
        isOnline: true,
        investmentInterests: roleFields.investmentInterests || [],
        investmentStage: roleFields.investmentStage || [],
        portfolioCompanies: roleFields.portfolioCompanies || [],
        totalInvestments: roleFields.totalInvestments || 0,
        minimumInvestment: roleFields.minimumInvestment || "",
        maximumInvestment: roleFields.maximumInvestment || "",
      });
    } else {
      return res.status(400).json({ message: "Invalid role" });
    }

    const token = generateToken(newUser.id);
    const userObj = newUser.toObject();

    res.status(201).json({ user: userObj, token });
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

// @route POST /api/auth/login
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const foundUser = await User.findOne({ email, role }).select("+password");

    if (!foundUser) {
      return res
        .status(401)
        .json({ message: "Invalid credentials or user not found" });
    }

    const isMatch = await foundUser.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    foundUser.isOnline = true;
    await foundUser.save();

    const token = generateToken(foundUser.id);
    const userObj = foundUser.toObject();

    res.status(200).json({ user: userObj, token });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

// @route POST /api/auth/forgot-password
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ message: "No account found with this email" });
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
    resetTokens.set(resetToken, {
      userId: user.id,
      expires: Date.now() + 3600000,
    }); // 1 hour

    // In production: send this token via email using a service like Nodemailer/SendGrid
    console.log(`Password reset token for ${email}: ${resetToken}`);

    res
      .status(200)
      .json({ message: "Password reset instructions sent to your email" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

// @route POST /api/auth/reset-password
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    const tokenData = resetTokens.get(token);
    if (!tokenData || tokenData.expires < Date.now()) {
      return res
        .status(400)
        .json({ message: "Invalid or expired reset token" });
    }

    const user = await User.findById(tokenData.userId).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.password = newPassword; // pre('save') hook will hash it
    await user.save();

    resetTokens.delete(token);

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};
