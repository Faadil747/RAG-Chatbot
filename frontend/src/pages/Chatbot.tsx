import { useSearchParams } from 'react-router-dom';
import { ChatWindow } from '@/components/chat/ChatWindow';

export default function Chatbot() {
  const [searchParams] = useSearchParams();
  const candidateId = searchParams.get('candidateId');
  const autoSendMessage = candidateId ? `Tell me more about candidate ${candidateId}` : null;

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col px-4 py-6 md:px-8">
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <ChatWindow autoSendMessage={autoSendMessage} className="h-full" />
      </div>
    </div>
  );
}
