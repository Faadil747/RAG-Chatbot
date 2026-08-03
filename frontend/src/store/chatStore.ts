import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage } from '@/types';

interface ChatState {
  sessionId: string | null;
  messages: ChatMessage[];
  isSending: boolean;
  hydrated: boolean;
  setSessionId: (sessionId: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  setSending: (sending: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      sessionId: null,
      messages: [],
      isSending: false,
      hydrated: false,
      setSessionId: (sessionId) => set({ sessionId }),
      setMessages: (messages) => set({ messages }),
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      setSending: (isSending) => set({ isSending }),
      setHydrated: (hydrated) => set({ hydrated }),
      reset: () => set({ sessionId: null, messages: [], hydrated: false }),
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({ sessionId: state.sessionId, messages: state.messages }),
    }
  )
);
