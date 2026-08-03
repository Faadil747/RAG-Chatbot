import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { useChat } from '@/hooks/useChat';
import { cn } from '@/lib/utils';

const EXAMPLE_PROMPTS = [
  'Find senior backend engineers with AWS experience',
  'Who are the top candidates for a React role?',
  'Show me candidates available to join immediately',
  'Summarize the strongest candidate we have',
];

interface ChatWindowProps {
  /** When provided, this message is sent automatically once, the first time the window mounts with an empty conversation. */
  autoSendMessage?: string | null;
  /** Renders a more compact layout, used inside the floating assistant Sheet. */
  compact?: boolean;
  className?: string;
}

export function ChatWindow({ autoSendMessage, compact = false, className }: ChatWindowProps) {
  const { messages, isSending, isHydrating, sendMessage, startNewConversation } = useChat();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasAutoSent = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  useEffect(() => {
    if (autoSendMessage && !hasAutoSent.current && !isHydrating && messages.length === 0) {
      hasAutoSent.current = true;
      void sendMessage(autoSendMessage);
    }
  }, [autoSendMessage, isHydrating, messages.length, sendMessage]);

  function handleSubmit() {
    if (!draft.trim()) return;
    void sendMessage(draft);
    setDraft('');
  }

  function handleSuggestionClick(suggestion: string) {
    void sendMessage(suggestion);
  }

  const showEmptyState = messages.length === 0 && !isHydrating && !(autoSendMessage && !hasAutoSent.current);

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">AI Recruiter Assistant</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {isSending ? 'Typing…' : 'Ask about candidates in plain English'}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={startNewConversation}>
          <RefreshCcw className="h-3.5 w-3.5" /> New
        </Button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
        {isHydrating && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading conversation…
          </div>
        )}

        {showEmptyState && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-7 w-7" />
            </div>
            <div>
              <p className="text-base font-semibold">Hi, I'm your recruiting assistant</p>
              <p className={cn('mt-1 text-sm text-muted-foreground', compact && 'text-xs')}>
                Ask me to find candidates, compare profiles, or summarize a search.
              </p>
            </div>
            <div className={cn('grid w-full gap-2', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => void sendMessage(prompt)}
                  className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-xs font-medium text-foreground shadow-soft transition-colors hover:bg-secondary"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isHydrating && messages.length > 0 && (
          <div className="space-y-5">
            {messages.map((message, idx) => (
              <ChatMessageBubble key={idx} message={message} onSuggestionClick={handleSuggestionClick} />
            ))}
            {isSending && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 pl-10 text-xs text-muted-foreground"
              >
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                </span>
                thinking…
              </motion.div>
            )}
          </div>
        )}
      </div>

      <ChatInput value={draft} onChange={setDraft} onSubmit={handleSubmit} disabled={isSending} />
    </div>
  );
}
