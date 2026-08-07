import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Briefcase,
  FileUp,
  Gauge,
  MessageSquareText,
  Search,
  Sparkles,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAnalytics } from '@/hooks/useAnalytics';

const BENEFITS = [
  {
    icon: Zap,
    title: 'Faster shortlisting',
    description:
      'Resumes are parsed, structured, and scored automatically the moment they’re uploaded — no manual screening required to know who’s worth a look.',
  },
  {
    icon: Search,
    title: 'Search in plain English',
    description:
      '"Senior React developers in Bangalore with 6+ years" — the AI understands natural language and ranks your whole candidate pool against it.',
  },
  {
    icon: Gauge,
    title: 'Explainable match scoring',
    description:
      'Every candidate is scored against a job’s requirements using a transparent, 9-dimension rubric — never a black-box number you can’t justify.',
  },
  {
    icon: MessageSquareText,
    title: 'Ask the pool anything',
    description:
      'The AI chatbot doesn’t just find candidates — ask it "how many Python developers do we have?" or "what’s our average experience?" and get a real, computed answer.',
  },
];

const FEATURES = [
  {
    to: '/upload',
    icon: FileUp,
    title: 'Add Candidates',
    description: 'Upload resumes (PDF, DOCX) and let AI build structured profiles automatically.',
  },
  {
    to: '/jobs',
    icon: Briefcase,
    title: 'Jobs',
    description: 'Create job listings with required skills, then score every candidate against them.',
  },
  {
    to: '/candidates',
    icon: Users,
    title: 'Candidate List',
    description: 'Browse, filter, and manage your entire pipeline in one place.',
  },
  {
    to: '/search',
    icon: Sparkles,
    title: 'Candidate Search',
    description: 'Describe your ideal candidate in plain English and get ranked, justified matches.',
  },
  {
    to: '/chatbot',
    icon: MessageSquareText,
    title: 'AI Chatbot',
    description: 'A conversational assistant grounded in your real candidate data — nothing invented.',
  },
  {
    to: '/analytics',
    icon: BarChart3,
    title: 'Analytics',
    description: 'A live, pool-wide view of skills, experience, availability, and job breakdowns.',
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export default function Home() {
  const { data } = useAnalytics();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <motion.div
        initial={fadeUp.initial}
        animate={fadeUp.animate}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="mb-12 text-center"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft-lg">
          <Target className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Your AI-powered recruiting command center</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          RAG ChatBot turns a folder of resumes into a searchable, scored, conversational candidate
          database — so hiring managers spend their time interviewing, not screening.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/upload">
              <FileUp className="h-4 w-4" /> Upload Resumes
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/search">
              <Search className="h-4 w-4" /> Search Candidates
            </Link>
          </Button>
        </div>

        {data && data.total > 0 && (
          <div className="mx-auto mt-8 flex w-fit flex-wrap items-center justify-center gap-x-8 gap-y-2 rounded-full border border-border bg-card px-6 py-3 text-xs text-muted-foreground shadow-soft">
            <span>
              <strong className="font-semibold text-foreground">{data.total}</strong> candidates in your pool
            </span>
            {data.averageExperienceYears != null && (
              <span>
                <strong className="font-semibold text-foreground">{data.averageExperienceYears}</strong> yrs avg.
                experience
              </span>
            )}
            <Link to="/analytics" className="font-medium text-primary hover:underline">
              View full analytics →
            </Link>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={fadeUp.initial}
        animate={fadeUp.animate}
        transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}
        className="mb-12"
      >
        <h2 className="mb-1 text-center text-lg font-semibold tracking-tight">How it helps hiring managers</h2>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Built to cut the time between "resume received" and "candidate shortlisted."
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((benefit, i) => (
            <motion.div
              key={benefit.title}
              initial={fadeUp.initial}
              animate={fadeUp.animate}
              transition={{ duration: 0.3, delay: 0.08 + i * 0.04, ease: 'easeOut' }}
            >
              <Card className="h-full p-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <benefit.icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold">{benefit.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{benefit.description}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={fadeUp.initial}
        animate={fadeUp.animate}
        transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}
      >
        <h2 className="mb-1 text-center text-lg font-semibold tracking-tight">Everything in the platform</h2>
        <p className="mb-6 text-center text-sm text-muted-foreground">Jump straight to any part of the workflow.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.to}
              initial={fadeUp.initial}
              animate={fadeUp.animate}
              transition={{ duration: 0.3, delay: 0.12 + i * 0.03, ease: 'easeOut' }}
            >
              <Link to={feature.to} className="block h-full">
                <Card className="h-full p-5 transition-colors hover:border-primary/40 hover:bg-accent/50">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-foreground">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold">{feature.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{feature.description}</p>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
