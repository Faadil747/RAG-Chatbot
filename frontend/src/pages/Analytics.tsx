import { motion } from 'framer-motion';
import { BarChart3, Briefcase, Clock, MapPin, Sparkles, Upload, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/analytics/StatTile';
import { TopListChart } from '@/components/analytics/TopListChart';
import { useAnalytics } from '@/hooks/useAnalytics';

export default function Analytics() {
  const { data, isLoading, error } = useAnalytics();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A bird's-eye view of the whole candidate pool — updated in real time as resumes are added.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-80 w-full" />
            ))}
          </div>
        </div>
      )}

      {!isLoading && error && <p className="text-sm text-destructive">{error}</p>}

      {!isLoading && !error && data && data.total === 0 && (
        <Card className="flex flex-col items-center gap-3 border-dashed py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold">No candidates yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Upload resumes to start seeing pool-wide stats, skill trends, and breakdowns here.
            </p>
          </div>
          <Button asChild size="sm" className="mt-1">
            <Link to="/upload">
              <Upload className="h-3.5 w-3.5" /> Upload Resumes
            </Link>
          </Button>
        </Card>
      )}

      {!isLoading && !error && data && data.total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="space-y-6"
        >
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Total Candidates" value={data.total} icon={Users} />
            <StatTile
              label="Avg. Experience"
              value={data.averageExperienceYears != null ? `${data.averageExperienceYears} yrs` : '—'}
              icon={Sparkles}
            />
            <StatTile
              label="Median Experience"
              value={data.medianExperienceYears != null ? `${data.medianExperienceYears} yrs` : '—'}
              icon={Clock}
            />
            <StatTile
              label="Experience Range"
              value={
                data.minExperienceYears != null && data.maxExperienceYears != null
                  ? `${data.minExperienceYears}–${data.maxExperienceYears} yrs`
                  : '—'
              }
              icon={Briefcase}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TopListChart title="Top Skills" icon={Sparkles} data={data.topSkills} />
            <TopListChart title="Candidates by Job" icon={Briefcase} data={data.jobBreakdown} />
            <TopListChart title="Availability" icon={Clock} data={data.availabilityBreakdown} />
            <TopListChart title="Top Locations" icon={MapPin} data={data.topLocations} />
          </div>
        </motion.div>
      )}
    </div>
  );
}
