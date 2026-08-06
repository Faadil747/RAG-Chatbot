import { create } from 'zustand';
import type { Justification, SearchResponse } from '@/types';

interface CandidateSearchState {
    query: string;
    hasSearched: boolean;
    isSearching: boolean;
    error: string | null;
    response: SearchResponse | null;
    analysisCache: Record<string, Justification>;
    analysisLoadingId: string | null;
    setQuery: (query: string) => void;
    setSearching: (isSearching: boolean) => void;
    setError: (error: string | null) => void;
    setResponse: (response: SearchResponse | null) => void;
    markSearched: () => void;
    resetAnalysis: () => void;
    setAnalysisLoadingId: (candidateId: string | null) => void;
    cacheAnalysis: (candidateId: string, justification: Justification) => void;
}

// Intentionally not persisted to localStorage: this keeps the search page intact
// while navigating between app tabs/routes, but a browser refresh starts clean as requested.
export const useCandidateSearchStore = create<CandidateSearchState>((set) => ({
    query: '',
    hasSearched: false,
    isSearching: false,
    error: null,
    response: null,
    analysisCache: {},
    analysisLoadingId: null,
    setQuery: (query) => set({ query }),
    setSearching: (isSearching) => set({ isSearching }),
    setError: (error) => set({ error }),
    setResponse: (response) => set({ response }),
    markSearched: () => set({ hasSearched: true }),
    resetAnalysis: () => set({ analysisCache: {}, analysisLoadingId: null }),
    setAnalysisLoadingId: (analysisLoadingId) => set({ analysisLoadingId }),
    cacheAnalysis: (candidateId, justification) =>
        set((state) => ({
            analysisCache: { ...state.analysisCache, [candidateId]: justification },
        })),
}));