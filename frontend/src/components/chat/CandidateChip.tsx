import { MapPin } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { ScoreBadge } from '@/components/candidate/ScoreBadge';
import { useCandidateProfileStore } from '@/store/candidateProfileStore';
import type { CandidateSummary } from '@/types';

interface CandidateChipProps {
  candidate: CandidateSummary;
}

export function CandidateChip({ candidate }: CandidateChipProps) {
  const openProfile = useCandidateProfileStore((s) => s.openProfile);

  return (
    <button
      type="button"
      onClick={() => openProfile(candidate.id)}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-secondary"
    >
      <Avatar name={candidate.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{candidate.name}</p>
        <p className="truncate text-xs text-muted-foreground">{candidate.currentRole}</p>
        <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <MapPin className="h-2.5 w-2.5" /> {candidate.location}
        </p>
      </div>
      <ScoreBadge score={candidate.overallRating} size="sm" />
    </button>
  );
}
