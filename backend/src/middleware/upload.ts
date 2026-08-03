import multer from "multer";
import path from "path";
import { ApiError } from "../utils/ApiError";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB per file
const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx"]);

// Files are held in memory only long enough to forward to the ai-service
// and, on success, write to disk under `${candidateId}${ext}`. Nothing is
// persisted at the multer layer itself.
const storage = multer.memoryStorage();

export const uploadResumes = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 20,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(
        ApiError.badRequest(
          `Unsupported file type "${ext || "unknown"}" for "${file.originalname}". Allowed: .pdf, .doc, .docx`
        )
      );
      return;
    }
    cb(null, true);
  },
});

export { MAX_FILE_SIZE_BYTES, ALLOWED_EXTENSIONS };
