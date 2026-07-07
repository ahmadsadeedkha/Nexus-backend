import { Response } from "express";
import fs from "fs";
import path from "path";
import { AuthRequest } from "../middleware/authMiddleware";
import { DocumentModel, IDocumentFile } from "../models/Document";
import {
  DOCUMENTS_URL_PREFIX,
  SIGNATURES_URL_PREFIX,
} from "../middleware/upload";

const documentsDir = () => path.join(process.cwd(), "uploads", "documents");
const signaturesDir = () => path.join(process.cwd(), "uploads", "signatures");

const canAccess = (doc: IDocumentFile, userId: string): boolean =>
  doc.uploadedBy.toString() === userId ||
  doc.sharedWith.some((id) => id.toString() === userId);

// POST /api/documents  (multipart field: "file")
export const uploadDocumentHandler = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const doc = await DocumentModel.create({
      name: req.body.name || req.file.originalname,
      originalFileName: req.file.originalname,
      storedFileName: req.file.filename,
      fileUrl: `${DOCUMENTS_URL_PREFIX}/${req.file.filename}`,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: req.userId,
      version: 1,
      status: "uploaded",
      sharedWith: [],
    });

    res.status(201).json(doc);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

// GET /api/documents?scope=mine|shared|all
export const getDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const scope = (req.query.scope as string) || "all";
    const userId = req.userId;

    const filter =
      scope === "mine"
        ? { uploadedBy: userId }
        : scope === "shared"
          ? { sharedWith: userId }
          : { $or: [{ uploadedBy: userId }, { sharedWith: userId }] };

    const docs = await DocumentModel.find(filter)
      .populate("uploadedBy", "name email avatarUrl role")
      .sort({ createdAt: -1 });

    res.status(200).json(docs);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

// GET /api/documents/:id
export const getDocumentById = async (req: AuthRequest, res: Response) => {
  try {
    const doc = await DocumentModel.findById(req.params.id).populate(
      "uploadedBy",
      "name email avatarUrl role",
    );
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (!canAccess(doc, req.userId as string)) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this document" });
    }
    res.status(200).json(doc);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

// PUT /api/documents/:id  (multipart field: "file") — replaces the file, bumps version
export const reuploadDocument = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const doc = await DocumentModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (doc.uploadedBy.toString() !== req.userId) {
      return res
        .status(403)
        .json({ message: "Only the uploader can replace this document" });
    }

    // Remove the old file (and any signature, since it no longer applies
    // to the new content) from disk before pointing at the new one.
    fs.unlink(path.join(documentsDir(), doc.storedFileName), () => undefined);
    if (doc.signature) {
      fs.unlink(
        path.join(signaturesDir(), path.basename(doc.signature.imageUrl)),
        () => undefined,
      );
    }

    doc.originalFileName = req.file.originalname;
    doc.storedFileName = req.file.filename;
    doc.fileUrl = `${DOCUMENTS_URL_PREFIX}/${req.file.filename}`;
    doc.mimeType = req.file.mimetype;
    doc.fileSize = req.file.size;
    doc.version += 1;
    doc.status = "uploaded";
    doc.signature = undefined;
    doc.updatedAt = new Date().toISOString();

    await doc.save();
    res.status(200).json(doc);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

// DELETE /api/documents/:id
export const deleteDocument = async (req: AuthRequest, res: Response) => {
  try {
    const doc = await DocumentModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (doc.uploadedBy.toString() !== req.userId) {
      return res
        .status(403)
        .json({ message: "Only the uploader can delete this document" });
    }

    fs.unlink(path.join(documentsDir(), doc.storedFileName), () => undefined);
    if (doc.signature) {
      fs.unlink(
        path.join(signaturesDir(), path.basename(doc.signature.imageUrl)),
        () => undefined,
      );
    }

    await doc.deleteOne();
    res.status(200).json({ message: "Document deleted" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

// PATCH /api/documents/:id/share   body: { userIds: string[] }
export const updateSharing = async (req: AuthRequest, res: Response) => {
  try {
    const { userIds } = req.body as { userIds: string[] };

    const doc = await DocumentModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (doc.uploadedBy.toString() !== req.userId) {
      return res
        .status(403)
        .json({ message: "Only the uploader can change sharing" });
    }

    doc.set({ sharedWith: Array.isArray(userIds) ? userIds : [] });
    doc.updatedAt = new Date().toISOString();
    await doc.save();

    res.status(200).json(doc);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

// POST /api/documents/:id/signature  (multipart field: "signature")
export const attachSignature = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No signature image uploaded" });
    }

    const doc = await DocumentModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (doc.uploadedBy.toString() !== req.userId) {
      return res
        .status(403)
        .json({ message: "You can only sign your own documents" });
    }

    // Replacing a signature — remove the old image file first.
    if (doc.signature) {
      fs.unlink(
        path.join(signaturesDir(), path.basename(doc.signature.imageUrl)),
        () => undefined,
      );
    }

    doc.signature = {
      imageUrl: `${SIGNATURES_URL_PREFIX}/${req.file.filename}`,
      signedAt: new Date().toISOString(),
    };
    doc.status = "signed";
    doc.updatedAt = new Date().toISOString();
    await doc.save();

    res.status(200).json(doc);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

// DELETE /api/documents/:id/signature
export const removeSignature = async (req: AuthRequest, res: Response) => {
  try {
    const doc = await DocumentModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (doc.uploadedBy.toString() !== req.userId) {
      return res
        .status(403)
        .json({ message: "Only the uploader can remove this signature" });
    }

    if (doc.signature) {
      fs.unlink(
        path.join(signaturesDir(), path.basename(doc.signature.imageUrl)),
        () => undefined,
      );
    }

    doc.signature = undefined;
    doc.status = "uploaded";
    doc.updatedAt = new Date().toISOString();
    await doc.save();

    res.status(200).json(doc);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};
