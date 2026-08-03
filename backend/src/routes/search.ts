import { Router } from "express";
import * as searchController from "../controllers/searchController";

const router = Router();

router.post("/search", searchController.searchCandidates);
router.post("/search/analysis", searchController.searchCandidateAnalysis);

export default router;
