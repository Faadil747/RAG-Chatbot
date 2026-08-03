import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { CandidateChip } from '@/components/chat/CandidateChip';
import type { ChatMessage } from '@/types';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  onSuggestionClick?: (suggestion: string) => void;
}

export function ChatMessageBubble({ message, onSuggestionClick }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={cn('flex w-full gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      {isUser ? (
        <Avatar name="Recruiter" size="sm" className="mt-0.5" />
      ) : (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      )}

      <div className={cn('flex max-w-[85%] flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-soft',
            isUser
              ? 'rounded-tr-sm bg-primary text-primary-foreground'
              : 'rounded-tl-sm border border-border bg-card text-card-foreground'
          )}
        >
          {message.content}
        </div>
        <span className="px-1 text-[10px] text-muted-foreground">{format(new Date(message.createdAt), 'p')}</span>

        {message.candidates && message.candidates.length > 0 && (
          <div className="flex w-full flex-col gap-1.5">
            {message.candidates.map((c) => (
              <CandidateChip key={c.id} candidate={c} />
            ))}
          </div>
        )}

        {message.suggestions && message.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onSuggestionClick?.(s)}
                className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
