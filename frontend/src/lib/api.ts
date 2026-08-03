import type {
  Candidate,
  CandidateListFilters,
  CandidateListResponse,
  ChatHistoryResponse,
  ChatResponse,
  Job,
  JobListResponse,
  Justification,
  SearchResponse,
  UploadResponse,
} from '@/types';

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const data = (await res.json()) as { message?: string; error?: string };
      message = data.message ?? data.error ?? message;
    } catch {
      // response had no JSON body — fall back to default message
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export function uploadCandidates(files: File[], jobId: string): Promise<UploadResponse> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  formData.append('jobId', jobId);
  return request<UploadResponse>('/candidates/upload', {
    method: 'POST',
    body: formData,
  });
}

export function listCandidates(filters: CandidateListFilters): Promise<CandidateListResponse> {
  const qs = buildQueryString({
    search: filters.search,
    skills: filters.skills && filters.skills.length > 0 ? filters.skills.join(',') : undefined,
    experienceMin: filters.experienceMin,
    experienceMax: filters.experienceMax,
    location: filters.location,
    designation: filters.designation,
    availability: filters.availability,
    page: filters.page,
    pageSize: filters.pageSize,
  });
  return request<CandidateListResponse>(`/candidates${qs}`);
}

export function getCandidate(id: string): Promise<Candidate> {
  return request<Candidate>(`/candidates/${id}`);
}

export function getResumeDownloadUrl(id: string): string {
  return `${API_BASE_URL}/candidates/${id}/resume`;
}

export function deleteCandidate(id: string): Promise<{ success: true }> {
  return request<{ success: true }>(`/candidates/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export function listJobs(): Promise<JobListResponse> {
  return request<JobListResponse>('/jobs');
}

export function createJob(title: string, description: string): Promise<Job> {
  return request<Job>('/jobs', {
    method: 'POST',
    body: JSON.stringify({ title, description }),
  });
}

export function getJob(id: string): Promise<Job> {
  return request<Job>(`/jobs/${id}`);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function searchCandidates(query: string): Promise<SearchResponse> {
  return request<SearchResponse>('/search', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export function getSearchAnalysis(query: string, candidateId: string): Promise<Justification> {
  return request<Justification>('/search/analysis', {
    method: 'POST',
    body: JSON.stringify({ query, candidateId }),
  });
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export function sendChatMessage(
  sessionId: string | null,
  message: string
): Promise<ChatResponse> {
  return request<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify({ sessionId, message }),
  });
}

export function getChatHistory(sessionId: string): Promise<ChatHistoryResponse> {
  return request<ChatHistoryResponse>(`/chat/${sessionId}/history`);
}
