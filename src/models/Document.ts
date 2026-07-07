import mongoose, { Schema, Document as MongooseDocument } from "mongoose";

export type DocumentStatus = "uploaded" | "signed" | "archived";

export interface ISignature {
  imageUrl: string;
  signedAt: string;
}

export interface IDocumentFile extends MongooseDocument {
  name: string;
  originalFileName: string;
  storedFileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: mongoose.Types.ObjectId;
  version: number;
  status: DocumentStatus;
  sharedWith: mongoose.Types.ObjectId[];
  signature?: ISignature;
  createdAt: string;
  updatedAt: string;
}

const signatureSchema = new Schema<ISignature>(
  {
    imageUrl: { type: String, required: true },
    signedAt: { type: String, required: true },
  },
  { _id: false },
);

const documentFileSchema = new Schema<IDocumentFile>(
  {
    name: { type: String, required: true },
    originalFileName: { type: String, required: true },
    storedFileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    version: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ["uploaded", "signed", "archived"],
      default: "uploaded",
    },
    sharedWith: [{ type: Schema.Types.ObjectId, ref: "User" }],
    signature: { type: signatureSchema, required: false },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
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

export const DocumentModel = mongoose.model<IDocumentFile>(
  "Document",
  documentFileSchema,
);
