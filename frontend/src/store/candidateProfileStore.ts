import { create } from 'zustand';

interface CandidateProfileState {
  openCandidateId: string | null;
  openProfile: (candidateId: string) => void;
  closeProfile: () => void;
}

/**
 * Global store so any component (table row, search result card, chat chip,
 * floating assistant, ...) can open the shared candidate profile Sheet
 * without prop-drilling.
 */
export const useCandidateProfileStore = create<CandidateProfileState>((set) => ({
  openCandidateId: null,
  openProfile: (candidateId) => set({ openCandidateId: candidateId }),
  closeProfile: () => set({ openCandidateId: null }),
}));
