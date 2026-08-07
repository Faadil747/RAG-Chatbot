import * as aiService from "../lib/aiService";
import { asyncHandler } from "../utils/asyncHandler";

export const getAnalytics = asyncHandler(async (_req, res) => {
  const data = await aiService.getAnalytics();
  res.json(data);
});
