import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Search, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchResultCard } from '@/components/search/SearchResultCard';
import { searchCandidates, getSearchAnalysis, ApiError } from '@/lib/api';
import type { Justification, SearchResponse } from '@/types';

const EXAMPLE_QUERIES = [
  'Python Developers with 5 years experience',
  'React Developers in Chennai',
  'Immediate joiners',
  'Senior backend engineers who know AWS and Kubernetes',
  'Product designers with fintech experience',
];

export default function CandidateSearch() {
  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);

  const [analysisCache, setAnalysisCache] = useState<Record<string, Justification>>({});
  const [analysisLoadingId, setAnalysisLoadingId] = useState<string | null>(null);

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed || isSearching) return;
    setQuery(trimmed);
    setIsSearching(true);
    setError(null);
    setHasSearched(true);
    setAnalysisCache({});

    try {
      const res = await searchCandidates(trimmed);
      setResponse(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed. Please try again.');
      setResponse(null);
    } finally {
      setIsSearching(false);
    }
  }

  async function handleGenerateAnalysis(candidateId: string) {
    if (analysisCache[candidateId] || analysisLoadingId) return;
    setAnalysisLoadingId(candidateId);
    try {
      const justification = await getSearchAnalysis(query, candidateId);
      setAnalysisCache((prev) => ({ ...prev, [candidateId]: justification }));
    } catch {
      // Silently ignore — the button remains visible so the recruiter can retry.
    } finally {
      setAnalysisLoadingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Search Candidates with AI</h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
          Describe who you're looking for in plain English — our AI ranks and explains the best matches.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(query);
        }}
        className="mb-4 flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Senior React developers in Bangalore with 6+ years experience"
            className="h-12 pl-11 text-sm"
          />
        </div>
        <Button type="submit" size="lg" disabled={isSearching || !query.trim()}>
          {isSearching ? 'Searching…' : 'Search'}
        </Button>
      </form>

      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {EXAMPLE_QUERIES.map((example) => (
          <button
            key={example}
            onClick={() => void runSearch(example)}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            {example}
          </button>
        ))}
      </div>

      {!hasSearched && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <Search className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">Start by describing your ideal candidate</p>
            <p className="mt-1 text-xs text-muted-foreground">Try one of the example searches above.</p>
          </div>
        </div>
      )}

      {isSearching && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!isSearching && error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 py-12 text-center"
        >
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm font-medium text-destructive">{error}</p>
        </motion.div>
      )}

      {!isSearching && !error && hasSearched && response && response.results.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <Search className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">No matching candidates found</p>
            <p className="mt-1 text-xs text-muted-foreground">Try a broader or differently worded search.</p>
          </div>
        </div>
      )}

      {!isSearching && !error && response && response.results.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs font-medium text-muted-foreground">
            {response.totalMatches} match{response.totalMatches === 1 ? '' : 'es'} for "{response.query}"
          </p>
          {response.results.map((result) => (
            <SearchResultCard
              key={result.candidateId}
              result={result}
              cachedAnalysis={analysisCache[result.candidateId]}
              isAnalysisLoading={analysisLoadingId === result.candidateId}
              onGenerateAnalysis={handleGenerateAnalysis}
            />
          ))}
        </div>
      )}
    </div>
  );
}
