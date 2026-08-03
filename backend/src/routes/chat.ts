import { Router } from "express";
import * as chatController from "../controllers/chatController";

const router = Router();

router.post("/chat", chatController.postChat);
router.get("/chat/:sessionId/history", chatController.getChatHistory);

export default router;
