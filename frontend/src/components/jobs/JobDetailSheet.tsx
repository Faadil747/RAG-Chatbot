import { formatDistanceToNow } from 'date-fns';
import {
  Briefcase,
  Calendar,
  GraduationCap,
  ListChecks,
  MapPin,
  Tag,
  Timer,
  Users,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { Job } from '@/types';

interface JobDetailSheetProps {
  job: Job | null;
  onOpenChange: (open: boolean) => void;
}

function experienceRangeLabel(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${min}–${max} years`;
  if (min !== null) return `${min}+ years`;
  return `Up to ${max} years`;
}

export function JobDetailSheet({ job, onOpenChange }: JobDetailSheetProps) {
  const experience = job ? experienceRangeLabel(job.intent.minExperience, job.intent.maxExperience) : null;

  return (
    <Sheet open={!!job} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto scrollbar-thin sm:max-w-xl">
        {job && (
          <div className="space-y-6 pb-4 pt-2">
            <SheetHeader>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <SheetTitle className="leading-tight">{job.title}</SheetTitle>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Created {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                    </span>
                    {typeof job.candidateCount === 'number' && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> {job.candidateCount} candidate
                        {job.candidateCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </SheetHeader>

            {/* Extracted requirements */}
            <section className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
              <h3 className="mb-3 text-sm font-semibold">Extracted Requirements</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {job.intent.designation && (
                  <div className="flex items-start gap-2">
                    <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-[11px] text-muted-foreground">Designation</p>
                      <p className="text-sm font-medium">{job.intent.designation}</p>
                    </div>
                  </div>
                )}
                {experience && (
                  <div className="flex items-start gap-2">
                    <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-[11px] text-muted-foreground">Experience</p>
                      <p className="text-sm font-medium">{experience}</p>
                    </div>
                  </div>
                )}
                {job.intent.location && (
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-[11px] text-muted-foreground">Location</p>
                      <p className="text-sm font-medium">{job.intent.location}</p>
                    </div>
                  </div>
                )}
                {job.intent.industry && (
                  <div className="flex items-start gap-2">
                    <Tag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-[11px] text-muted-foreground">Industry</p>
                      <p className="text-sm font-medium">{job.intent.industry}</p>
                    </div>
                  </div>
                )}
                {job.intent.education && (
                  <div className="flex items-start gap-2">
                    <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-[11px] text-muted-foreground">Education</p>
                      <p className="text-sm font-medium">{job.intent.education}</p>
                    </div>
                  </div>
                )}
                {job.intent.availability && (
                  <div className="flex items-start gap-2">
                    <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-[11px] text-muted-foreground">Availability</p>
                      <p className="text-sm font-medium">{job.intent.availability}</p>
                    </div>
                  </div>
                )}
              </div>

              {!job.intent.designation &&
                !experience &&
                !job.intent.location &&
                !job.intent.industry &&
                job.intent.requiredSkills.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No structured requirements were extracted from this description — candidates will score
                    neutrally on most dimensions.
                  </p>
                )}

              {job.intent.requiredSkills.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-[11px] text-muted-foreground">Required skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {job.intent.requiredSkills.map((s) => (
                      <Badge key={s}>{s}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {job.intent.keywords.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] text-muted-foreground">Other keywords</p>
                  <div className="flex flex-wrap gap-1.5">
                    {job.intent.keywords.map((k) => (
                      <Badge key={k} variant="secondary" className="font-normal">
                        {k}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <Separator />

            {/* Full description */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">Full Job Description</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{job.description}</p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
