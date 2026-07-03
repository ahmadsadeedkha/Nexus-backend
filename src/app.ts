import express, { Application } from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import collaborationRoutes from "./routes/collaborationRoutes";
import messageRoutes from "./routes/messageRoutes";
import meetingRoutes from "./routes/meetingRoutes";

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

app.get("/", (req, res) => {
  res.send("API is running");
});

export default app;
