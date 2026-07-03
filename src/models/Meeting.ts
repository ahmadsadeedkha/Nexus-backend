import { Schema, model, Document, Types } from "mongoose";

export type MeetingStatus = "pending" | "accepted" | "rejected" | "cancelled";

export interface IMeeting extends Document {
  id: string;
  title: string;
  description?: string;
  organizer: Types.ObjectId;
  participants: Types.ObjectId[];
  startTime: Date;
  endTime: Date;
  status: MeetingStatus;
  location?: string;
  meetingLink?: string;
  createdAt: Date;
  updatedAt: Date;
}

const meetingSchema = new Schema<IMeeting>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    organizer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    participants: [
      { type: Schema.Types.ObjectId, ref: "User", required: true },
    ],
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "cancelled"],
      default: "pending",
    },
    location: { type: String, trim: true },
    meetingLink: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        const out = ret as unknown as Record<string, unknown>;
        out.id = out._id;
        delete out._id;
        delete out.__v;
        return out;
      },
    },
  },
);

// Reject bad time ranges before they ever hit the DB.
// Note: Mongoose v8 sync-style hooks don't take a `next` param — just return.
meetingSchema.pre("validate", function () {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    this.invalidate("endTime", "End time must be after start time");
  }
});

// Speeds up the overlap queries used for conflict detection.
meetingSchema.index({ organizer: 1, startTime: 1, endTime: 1 });
meetingSchema.index({ participants: 1, startTime: 1, endTime: 1 });

export const Meeting = model<IMeeting>("Meeting", meetingSchema);
