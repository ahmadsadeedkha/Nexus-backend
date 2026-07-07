import multer, { FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { Request } from "express";

// Stored as a sibling of src/dist at the project root, not inside either —
// process.cwd() is the project root regardless of dev (ts-node-dev) or
// prod (node dist/server.js), since both are run from the project root.
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const DOCUMENTS_DIR = path.join(UPLOAD_ROOT, "documents");
const SIGNATURES_DIR = path.join(UPLOAD_ROOT, "signatures");

// Multer needs these directories to exist up front — it won't create them.
[DOCUMENTS_DIR, SIGNATURES_DIR].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

export const DOCUMENTS_URL_PREFIX = "/uploads/documents";
export const SIGNATURES_URL_PREFIX = "/uploads/signatures";

const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
]);

const ALLOWED_SIGNATURE_TYPES = new Set(["image/png", "image/jpeg"]);

const makeStorage = (destination: string) =>
  multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destination),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });

const makeFileFilter =
  (allowed: Set<string>) =>
  (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (allowed.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type"));
    }
  };

export const uploadDocument = multer({
  storage: makeStorage(DOCUMENTS_DIR),
  fileFilter: makeFileFilter(ALLOWED_DOCUMENT_TYPES),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

export const uploadSignature = multer({
  storage: makeStorage(SIGNATURES_DIR),
  fileFilter: makeFileFilter(ALLOWED_SIGNATURE_TYPES),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});
