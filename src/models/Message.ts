import mongoose, { Schema, Document } from "mongoose";

export interface IMessage extends Document {
  senderId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  content: string;
  timestamp: string;
  isRead: boolean;
}

const messageSchema = new Schema<IMessage>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    timestamp: { type: String, default: () => new Date().toISOString() },
    isRead: { type: Boolean, default: false },
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

export const Message = mongoose.model<IMessage>("Message", messageSchema);
