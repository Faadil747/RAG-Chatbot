import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Download,
  ExternalLink,
  Github,
  Globe,
  GraduationCap,
  Languages,
  Linkedin,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { RadialProgress } from '@/components/ui/progress';
import { ExperienceTimeline } from '@/components/candidate/ExperienceTimeline';
import { JustificationPanel } from '@/components/search/JustificationPanel';
import { useCandidateProfileStore } from '@/store/candidateProfileStore';
import { useCandidate } from '@/hooks/useCandidate';
import { getJob, getResumeDownloadUrl, getSearchAnalysis, ApiError } from '@/lib/api';
import { cn, getScoreBand } from '@/lib/utils';
import type { Justification } from '@/types';

const scoreColorClass: Record<ReturnType<typeof getScoreBand>, string> = {
  high: 'text-success',
  medium: 'text-warning',
  low: 'text-destructive',
};

export function CandidateProfileSheet() {
  const openCandidateId = useCandidateProfileStore((s) => s.openCandidateId);
  const closeProfile = useCandidateProfileStore((s) => s.closeProfile);
  const { candidate, isLoading, error } = useCandidate(openCandidateId);
  const navigate = useNavigate();

  const [justification, setJustification] = useState<Justification | null>(null);
  const [justificationLoading, setJustificationLoading] = useState(false);
  const [justificationError, setJustificationError] = useState<string | null>(null);

  useEffect(() => {
    setJustification(null);
    setJustificationError(null);
  }, [openCandidateId]);

  async function loadJustification(jobId: string, candidateId: string) {
    setJustificationLoading(true);
    setJustificationError(null);
    try {
      const job = await getJob(jobId);
      const result = await getSearchAnalysis(job.description, candidateId);
      setJustification(result);
    } catch (err) {
      setJustificationError(err instanceof ApiError ? err.message : 'Failed to load analysis.');
    } finally {
      setJustificationLoading(false);
    }
  }

  return (
    <Sheet open={!!openCandidateId} onOpenChange={(open) => !open && closeProfile()}>
      <SheetContent side="right" className="w-full overflow-y-auto scrollbar-thin sm:max-w-xl">
        {isLoading && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {!isLoading && error && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground">Try closing and reopening this profile.</p>
          </div>
        )}

        {!isLoading && !error && candidate && (
          <div className="space-y-7 pb-4 pt-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar name={candidate.name} size="lg" />
                <div>
                  <h2 className="text-xl font-bold leading-tight">{candidate.name}</h2>
                  <p className="text-sm font-medium text-muted-foreground">{candidate.currentRole}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {candidate.location || 'Unknown location'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-3 w-3" /> {candidate.totalExperienceYears} yrs experience
                    </span>
                  </div>
                </div>
              </div>
              <RadialProgress
                value={candidate.overallRating}
                size={72}
                strokeWidth={6}
                colorClassName={scoreColorClass[getScoreBand(candidate.overallRating)]}
                label={
                  <div className="flex flex-col items-center leading-none">
                    <span className="text-base font-bold">{Math.round(candidate.overallRating)}</span>
                    <span className="text-[9px] text-muted-foreground">score</span>
                  </div>
                }
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent">{candidate.availability}</Badge>
              <Badge variant="outline">
                Uploaded {formatDistanceToNow(new Date(candidate.uploadedAt), { addSuffix: true })}
              </Badge>
            </div>

            {/* Job fit */}
            {candidate.jobId && candidate.jobTitle && (
              <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Scored against</p>
                    <p className="text-sm font-semibold">{candidate.jobTitle}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {candidate.jobMatchScore !== null && (
                      <span
                        className={cn(
                          'text-lg font-bold tabular-nums',
                          scoreColorClass[getScoreBand(candidate.jobMatchScore)]
                        )}
                      >
                        {Math.round(candidate.jobMatchScore)}
                        <span className="text-xs font-normal text-muted-foreground">/100 fit</span>
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={justificationLoading}
                      onClick={() => loadJustification(candidate.jobId as string, candidate.id)}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {justificationLoading ? 'Analyzing...' : 'Why this score?'}
                    </Button>
                  </div>
                </div>
                {justificationError && <p className="mt-2 text-xs text-destructive">{justificationError}</p>}
                {justification && <JustificationPanel justification={justification} />}
              </div>
            )}

            {/* Contact links */}
            <div className="flex flex-wrap gap-2">
              {candidate.email && (
                <a
                  href={`mailto:${candidate.email}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                >
                  <Mail className="h-3.5 w-3.5" /> {candidate.email}
                </a>
              )}
              {candidate.phone && (
                <a
                  href={`tel:${candidate.phone}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                >
                  <Phone className="h-3.5 w-3.5" /> {candidate.phone}
                </a>
              )}
              {candidate.linkedin && (
                <a
                  href={candidate.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                >
                  <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                </a>
              )}
              {candidate.github && (
                <a
                  href={candidate.github}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                >
                  <Github className="h-3.5 w-3.5" /> GitHub
                </a>
              )}
              {candidate.portfolio && (
                <a
                  href={candidate.portfolio}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                >
                  <Globe className="h-3.5 w-3.5" /> Portfolio
                </a>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => window.open(candidate.resumeFileUrl, '_blank')}>
                <ExternalLink className="h-3.5 w-3.5" /> Preview Resume
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(getResumeDownloadUrl(candidate.id), '_blank')}
              >
                <Download className="h-3.5 w-3.5" /> Download Resume
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  closeProfile();
                  navigate(`/chatbot?candidateId=${candidate.id}`);
                }}
              >
                <MessageSquareText className="h-3.5 w-3.5" /> Open Chat
              </Button>
            </div>

            <Separator />

            {/* Professional summary */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">Professional Summary</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{candidate.aiSummary}</p>
            </section>

            {/* Skills */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">Skills</h3>
              <div className="space-y-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Primary</p>
                  <div className="flex flex-wrap gap-1.5">
                    {candidate.skills.primary.map((s) => (
                      <Badge key={s}>{s}</Badge>
                    ))}
                  </div>
                </div>
                {candidate.skills.secondary.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Secondary</p>
                    <div className="flex flex-wrap gap-1.5">
                      {candidate.skills.secondary.map((s) => (
                        <Badge key={s} variant="secondary">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Experience timeline */}
            <section>
              <h3 className="mb-3 text-sm font-semibold">Experience</h3>
              <ExperienceTimeline experience={candidate.experience} />
            </section>

            {/* Education */}
            {candidate.education.length > 0 && (
              <section>
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                  <GraduationCap className="h-4 w-4" /> Education
                </h3>
                <div className="space-y-3">
                  {candidate.education.map((edu, idx) => (
                    <div key={idx} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-medium">{edu.degree}{edu.field ? `, ${edu.field}` : ''}</p>
                      <p className="text-xs text-muted-foreground">
                        {edu.institution} · {edu.year}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Projects */}
            {candidate.projects.length > 0 && (
              <section>
                <h3 className="mb-3 text-sm font-semibold">Projects</h3>
                <div className="space-y-3">
                  {candidate.projects.map((project, idx) => (
                    <div key={idx} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-medium">{project.name}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{project.description}</p>
                      {project.techStack.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {project.techStack.map((t) => (
                            <Badge key={t} variant="outline" className="font-normal">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Certifications / Languages */}
            {(candidate.certifications.length > 0 || candidate.languages.length > 0) && (
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {candidate.certifications.length > 0 && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                      <ShieldCheck className="h-4 w-4" /> Certifications
                    </h3>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {candidate.certifications.map((c) => (
                        <li key={c}>• {c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {candidate.languages.length > 0 && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                      <Languages className="h-4 w-4" /> Languages
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {candidate.languages.map((l) => (
                        <Badge key={l} variant="outline" className="font-normal">
                          {l}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Strengths vs weaknesses */}
            {(candidate.strengths.length > 0 || candidate.weaknesses.length > 0) && (
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-success">
                    <ThumbsUp className="h-4 w-4" /> Strengths
                  </h3>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {candidate.strengths.map((s, i) => (
                      <li key={i}>• {s}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-warning">
                    <ThumbsDown className="h-4 w-4" /> Growth Areas
                  </h3>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {candidate.weaknesses.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {/* Technology stack & suitable roles */}
            {candidate.technologyStack.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Technology Stack</h3>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.technologyStack.map((t) => (
                    <Badge key={t} variant="secondary" className="font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {candidate.suitableRoles.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Suitable Roles</h3>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.suitableRoles.map((r) => (
                    <Badge key={r} variant="accent" className="font-normal">
                      {r}
                    </Badge>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
