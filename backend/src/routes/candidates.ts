import { Router } from "express";
import { uploadResumes } from "../middleware/upload";
import * as candidatesController from "../controllers/candidatesController";

const router = Router();

router.post("/candidates/upload", uploadResumes.array("files"), candidatesController.uploadCandidates);
router.get("/candidates", candidatesController.listCandidates);
router.get("/candidates/:id", candidatesController.getCandidateById);
router.get("/candidates/:id/resume", candidatesController.downloadResume);
router.delete("/candidates/:id", candidatesController.deleteCandidate);

export default router;
