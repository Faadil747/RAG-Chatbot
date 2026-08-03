import { motion } from 'framer-motion';
import { AlertTriangle, Check, File as FileIcon, Loader2, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ANIMATED_STAGES, STAGE_LABELS, type UploadItem } from '@/components/upload/pipeline';
import { useCandidateProfileStore } from '@/store/candidateProfileStore';

interface UploadPipelineCardProps {
  item: UploadItem;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function UploadPipelineCard({ item, onRetry, onDismiss }: UploadPipelineCardProps) {
  const openProfile = useCandidateProfileStore((s) => s.openProfile);
  const isAnimating = ANIMATED_STAGES.includes(item.stage);
  const currentStepIdx = ANIMATED_STAGES.indexOf(item.stage);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="overflow-hidden p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              item.stage === 'done' && 'bg-success/15 text-success',
              item.stage === 'error' && 'bg-destructive/15 text-destructive',
              isAnimating && 'bg-primary/10 text-primary'
            )}
          >
            {item.stage === 'done' && <Check className="h-[18px] w-[18px]" />}
            {item.stage === 'error' && <AlertTriangle className="h-[18px] w-[18px]" />}
            {isAnimating && <FileIcon className="h-[18px] w-[18px]" />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{item.file.name}</p>
              {item.stage !== 'done' && (
                <button
                  onClick={() => onDismiss(item.id)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {isAnimating && (
              <div className="mt-2.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {STAGE_LABELS[item.stage]}…
                </div>
                <div className="flex gap-1">
                  {ANIMATED_STAGES.map((stage, idx) => (
                    <motion.span
                      key={stage}
                      className={cn(
                        'h-1 flex-1 rounded-full bg-secondary',
                        idx <= currentStepIdx && 'bg-primary'
                      )}
                      initial={false}
                      animate={{ opacity: idx <= currentStepIdx ? 1 : 0.5 }}
                    />
                  ))}
                </div>
              </div>
            )}

            {item.stage === 'done' && (
              <div className="mt-1.5 space-y-2">
                <p className="text-xs text-success">
                  Upload Successful — Resume Parsed — Candidate Added
                </p>
                {item.candidateId && (
                  <Button size="sm" variant="outline" onClick={() => openProfile(item.candidateId!)}>
                    View Candidate
                  </Button>
                )}
              </div>
            )}

            {item.stage === 'error' && (
              <div className="mt-1.5 space-y-2">
                <p className="text-xs text-destructive">{item.error ?? 'Something went wrong processing this resume.'}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => onRetry(item.id)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Retry
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDismiss(item.id)}>
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
