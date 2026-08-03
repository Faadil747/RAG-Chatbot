import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import * as aiService from "../lib/aiService";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";

const chatBodySchema = z.object({
  sessionId: z.string().trim().min(1).nullable(),
  message: z.string().trim().min(1, "message is required"),
});

export const postChat = asyncHandler(async (req, res) => {
  const { sessionId, message } = chatBodySchema.parse(req.body);

  // ai-service owns the conversation: it mints a sessionId when null is
  // passed and produces the reply/suggestions/candidates.
  const result = await aiService.chat(sessionId, message);

  // Persist the session + both messages for history replay. This is
  // treated as best-effort relative to the response: the ai-service call
  // already succeeded and produced a real reply for the user, so a DB
  // hiccup here is logged rather than turned into a 5xx for a reply the
  // user has effectively already received.
  try {
    await prisma.chatSession.upsert({
      where: { id: result.sessionId },
      update: {},
      create: { id: result.sessionId },
    });

    await prisma.chatMessage.create({
      data: {
        sessionId: result.sessionId,
        role: "user",
        content: message,
      },
    });

    await prisma.chatMessage.create({
      data: {
        sessionId: result.sessionId,
        role: "assistant",
        content: result.reply,
        suggestions: (result.suggestions ?? []) as unknown as Prisma.InputJsonValue,
        candidateIds: (result.candidateIds ?? []) as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.warn("[chat] failed to persist chat history:", (err as Error).message);
  }

  res.json(result);
});

export const getChatHistory = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw ApiError.notFound(`Chat session ${sessionId} not found`);
  }

  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });

  res.json({
    sessionId,
    // `candidates` is intentionally left as [] here: we only persist
    // candidateIds per message, not full CandidateSummary snapshots.
    // Re-hydrating full summaries for every historical message would mean
    // an extra DB round trip per id on every history load, for a
    // read-only scrollback view that generally doesn't need it. Callers
    // that need full candidate data for a historical message can fetch
    // GET /api/candidates/:id per id.
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      suggestions: m.suggestions ?? [],
      candidates: [] as unknown[],
    })),
  });
});
