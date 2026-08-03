import { motion } from 'framer-motion';
import { Briefcase } from 'lucide-react';
import type { Experience } from '@/types';

interface ExperienceTimelineProps {
  experience: Experience[];
}

export function ExperienceTimeline({ experience }: ExperienceTimelineProps) {
  if (experience.length === 0) {
    return <p className="text-sm text-muted-foreground">No experience on record.</p>;
  }

  function formatDuration(months: number): string {
    if (!months || months <= 0) return '';
    const years = Math.floor(months / 12);
    const rem = months % 12;
    const parts: string[] = [];
    if (years > 0) parts.push(`${years} yr${years > 1 ? 's' : ''}`);
    if (rem > 0) parts.push(`${rem} mo${rem > 1 ? 's' : ''}`);
    return parts.join(' ');
  }

  return (
    <ol className="relative ml-3 border-l border-border">
      {experience.map((exp, idx) => (
        <motion.li
          key={`${exp.company}-${exp.role}-${idx}`}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.06, duration: 0.25 }}
          className="mb-6 ml-6 last:mb-0"
        >
          <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-primary ring-4 ring-background">
            <Briefcase className="h-2.5 w-2.5 text-primary-foreground" />
          </span>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <h4 className="text-sm font-semibold text-foreground">{exp.role}</h4>
            <span className="text-xs text-muted-foreground">
              {exp.startDate} — {exp.endDate || 'Present'}
              {formatDuration(exp.durationMonths) ? ` · ${formatDuration(exp.durationMonths)}` : ''}
            </span>
          </div>
          <p className="text-sm font-medium text-primary">{exp.company}</p>
          {exp.description && (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{exp.description}</p>
          )}
        </motion.li>
      ))}
    </ol>
  );
}
