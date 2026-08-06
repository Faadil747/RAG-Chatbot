import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import * as aiService from "../lib/aiService";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { ALLOWED_EXTENSIONS } from "../middleware/upload";
import { CandidateSummary, JobIntent } from "../types/candidate";
import { formatErrorMessage } from "../utils/formatError";

function toSummary(candidate: {
  id: string;
  name: string;
  currentRole: string;
  totalExperienceYears: number;
  location: string;
  skills: Prisma.JsonValue;
  aiSummary: string;
  overallRating: number;
  uploadedAt: Date;
  availability: string;
  jobId: string | null;
  jobMatchScore: number | null;
  job?: { title: string } | null;
}): CandidateSummary {
  const skills = (candidate.skills ?? {}) as { primary?: string[]; secondary?: string[] };
  return {
    id: candidate.id,
    name: candidate.name,
    currentRole: candidate.currentRole,
    totalExperienceYears: candidate.totalExperienceYears,
    location: candidate.location,
    topSkills: Array.isArray(skills.primary) ? skills.primary.slice(0, 6) : [],
    aiSummary: candidate.aiSummary,
    overallRating: candidate.overallRating,
    uploadedAt: candidate.uploadedAt,
    availability: candidate.availability,
    jobId: candidate.jobId,
    jobTitle: candidate.job?.title ?? null,
    jobMatchScore: candidate.jobMatchScore,
  };
}

/** Locates the resume file on disk for a candidate without listing the
 * whole uploads directory — the file was written as `${id}${ext}` where
 * ext is one of the allowed upload extensions. */
async function findResumeFileOnDisk(candidateId: string): Promise<string | null> {
  for (const ext of ALLOWED_EXTENSIONS) {
    const candidatePath = path.join(env.uploadDir, `${candidateId}${ext}`);
    try {
      await fs.access(candidatePath);
      return candidatePath;
    } catch {
      // try next extension
    }
  }
  return null;
}

type UploadResult =
  | { fileName: string; status: "success"; candidateId: string }
  | { fileName: string; status: "error"; error: string };

const uploadBodySchema = z.object({
  jobId: z.string().trim().min(1, "jobId is required — select a job before uploading resumes"),
});

export const uploadCandidates = asyncHandler(async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    throw ApiError.badRequest('No files uploaded. Use multipart field name "files".');
  }

  const { jobId } = uploadBodySchema.parse(req.body);
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw ApiError.notFound(`Job ${jobId} not found`);
  }

  const results: UploadResult[] = await Promise.all(
    files.map(async (file): Promise<UploadResult> => {
      try {
        const parsed = await aiService.parseResume(file.buffer, file.originalname, file.mimetype);
        const uploadedAt = new Date();

        // Job-fit scoring is best-effort, same as indexing below: the
        // candidate is a real, successfully-parsed resume either way, so an
        // ai-service hiccup on this deterministic scoring step shouldn't
        // fail the whole upload -- it only means the score is temporarily
        // absent until the candidate is re-scored.
        let jobMatchScore: number | null = null;
        let jobMatchBreakdown: Prisma.InputJsonValue | undefined = undefined;
        try {
          const score = await aiService.scoreCandidateForJob(
            { ...parsed, uploadedAt: uploadedAt.toISOString() },
            job.intent as unknown as JobIntent
          );
          jobMatchScore = score.matchScore;
          jobMatchBreakdown = score.breakdown as unknown as Prisma.InputJsonValue;
        } catch (scoreErr) {
          console.warn(
            `[upload] job scoring failed for candidate ${parsed.id} (${file.originalname}):`,
            (scoreErr as Error).message
          );
        }

        const ext = path.extname(file.originalname) || path.extname(parsed.name) || "";
        const diskPath = path.join(env.uploadDir, `${parsed.id}${ext}`);
        await fs.writeFile(diskPath, file.buffer);

        const resumeFileUrl = `/api/candidates/${parsed.id}/resume`;

        const created = await prisma.candidate.create({
          data: {
            id: parsed.id,
            fileName: file.originalname,
            resumeFileUrl,
            uploadedAt,
            name: parsed.name,
            email: parsed.email,
            phone: parsed.phone,
            currentRole: parsed.currentRole,
            location: parsed.location,
            linkedin: parsed.linkedin ?? null,
            github: parsed.github ?? null,
            portfolio: parsed.portfolio ?? null,
            totalExperienceYears: parsed.totalExperienceYears,
            availability: parsed.availability ?? "Not Specified",
            overallRating: parsed.overallRating,
            skills: parsed.skills as unknown as Prisma.InputJsonValue,
            experience: parsed.experience as unknown as Prisma.InputJsonValue,
            education: parsed.education as unknown as Prisma.InputJsonValue,
            projects: parsed.projects as unknown as Prisma.InputJsonValue,
            certifications: parsed.certifications as unknown as Prisma.InputJsonValue,
            languages: parsed.languages as unknown as Prisma.InputJsonValue,
            previousCompanies: parsed.previousCompanies as unknown as Prisma.InputJsonValue,
            aiSummary: parsed.aiSummary,
            careerHighlights: parsed.careerHighlights as unknown as Prisma.InputJsonValue,
            strengths: parsed.strengths as unknown as Prisma.InputJsonValue,
            weaknesses: parsed.weaknesses as unknown as Prisma.InputJsonValue,
            suitableRoles: parsed.suitableRoles as unknown as Prisma.InputJsonValue,
            technologyStack: parsed.technologyStack as unknown as Prisma.InputJsonValue,
            resumeText: parsed.resumeText,
            jobId: job.id,
            jobMatchScore,
            jobMatchBreakdown,
          },
        });

        // Indexing is best-effort: the candidate is already durably
        // persisted above, so a vector-index outage must not fail the
        // whole upload — it only means this candidate is temporarily
        // absent from semantic search until re-indexed.
        try {
          await aiService.indexCandidate({
            ...parsed,
            fileName: created.fileName,
            resumeFileUrl: created.resumeFileUrl,
            uploadedAt: created.uploadedAt,
            // ai-service keeps its own copy of every candidate for RAG
            // grounding, entirely separate from Postgres -- job assignment
            // has to be pushed explicitly or the chatbot's view of "which
            // job is this candidate in" silently goes stale relative to
            // what the recruiter sees in the app.
            jobId: job.id,
            jobTitle: job.title,
            jobMatchScore,
          });
        } catch (indexErr) {
          console.warn(
            `[upload] ai-service indexing failed for candidate ${parsed.id} (${file.originalname}):`,
            (indexErr as Error).message
          );
        }

        return { fileName: file.originalname, status: "success", candidateId: parsed.id };
      } catch (err) {
        console.error(`[upload] failed to process "${file.originalname}":`, err);
        return { fileName: file.originalname, status: "error", error: formatErrorMessage(err) };
      }
    })
  );

  res.status(200).json({ results });
});

const listQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  skills: z.string().trim().min(1).optional(),
  experienceMin: z.coerce.number().optional(),
  experienceMax: z.coerce.number().optional(),
  location: z.string().trim().min(1).optional(),
  designation: z.string().trim().min(1).optional(),
  availability: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listCandidates = asyncHandler(async (req, res) => {
  const {
    search,
    skills,
    experienceMin,
    experienceMax,
    location,
    designation,
    availability,
    page,
    pageSize,
  } = listQuerySchema.parse(req.query);

  const andFilters: Prisma.CandidateWhereInput[] = [];

  if (search) {
    andFilters.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { currentRole: { contains: search, mode: "insensitive" } },
      ],
    });
  }
  if (location) {
    andFilters.push({ location: { contains: location, mode: "insensitive" } });
  }
  if (designation) {
    andFilters.push({ currentRole: { contains: designation, mode: "insensitive" } });
  }
  if (availability) {
    andFilters.push({ availability: { equals: availability } });
  }
  if (experienceMin !== undefined) {
    andFilters.push({ totalExperienceYears: { gte: experienceMin } });
  }
  if (experienceMax !== undefined) {
    andFilters.push({ totalExperienceYears: { lte: experienceMax } });
  }

  // Skills filter: each requested skill must appear in either
  // skills.primary or skills.secondary (AND across skills, OR across the
  // two arrays). Uses Prisma's native Postgres JSON path filtering, which
  // is an exact-value array match (case-sensitive, no substring match) —
  // the practical tradeoff of doing this at the DB level instead of
  // pulling every row into memory to filter case-insensitively.
  const skillList = skills
    ? skills.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  for (const skill of skillList) {
    andFilters.push({
      OR: [
        { skills: { path: ["primary"], array_contains: skill } },
        { skills: { path: ["secondary"], array_contains: skill } },
      ],
    });
  }

  const where: Prisma.CandidateWhereInput = andFilters.length ? { AND: andFilters } : {};

  const [rows, total] = await Promise.all([
    prisma.candidate.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { job: { select: { title: true } } },
    }),
    prisma.candidate.count({ where }),
  ]);

  res.json({
    candidates: rows.map(toSummary),
    total,
    page,
    pageSize,
  });
});

export const getCandidateById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) {
    throw ApiError.notFound(`Candidate ${id} not found`);
  }
  res.json(candidate);
});

const reassignJobSchema = z.object({
  jobId: z.string().trim().min(1, "jobId is required"),
});

/** Re-scores an existing candidate against a (possibly different) job and
 * persists the result -- the same deterministic scoring step upload runs,
 * exposed standalone so a candidate can be moved/rescored after the fact
 * (e.g. bulk-reclassifying candidates that were imported without a specific
 * job). Unlike upload's best-effort scoring, a failure here is surfaced
 * directly to the caller rather than silently falling back to a null score,
 * since this is an explicit, single-candidate action. */
export const reassignCandidateJob = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { jobId } = reassignJobSchema.parse(req.body);

  const [candidate, job] = await Promise.all([
    prisma.candidate.findUnique({ where: { id } }),
    prisma.job.findUnique({ where: { id: jobId } }),
  ]);
  if (!candidate) {
    throw ApiError.notFound(`Candidate ${id} not found`);
  }
  if (!job) {
    throw ApiError.notFound(`Job ${jobId} not found`);
  }

  const { matchScore, breakdown } = await aiService.scoreCandidateForJob(
    { ...candidate, uploadedAt: candidate.uploadedAt.toISOString() },
    job.intent as unknown as JobIntent
  );

  const updated = await prisma.candidate.update({
    where: { id },
    data: {
      jobId: job.id,
      jobMatchScore: matchScore,
      jobMatchBreakdown: breakdown as unknown as Prisma.InputJsonValue,
    },
  });

  // Keep ai-service's own candidate copy in sync -- without this, its
  // RAG-grounded chat/search answers about "which job is this candidate
  // in" silently go stale the moment a candidate is reassigned, since
  // ai-service never round-trips back to Postgres to check. Best-effort:
  // the reassignment itself already succeeded and is the source of truth.
  try {
    await aiService.indexCandidate({
      ...updated,
      uploadedAt: updated.uploadedAt.toISOString(),
      jobId: job.id,
      jobTitle: job.title,
      jobMatchScore: updated.jobMatchScore,
    });
  } catch (indexErr) {
    console.warn(`[reassign] ai-service re-indexing failed for candidate ${id}:`, (indexErr as Error).message);
  }

  res.json({
    id: updated.id,
    jobId: updated.jobId,
    jobMatchScore: updated.jobMatchScore,
    jobMatchBreakdown: updated.jobMatchBreakdown,
  });
});

export const downloadResume = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, fileName: true },
  });
  if (!candidate) {
    throw ApiError.notFound(`Candidate ${id} not found`);
  }

  const filePath = await findResumeFileOnDisk(id);
  if (!filePath) {
    throw ApiError.notFound(`Resume file for candidate ${id} was not found on disk`);
  }

  res.download(filePath, candidate.fileName);
});

export const deleteCandidate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) {
    throw ApiError.notFound(`Candidate ${id} not found`);
  }

  await prisma.candidate.delete({ where: { id } });

  const filePath = await findResumeFileOnDisk(id);
  if (filePath) {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      console.warn(`[delete] failed to remove resume file for ${id}:`, (err as Error).message);
    }
  }

  try {
    await aiService.removeFromIndex(id);
  } catch (err) {
    console.warn(`[delete] ai-service index removal failed for ${id}:`, (err as Error).message);
  }

  res.json({ success: true });
});
