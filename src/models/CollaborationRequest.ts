import mongoose, { Schema, Document } from "mongoose";

export interface ICollaborationRequest extends Document {
  investorId: mongoose.Types.ObjectId;
  entrepreneurId: mongoose.Types.ObjectId;
  message: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

const collaborationRequestSchema = new Schema<ICollaborationRequest>(
  {
    investorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    entrepreneurId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  {
    toJSON: {
      transform: (_doc: unknown, ret: Record<string, unknown>) => {
        ret.id = ret._id;
        delete (ret as { _id?: unknown })._id;
        delete (ret as { __v?: unknown }).__v;
        return ret;
      },
    },
  },
);

export const CollaborationRequest = mongoose.model<ICollaborationRequest>(
  "CollaborationRequest",
  collaborationRequestSchema,
);
