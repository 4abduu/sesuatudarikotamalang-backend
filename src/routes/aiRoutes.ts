import express from "express";
import { requireAuth } from "../middleware/authMiddleware";
import aiController from "../controllers/aiController";

const router = express.Router();

router.post("/story-draft", requireAuth, aiController.storyDraft);

export default router;
