import express, { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import path from "path";
import multer from "multer";
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import collaborationRoutes from "./routes/collaborationRoutes";
import messageRoutes from "./routes/messageRoutes";
import meetingRoutes from "./routes/meetingRoutes";
import documentRoutes from "./routes/documentRoutes";

const app: Application = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/collaboration-requests", collaborationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/documents", documentRoutes);

app.get("/", (req, res) => {
  res.send("API is running");
});

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Turns Multer's upload errors (wrong file type, too large, etc.) into a
// clean JSON response instead of Express's default HTML error page.
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }
  if (err instanceof Error) {
    return res.status(400).json({ message: err.message });
  }
  next(err);
});

export default app;
