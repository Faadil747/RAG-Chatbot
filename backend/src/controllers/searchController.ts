import { z } from "zod";
import * as aiService from "../lib/aiService";
import { asyncHandler } from "../utils/asyncHandler";

const searchBodySchema = z.object({
  query: z.string().trim().min(1, "query is required"),
});

export const searchCandidates = asyncHandler(async (req, res) => {
  const { query } = searchBodySchema.parse(req.body);
  const result = await aiService.search(query, 10);
  res.json(result);
});

const analysisBodySchema = z.object({
  query: z.string().trim().min(1, "query is required"),
  candidateId: z.string().trim().min(1, "candidateId is required"),
});

export const searchCandidateAnalysis = asyncHandler(async (req, res) => {
  const { query, candidateId } = analysisBodySchema.parse(req.body);
  const result = await aiService.searchAnalysis(query, candidateId);
  res.json(result);
});
