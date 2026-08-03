import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  MessageSquareText,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { TagsInput } from '@/components/ui/tags-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar } from '@/components/ui/avatar';
import { ScoreBadge } from '@/components/candidate/ScoreBadge';
import { SkillBadges } from '@/components/candidate/SkillBadges';
import { useCandidates } from '@/hooks/useCandidates';
import { useCandidateProfileStore } from '@/store/candidateProfileStore';
import { getResumeDownloadUrl } from '@/lib/api';
import type { CandidateListFilters } from '@/types';

const PAGE_SIZE = 10;
const AVAILABILITY_OPTIONS = ['Any', 'Immediate', '2 Weeks Notice', '1 Month Notice', 'Not Available'];

export default function CandidateList() {
  const navigate = useNavigate();
  const openProfile = useCandidateProfileStore((s) => s.openProfile);

  const [search, setSearch] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [experienceRange, setExperienceRange] = useState<[number, number]>([0, 20]);
  const [location, setLocation] = useState('');
  const [designation, setDesignation] = useState('');
  const [availability, setAvailability] = useState('Any');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const filters: CandidateListFilters = useMemo(
    () => ({
      search: search || undefined,
      skills: skills.length > 0 ? skills : undefined,
      experienceMin: experienceRange[0] > 0 ? experienceRange[0] : undefined,
      experienceMax: experienceRange[1] < 20 ? experienceRange[1] : undefined,
      location: location || undefined,
      designation: designation || undefined,
      availability: availability !== 'Any' ? availability : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [search, skills, experienceRange, location, designation, availability, page]
  );

  const { candidates, total, isLoading, error } = useCandidates(filters);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasActiveFilters =
    skills.length > 0 || experienceRange[0] > 0 || experienceRange[1] < 20 || !!location || !!designation || availability !== 'Any';

  function resetFilters() {
    setSkills([]);
    setExperienceRange([0, 20]);
    setLocation('');
    setDesignation('');
    setAvailability('Any');
    setPage(1);
  }

  function resetPageAnd<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Candidates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} candidate{total === 1 ? '' : 's'} in your pipeline
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/')}>
          <UploadCloud className="h-4 w-4" /> Upload Resumes
        </Button>
      </div>

      {/* Toolbar */}
      <Card className="mb-6 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => resetPageAnd(setSearch)(e.target.value)}
              placeholder="Search candidates by name, role, skill..."
              className="pl-9"
            />
          </div>
          <Button
            variant={hasActiveFilters ? 'default' : 'outline'}
            onClick={() => setShowFilters((s) => !s)}
          >
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {hasActiveFilters && <Badge variant="secondary" className="ml-1 h-4 min-w-4 justify-center bg-primary-foreground/20 px-1 text-primary-foreground">•</Badge>}
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Skills</label>
              <TagsInput value={skills} onChange={resetPageAnd(setSkills)} placeholder="Add a skill..." />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Location</label>
              <Input value={location} onChange={(e) => resetPageAnd(setLocation)(e.target.value)} placeholder="e.g. Chennai" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Designation</label>
              <Input
                value={designation}
                onChange={(e) => resetPageAnd(setDesignation)(e.target.value)}
                placeholder="e.g. Backend Engineer"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Availability</label>
              <Select value={availability} onValueChange={resetPageAnd(setAvailability)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Experience</span>
                <span>
                  {experienceRange[0]} – {experienceRange[1]}+ yrs
                </span>
              </label>
              <Slider
                min={0}
                max={20}
                step={1}
                value={experienceRange}
                onValueChange={(v) => resetPageAnd(setExperienceRange)(v as [number, number])}
                className="py-2"
              />
            </div>
          </div>
        )}
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Experience</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>AI Score</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-9 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && error && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-destructive">
                  {error}
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !error && candidates.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-16">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                      <Users className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">No candidates found</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {hasActiveFilters || search
                          ? 'Try adjusting your search or filters.'
                          : 'Upload your first resume to get started.'}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => navigate('/')}>
                      <UploadCloud className="h-3.5 w-3.5" /> Upload Resumes
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              !error &&
              candidates.map((candidate) => (
                <TableRow key={candidate.id}>
                  <TableCell>
                    <button
                      className="flex items-center gap-3 text-left"
                      onClick={() => openProfile(candidate.id)}
                    >
                      <Avatar name={candidate.name} size="sm" />
                      <span className="font-medium text-foreground hover:underline">{candidate.name}</span>
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {candidate.currentRole}
                    {candidate.jobTitle && (
                      <Badge variant="accent" className="ml-2 font-normal">
                        {candidate.jobTitle}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{candidate.totalExperienceYears} yrs</TableCell>
                  <TableCell>
                    <SkillBadges skills={candidate.topSkills} max={3} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{candidate.location}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <ScoreBadge score={candidate.overallRating} size="sm" />
                      {candidate.jobMatchScore !== null && (
                        <span className="text-[11px] text-muted-foreground">
                          {Math.round(candidate.jobMatchScore)}/100 job fit
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNow(new Date(candidate.uploadedAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Row actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openProfile(candidate.id)}>
                          <Eye className="h-3.5 w-3.5" /> View Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => window.open(getResumeDownloadUrl(candidate.id), '_blank')}
                        >
                          <Download className="h-3.5 w-3.5" /> Download Resume
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/chatbot?candidateId=${candidate.id}`)}>
                          <MessageSquareText className="h-3.5 w-3.5" /> Open Chat
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {!isLoading && !error && total > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
