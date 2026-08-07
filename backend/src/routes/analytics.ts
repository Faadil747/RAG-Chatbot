import { Router } from "express";
import * as analyticsController from "../controllers/analyticsController";

const router = Router();

router.get("/analytics", analyticsController.getAnalytics);

export default router;
