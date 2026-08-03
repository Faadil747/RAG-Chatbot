import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Lightbulb, ListChecks, Sparkles } from 'lucide-react';
import type { Justification } from '@/types';

interface JustificationPanelProps {
  justification: Justification;
}

export function JustificationPanel({ justification }: JustificationPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      transition={{ duration: 0.25 }}
      className="mt-4 space-y-4 rounded-xl border border-primary/20 bg-primary/[0.04] p-4"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Sparkles className="h-4 w-4" /> AI Analysis
      </div>

      {justification.matchingSkills.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" /> Matching Skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {justification.matchingSkills.map((skill) => (
              <span
                key={skill}
                className="rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {justification.relevantExperience && (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Relevant Experience</p>
          <p className="text-sm leading-relaxed text-foreground/90">{justification.relevantExperience}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {justification.strongPoints.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Strong Points
            </p>
            <ul className="space-y-1 text-sm text-foreground/90">
              {justification.strongPoints.map((p, i) => (
                <li key={i}>• {p}</li>
              ))}
            </ul>
          </div>
        )}
        {justification.potentialConcerns.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-warning">
              <AlertTriangle className="h-3.5 w-3.5" /> Potential Concerns
            </p>
            <ul className="space-y-1 text-sm text-foreground/90">
              {justification.potentialConcerns.map((p, i) => (
                <li key={i}>• {p}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {justification.recommendation && (
        <div className="rounded-lg bg-card/60 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5" /> Overall Recommendation
          </p>
          <p className="text-sm leading-relaxed">{justification.recommendation}</p>
        </div>
      )}
    </motion.div>
  );
}
