import { useState } from 'react';
import { Briefcase, MapPin, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ApiError } from '@/lib/api';
import type { Job } from '@/types';

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'];
const EXPERIENCE_LEVELS = ['Entry-level', 'Mid-level', 'Senior', 'Lead / Principal'];

const EXAMPLE_PLACEHOLDER = `Example:

We're looking for a Backend Engineer to design and build our core APIs. You'll work closely with product and frontend to ship reliable, well-tested services.

Responsibilities:
- Design and implement REST APIs
- Own data models and database schema
- Write tests and participate in code review

Requirements:
- 3+ years building production backend services
- Strong experience with Python or Node.js
- Comfortable with SQL and relational databases
- Experience with Docker and cloud deployment (AWS/GCP) is a plus`;

interface CreateJobDialogProps {
  createJob: (title: string, description: string) => Promise<Job>;
  isCreating: boolean;
}

export function CreateJobDialog({ createJob, isCreating }: CreateJobDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle('');
    setLocation('');
    setEmploymentType('');
    setExperienceLevel('');
    setDescription('');
    setError(null);
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) return;
    setError(null);

    // Location/employment type/experience level aren't separate backend
    // fields -- folding them into the description text lets the existing
    // LLM parser (which already extracts location/designation/experience
    // from free text) pick them up naturally, with no schema change needed.
    const metaLines = [
      location.trim() && `Location: ${location.trim()}`,
      employmentType && `Employment Type: ${employmentType}`,
      experienceLevel && `Experience Level: ${experienceLevel}`,
    ].filter(Boolean);
    const fullDescription = metaLines.length > 0 ? `${metaLines.join('\n')}\n\n${description.trim()}` : description.trim();

    try {
      await createJob(title.trim(), fullDescription);
      reset();
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create job.');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Create Job
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Create a job listing</DialogTitle>
              <DialogDescription>
                Our AI extracts skills, experience level, and requirements from the description below —
                candidates uploaded against this job get scored for fit automatically.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Job title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <MapPin className="h-3 w-3" /> Location
              </label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Bangalore" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Employment type</label>
              <Select value={employmentType} onValueChange={setEmploymentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Experience level</label>
              <Select value={experienceLevel} onValueChange={setExperienceLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  {EXPERIENCE_LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Job description ({description.trim().split(/\s+/).filter(Boolean).length} words)
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={EXAMPLE_PLACEHOLDER}
              className="min-h-[220px]"
            />
            <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" /> The more detail you include — required skills, years of experience,
              responsibilities — the more accurate candidate scoring will be.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || !description.trim() || isCreating}>
            {isCreating ? 'Creating...' : 'Create Job'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
