import axios, { AxiosError, AxiosInstance } from "axios";
import FormData from "form-data";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import {
  AnalyticsResponse,
  ChatResponse,
  Justification,
  JobIntent,
  JobMatchBreakdown,
  ParsedCandidate,
  SearchResponse,
} from "../types/candidate";

const client: AxiosInstance = axios.create({
  baseURL: env.aiServiceUrl,
  timeout: 60_000,
});

/**
 * Normalizes any failure talking to the ai-service (network error,
 * timeout, non-2xx response) into a clean 502 ApiError with a helpful
 * message, so route handlers never have to reason about axios internals.
 */
function toApiError(err: unknown, context: string): ApiError {
  if (axios.isAxiosError(err)) {
    const axiosErr = err as AxiosError<{ error?: string; message?: string }>;
    if (axiosErr.response) {
      const data = axiosErr.response.data;
      const detail =
        (typeof data === "object" && data && (data.error || data.message)) ||
        axiosErr.response.statusText ||
        "unknown error";
      return ApiError.badGateway(
        `ai-service ${context} failed (${axiosErr.response.status}): ${detail}`
      );
    }
    if (axiosErr.code === "ECONNABORTED") {
      return ApiError.badGateway(`ai-service ${context} timed out`);
    }
    return ApiError.badGateway(
      `ai-service ${context} unreachable: ${axiosErr.message}`
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return ApiError.badGateway(`ai-service ${context} failed: ${message}`);
}

export async function parseResume(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<ParsedCandidate> {
  try {
    const form = new FormData();
    form.append("file", buffer, {
      filename: originalName,
      contentType: mimeType,
    });
    const { data } = await client.post<ParsedCandidate>("/ai/parse", form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      // Parsing runs 3 sequential LLM calls (parser -> skills -> profile
      // generation) -- give it more headroom than the default 60s used for
      // the mostly single-call search/chat endpoints.
      timeout: 180_000,
    });
    return data;
  } catch (err) {
    throw toApiError(err, "/ai/parse");
  }
}

export async function indexCandidate(candidate: unknown): Promise<void> {
  await client.post("/ai/index", candidate).catch((err) => {
    throw toApiError(err, "/ai/index");
  });
}

export async function removeFromIndex(candidateId: string): Promise<void> {
  await client.delete(`/ai/index/${candidateId}`).catch((err) => {
    throw toApiError(err, `/ai/index/${candidateId}`);
  });
}

export async function search(
  query: string,
  topK = 10
): Promise<SearchResponse> {
  try {
    const { data } = await client.post<SearchResponse>("/ai/search", {
      query,
      topK,
    });
    return data;
  } catch (err) {
    throw toApiError(err, "/ai/search");
  }
}

export async function searchAnalysis(
  query: string,
  candidateId: string
): Promise<Justification> {
  try {
    const { data } = await client.post<Justification>(
      "/ai/search/analysis",
      { query, candidateId }
    );
    return data;
  } catch (err) {
    throw toApiError(err, "/ai/search/analysis");
  }
}

export async function parseJobDescription(description: string): Promise<JobIntent> {
  try {
    const { data } = await client.post<JobIntent>("/ai/jobs/parse", { description });
    return data;
  } catch (err) {
    throw toApiError(err, "/ai/jobs/parse");
  }
}

export async function scoreCandidateForJob(
  candidate: unknown,
  intent: JobIntent
): Promise<{ matchScore: number; breakdown: JobMatchBreakdown }> {
  try {
    const { data } = await client.post<{ matchScore: number; breakdown: JobMatchBreakdown }>(
      "/ai/jobs/score",
      { candidate, intent }
    );
    return data;
  } catch (err) {
    throw toApiError(err, "/ai/jobs/score");
  }
}

export async function chat(
  sessionId: string | null,
  message: string
): Promise<ChatResponse> {
  try {
    const { data } = await client.post<ChatResponse>(
      "/ai/chat",
      { sessionId, message },
      // A chat turn can involve several sequential LLM calls (intent
      // parsing, reference resolution, justification, the reply itself),
      // each of which may need ai-service's own slow-provider retry --
      // give it the same headroom as /ai/parse rather than the 60s default,
      // which a single retried call alone can approach.
      { timeout: 180_000 }
    );
    return data;
  } catch (err) {
    throw toApiError(err, "/ai/chat");
  }
}

export async function getAnalytics(): Promise<AnalyticsResponse> {
  try {
    const { data } = await client.get<AnalyticsResponse>("/ai/analytics");
    return data;
  } catch (err) {
    throw toApiError(err, "/ai/analytics");
  }
}
