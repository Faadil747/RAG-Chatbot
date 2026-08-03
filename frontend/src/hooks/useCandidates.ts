import { useEffect, useState } from 'react';
import { listCandidates, ApiError } from '@/lib/api';
import type { CandidateListFilters, CandidateSummary } from '@/types';

interface UseCandidatesResult {
  candidates: CandidateSummary[];
  total: number;
  isLoading: boolean;
  error: string | null;
}

/** Fetches the paginated candidate list, refetching whenever filters change (debounced). */
export function useCandidates(filters: CandidateListFilters): UseCandidatesResult {
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Serialize filters so the effect only re-runs on meaningful changes.
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const handle = setTimeout(() => {
      listCandidates(filters)
        .then((res) => {
          if (cancelled) return;
          setCandidates(res.candidates);
          setTotal(res.total);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof ApiError ? err.message : 'Failed to load candidates.');
          setCandidates([]);
          setTotal(0);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  return { candidates, total, isLoading, error };
}
