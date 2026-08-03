import { Badge } from '@/components/ui/badge';

interface SkillBadgesProps {
  skills: string[];
  max?: number;
  variant?: 'default' | 'secondary' | 'outline' | 'accent';
}

export function SkillBadges({ skills, max = 4, variant = 'secondary' }: SkillBadgesProps) {
  const visible = skills.slice(0, max);
  const remaining = skills.length - visible.length;

  if (skills.length === 0) {
    return <span className="text-xs text-muted-foreground">No skills listed</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((skill) => (
        <Badge key={skill} variant={variant} className="font-normal">
          {skill}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          +{remaining}
        </Badge>
      )}
    </div>
  );
}
