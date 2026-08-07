// Shared domain types for the AI-Powered Candidate Search Platform frontend.
// These mirror the backend API contract exactly (camelCase everywhere).

export interface CandidateSummary {
  id: string;
  name: string;
  currentRole: string;
  totalExperienceYears: number;
  location: string;
  topSkills: string[];
  aiSummary: string;
  overallRating: number;
  uploadedAt: string;
  availability: string;
  jobId: string | null;
  jobTitle: string | null;
  jobMatchScore: number | null;
}

export interface Experience {
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  durationMonths: number;
  description: string;
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  year: string;
}

export interface Project {
  name: string;
  description: string;
  techStack: string[];
}

export interface Candidate extends CandidateSummary {
  fileName: string;
  resumeFileUrl: string;
  email: string;
  phone: string;
  linkedin?: string | null;
  github?: string | null;
  portfolio?: string | null;
  skills: {
    primary: string[];
    secondary: string[];
  };
  experience: Experience[];
  education: Education[];
  projects: Project[];
  certifications: string[];
  languages: string[];
  previousCompanies: string[];
  careerHighlights: string[];
  strengths: string[];
  weaknesses: string[];
  suitableRoles: string[];
  technologyStack: string[];
  resumeText: string;
  jobMatchBreakdown: ScoreBreakdown | null;
}

export interface ScoreBreakdown {
  skillMatch: number;
  experienceMatch: number;
  designationMatch: number;
  industryMatch: number;
  educationMatch: number;
  technologyMatch: number;
  locationMatch: number;
  availabilityMatch: number;
  freshnessScore: number;
}

export interface JobIntent {
  designation: string | null;
  requiredSkills: string[];
  minExperience: number | null;
  maxExperience: number | null;
  location: string | null;
  industry: string | null;
  education: string | null;
  availability: string | null;
  keywords: string[];
}

export interface Job {
  id: string;
  title: string;
  description: string;
  intent: JobIntent;
  createdAt: string;
  candidateCount?: number;
}

export interface JobListResponse {
  jobs: Job[];
}

export interface Justification {
  matchingSkills: string[];
  relevantExperience: string;
  strongPoints: string[];
  potentialConcerns: string[];
  recommendation: string;
}

export interface SearchResult {
  candidateId: string;
  rank: number;
  matchScore: number;
  breakdown: ScoreBreakdown;
  candidate: CandidateSummary;
  justification: Justification | null;
}

export type ScoreBreakdownKey = keyof ScoreBreakdown;

export interface SearchResponse {
  query: string;
  totalMatches: number;
  results: SearchResult[];
}

export interface AnalyticsResponse {
  total: number;
  averageExperienceYears: number | null;
  medianExperienceYears: number | null;
  minExperienceYears: number | null;
  maxExperienceYears: number | null;
  topSkills: [string, number][];
  topRoles: [string, number][];
  topLocations: [string, number][];
  availabilityBreakdown: [string, number][];
  jobBreakdown: [string, number][];
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
  suggestions: string[];
  candidateIds: string[];
  candidates: CandidateSummary[];
  query?: string | null;
  results?: SearchResult[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  suggestions?: string[];
  candidates?: CandidateSummary[];
  query?: string;
  results?: SearchResult[];
}

export interface ChatHistoryResponse {
  sessionId: string;
  messages: ChatMessage[];
}

export interface CandidateListResponse {
  candidates: CandidateSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UploadResultItem {
  fileName: string;
  status: 'success' | 'error';
  candidateId?: string;
  error?: string;
}

export interface UploadResponse {
  results: UploadResultItem[];
}

export interface CandidateListFilters {
  search?: string;
  skills?: string[];
  experienceMin?: number;
  experienceMax?: number;
  location?: string;
  designation?: string;
  availability?: string;
  page?: number;
  pageSize?: number;
}
