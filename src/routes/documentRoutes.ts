import { Router } from "express";
import { protect } from "../middleware/authMiddleware";
import { uploadDocument, uploadSignature } from "../middleware/upload";
import {
  uploadDocumentHandler,
  getDocuments,
  getDocumentById,
  reuploadDocument,
  deleteDocument,
  updateSharing,
  attachSignature,
  removeSignature,
} from "../controllers/documentController";

const router = Router();

router.post("/", protect, uploadDocument.single("file"), uploadDocumentHandler);
router.get("/", protect, getDocuments);
router.get("/:id", protect, getDocumentById);
router.put("/:id", protect, uploadDocument.single("file"), reuploadDocument);
router.delete("/:id", protect, deleteDocument);
router.patch("/:id/share", protect, updateSharing);
router.post(
  "/:id/signature",
  protect,
  uploadSignature.single("signature"),
  attachSignature,
);
router.delete("/:id/signature", protect, removeSignature);

export default router;
