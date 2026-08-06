import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchResultCard } from '@/components/search/SearchResultCard';
import { getSearchAnalysis } from '@/lib/api';
import type { Justification, SearchResult } from '@/types';

interface ChatSearchResultsProps {
  results: SearchResult[];
  query: string;
}

const TOP_COUNT = 3;

/**
 * Renders a chat turn's search results the same way the Search page does --
 * same SearchResultCard (score, breakdown-driven summary, freshness badge,
 * justification) -- but collapsed to the top 3 by default with a "Show
 * more" toggle for the remaining ranks, since a chat bubble showing all 10
 * full cards at once would overwhelm the conversation.
 */
export function ChatSearchResults({ results, query }: ChatSearchResultsProps) {
  const [expanded, setExpanded] = useState(false);
  const [analysisCache, setAnalysisCache] = useState<Record<string, Justification>>({});
  const [analysisLoadingId, setAnalysisLoadingId] = useState<string | null>(null);

  const topResults = results.slice(0, TOP_COUNT);
  const restResults = results.slice(TOP_COUNT);

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
    <div className="flex w-full flex-col gap-3">
      {topResults.map((result) => (
        <SearchResultCard
          key={result.candidateId}
          result={result}
          cachedAnalysis={analysisCache[result.candidateId]}
          isAnalysisLoading={analysisLoadingId === result.candidateId}
          onGenerateAnalysis={handleGenerateAnalysis}
        />
      ))}

      {restResults.length > 0 && !expanded && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setExpanded(true)}>
          <ChevronDown className="h-3.5 w-3.5" /> Show {restResults.length} more match
          {restResults.length === 1 ? '' : 'es'}
        </Button>
      )}

      {expanded &&
        restResults.map((result) => (
          <SearchResultCard
            key={result.candidateId}
            result={result}
            cachedAnalysis={analysisCache[result.candidateId]}
            isAnalysisLoading={analysisLoadingId === result.candidateId}
            onGenerateAnalysis={handleGenerateAnalysis}
          />
        ))}

      {expanded && restResults.length > 0 && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setExpanded(false)}>
          <ChevronUp className="h-3.5 w-3.5" /> Show less
        </Button>
      )}
    </div>
  );
}
