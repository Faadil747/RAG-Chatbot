import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import * as aiService from "../lib/aiService";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { JobIntent } from "../types/candidate";

const NEUTRAL_INTENT: JobIntent = {
  designation: null,
  requiredSkills: [],
  minExperience: null,
  maxExperience: null,
  location: null,
  industry: null,
  education: null,
  availability: null,
  keywords: [],
};

const createJobSchema = z.object({
  title: z.string().trim().min(1, "title is required"),
  description: z.string().trim().min(1, "description is required"),
});

export const createJob = asyncHandler(async (req, res) => {
  const { title, description } = createJobSchema.parse(req.body);

  // Job creation must not hard-fail if ai-service/the LLM is down: jobId is
  // required on every candidate upload now, so blocking job creation here
  // would fully block uploads too. Fall back to a neutral intent (every
  // Ranking Agent sub-score becomes the "unconstrained" 50) rather than
  // erroring -- a recruiter can still search/reference the job by title.
  let intent: JobIntent = NEUTRAL_INTENT;
  try {
    intent = await aiService.parseJobDescription(description);
  } catch (err) {
    console.warn("[jobs] description parsing failed, falling back to neutral intent:", (err as Error).message);
  }

  const job = await prisma.job.create({
    data: {
      title,
      description,
      intent: intent as unknown as Prisma.InputJsonValue,
    },
  });

  res.status(201).json(job);
});

export const listJobs = asyncHandler(async (_req, res) => {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { candidates: true } } },
  });

  res.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      description: j.description,
      intent: j.intent,
      createdAt: j.createdAt,
      candidateCount: j._count.candidates,
    })),
  });
});

export const getJobById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) {
    throw ApiError.notFound(`Job ${id} not found`);
  }
  res.json(job);
});
