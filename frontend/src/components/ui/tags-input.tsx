import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TagsInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Simple multi-value tag input: type a value and press Enter or comma to add it.
 * Used for the skills filter on the Candidate List page.
 */
function TagsInput({ value, onChange, placeholder, className }: TagsInputProps) {
  const [draft, setDraft] = React.useState('');

  function commitDraft() {
    const trimmed = draft.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setDraft('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      className={cn(
        'flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
        className
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="rounded-full hover:bg-foreground/10"
            aria-label={`Remove ${tag}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
        placeholder={value.length === 0 ? placeholder : ''}
        className="min-w-[80px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

export { TagsInput };
