import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Briefcase, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateJobDialog } from '@/components/jobs/CreateJobDialog';
import { JobDetailSheet } from '@/components/jobs/JobDetailSheet';
import { useJobs } from '@/hooks/useJobs';
import type { Job } from '@/types';

export default function Jobs() {
  const { jobs, isLoading, error, isCreating, createJob } = useJobs();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Jobs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create job listings, then score candidates against them when uploading resumes.
          </p>
        </div>
        <CreateJobDialog createJob={createJob} isCreating={isCreating} />
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      )}

      {!isLoading && error && <p className="text-sm text-destructive">{error}</p>}

      {!isLoading && !error && jobs.length === 0 && (
        <Card className="flex flex-col items-center gap-3 border-dashed py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
            <Briefcase className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold">No jobs yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Create a job listing to start scoring candidates against it when you upload resumes.
            </p>
          </div>
        </Card>
      )}

      {!isLoading && !error && jobs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {jobs.map((job) => (
            <Card
              key={job.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedJob(job)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedJob(job);
                }
              }}
              className="cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/[0.02] focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{job.title}</CardTitle>
                  {typeof job.candidateCount === 'number' && (
                    <Badge variant="outline" className="shrink-0">
                      <Users className="h-3 w-3" /> {job.candidateCount}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-3 text-sm text-muted-foreground">{job.description}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {job.intent.requiredSkills.slice(0, 5).map((s) => (
                    <Badge key={s} variant="secondary" className="font-normal">
                      {s}
                    </Badge>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Created {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <JobDetailSheet job={selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)} />
    </div>
  );
}
