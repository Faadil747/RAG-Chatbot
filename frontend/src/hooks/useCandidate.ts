import { useEffect, useState } from 'react';
import { getCandidate, ApiError } from '@/lib/api';
import type { Candidate } from '@/types';

interface UseCandidateResult {
  candidate: Candidate | null;
  isLoading: boolean;
  error: string | null;
}

export function useCandidate(candidateId: string | null): UseCandidateResult {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!candidateId) {
      setCandidate(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setCandidate(null);

    getCandidate(candidateId)
      .then((data) => {
        if (!cancelled) setCandidate(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load candidate profile.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  return { candidate, isLoading, error };
}
