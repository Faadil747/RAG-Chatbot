import { motion } from 'framer-motion';
import { Loader2, MapPin, MessageSquareText, Sparkles, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { ScoreBadge } from '@/components/candidate/ScoreBadge';
import { SkillBadges } from '@/components/candidate/SkillBadges';
import { JustificationPanel } from '@/components/search/JustificationPanel';
import { useCandidateProfileStore } from '@/store/candidateProfileStore';
import type { Justification, SearchResult } from '@/types';

interface SearchResultCardProps {
  result: SearchResult;
  cachedAnalysis: Justification | null | undefined;
  isAnalysisLoading: boolean;
  onGenerateAnalysis: (candidateId: string) => void;
}

export function SearchResultCard({
  result,
  cachedAnalysis,
  isAnalysisLoading,
  onGenerateAnalysis,
}: SearchResultCardProps) {
  const openProfile = useCandidateProfileStore((s) => s.openProfile);
  const navigate = useNavigate();
  const { candidate } = result;
  const isTopThree = result.rank <= 3;
  const justificationToShow = isTopThree ? result.justification : cachedAnalysis;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(result.rank, 10) * 0.04 }}
    >
      <Card className={isTopThree ? 'border-primary/30 p-5 shadow-soft-lg' : 'p-5'}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1">
              <span
                className={
                  isTopThree
                    ? 'flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground'
                    : 'flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground'
                }
              >
                {result.rank}
              </span>
            </div>
            <Avatar name={candidate.name} size="md" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{candidate.name}</h3>
                {isTopThree && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    <Sparkles className="h-2.5 w-2.5" /> Top Match
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{candidate.currentRole}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {candidate.location}
                </span>
                <span>{candidate.totalExperienceYears} yrs experience</span>
              </div>
            </div>
          </div>
          <ScoreBadge score={result.matchScore} size="lg" />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{candidate.aiSummary}</p>

        <div className="mt-3">
          <SkillBadges skills={candidate.topSkills} max={6} variant="outline" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => openProfile(candidate.id)}>
            View Profile
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate(`/chatbot?candidateId=${candidate.id}`)}>
            <MessageSquareText className="h-3.5 w-3.5" /> Open Chat
          </Button>
          {!isTopThree && !justificationToShow && (
            <Button size="sm" onClick={() => onGenerateAnalysis(candidate.id)} disabled={isAnalysisLoading}>
              {isAnalysisLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Wand2 className="h-3.5 w-3.5" /> Generate AI Analysis
                </>
              )}
            </Button>
          )}
        </div>

        {justificationToShow && <JustificationPanel justification={justificationToShow} />}
      </Card>
    </motion.div>
  );
}
