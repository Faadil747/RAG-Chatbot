import { useCallback, useEffect, useState } from 'react';
import { createJob as createJobApi, listJobs, ApiError } from '@/lib/api';
import type { Job } from '@/types';

interface UseJobsResult {
  jobs: Job[];
  isLoading: boolean;
  error: string | null;
  isCreating: boolean;
  createJob: (title: string, description: string) => Promise<Job>;
  refresh: () => void;
}

/** Fetches + creates Jobs. Mirrors the plain useEffect/useState pattern used by useCandidates. */
export function useJobs(): UseJobsResult {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listJobs()
      .then((res) => {
        if (cancelled) return;
        setJobs(res.jobs);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Failed to load jobs.');
        setJobs([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  const createJob = useCallback(async (title: string, description: string) => {
    setIsCreating(true);
    try {
      const job = await createJobApi(title, description);
      setJobs((prev) => [job, ...prev]);
      return job;
    } finally {
      setIsCreating(false);
    }
  }, []);

  return { jobs, isLoading, error, isCreating, createJob, refresh };
}
