// Shapes shared with the ai-service contract. Kept in one place so
// controllers/services can share consistent typing without re-declaring
// the same interfaces.

export interface Skills {
  primary: string[];
  secondary: string[];
}

export interface ExperienceEntry {
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  durationMonths: number;
  description: string;
}

export interface EducationEntry {
  institution: string;
  degree: string;
  field: string;
  year: string;
}

export interface ProjectEntry {
  name: string;
  description: string;
  techStack: string[];
}

/**
 * Full candidate object as returned by ai-service `POST /ai/parse`.
 * Notably missing `resumeFileUrl`, `uploadedAt`, `fileName` — those are
 * filled in by this backend before persistence.
 */
export interface ParsedCandidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  currentRole: string;
  location: string;
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
  totalExperienceYears: number;
  availability: string;
  overallRating: number;
  skills: Skills;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  projects: ProjectEntry[];
  certifications: string[];
  languages: string[];
  previousCompanies: string[];
  aiSummary: string;
  careerHighlights: string[];
  strengths: string[];
  weaknesses: string[];
  suitableRoles: string[];
  technologyStack: string[];
  resumeText: string;
}

/** Full candidate record as persisted / returned by this backend. */
export interface Candidate extends ParsedCandidate {
  fileName: string;
  resumeFileUrl: string;
  uploadedAt: Date | string;
}

/** Projected subset used in list views and search results. */
export interface CandidateSummary {
  id: string;
  name: string;
  currentRole: string;
  totalExperienceYears: number;
  location: string;
  topSkills: string[];
  aiSummary: string;
  overallRating: number;
  uploadedAt: Date | string;
  availability: string;
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
  breakdown: {
    skillMatch: number;
    experienceMatch: number;
    designationMatch: number;
    industryMatch: number;
    educationMatch: number;
    technologyMatch: number;
    freshnessScore: number;
  };
  candidate: CandidateSummary;
  justification: Justification | null;
}

export interface SearchResponse {
  query: string;
  totalMatches: number;
  results: SearchResult[];
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
  suggestions: string[];
  candidateIds: string[];
  candidates: CandidateSummary[];
}
