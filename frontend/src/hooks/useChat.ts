import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/store/chatStore';
import { getChatHistory, sendChatMessage, ApiError } from '@/lib/api';
import type { ChatMessage } from '@/types';

export function useChat() {
  const sessionId = useChatStore((s) => s.sessionId);
  const messages = useChatStore((s) => s.messages);
  const isSending = useChatStore((s) => s.isSending);
  const setSessionId = useChatStore((s) => s.setSessionId);
  const setMessages = useChatStore((s) => s.setMessages);
  const addMessage = useChatStore((s) => s.addMessage);
  const setSending = useChatStore((s) => s.setSending);
  const reset = useChatStore((s) => s.reset);

  const [isHydrating, setIsHydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydratedForSession = useRef<string | null>(null);

  // Hydrate history from the backend whenever we have a session id we haven't
  // fetched history for yet (covers first mount with a persisted sessionId).
  useEffect(() => {
    if (!sessionId) return;
    if (hydratedForSession.current === sessionId) return;
    if (messages.length > 0) {
      // We already have local messages (e.g. just sent one) — trust local state.
      hydratedForSession.current = sessionId;
      return;
    }

    let cancelled = false;
    setIsHydrating(true);
    getChatHistory(sessionId)
      .then((history) => {
        if (cancelled) return;
        setMessages(history.messages);
        hydratedForSession.current = sessionId;
      })
      .catch(() => {
        // If history can't be loaded (e.g. session expired server-side), start fresh locally.
        if (!cancelled) hydratedForSession.current = sessionId;
      })
      .finally(() => {
        if (!cancelled) setIsHydrating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, messages.length, setMessages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

      setError(null);
      const userMessage: ChatMessage = {
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      addMessage(userMessage);
      setSending(true);

      try {
        const res = await sendChatMessage(sessionId, trimmed);
        setSessionId(res.sessionId);
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: res.reply,
          createdAt: new Date().toISOString(),
          suggestions: res.suggestions,
          candidates: res.candidates,
          query: res.query ?? undefined,
          results: res.results,
        };
        addMessage(assistantMessage);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
        setError(message);
        addMessage({
          role: 'assistant',
          content: `Sorry, I ran into an error: ${message}`,
          createdAt: new Date().toISOString(),
        });
      } finally {
        setSending(false);
      }
    },
    [sessionId, isSending, addMessage, setSending, setSessionId]
  );

  const startNewConversation = useCallback(() => {
    hydratedForSession.current = null;
    reset();
  }, [reset]);

  return {
    sessionId,
    messages,
    isSending,
    isHydrating,
    error,
    sendMessage,
    startNewConversation,
  };
}
