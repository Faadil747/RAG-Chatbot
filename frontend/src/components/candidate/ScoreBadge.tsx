import { cn, getScoreBand, scoreBandClasses } from '@/lib/utils';

interface ScoreBadgeProps {
  score: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses: Record<NonNullable<ScoreBadgeProps['size']>, string> = {
  sm: 'h-6 px-2 text-[11px]',
  md: 'h-7 px-2.5 text-xs',
  lg: 'h-9 px-3.5 text-sm',
};

export function ScoreBadge({ score, className, size = 'md' }: ScoreBadgeProps) {
  const band = getScoreBand(score);
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-full border font-semibold tabular-nums',
        sizeClasses[size],
        scoreBandClasses(band),
        className
      )}
    >
      {Math.round(score)}
      <span className="opacity-70">/100</span>
    </span>
  );
}
