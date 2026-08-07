import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar, NAV_ITEMS } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { FloatingAssistantButton } from '@/components/layout/FloatingAssistantButton';
import { CandidateProfileSheet } from '@/components/candidate/CandidateProfileSheet';

const PAGE_SUBTITLES: Record<string, string> = {
  '/': 'Your AI-powered recruiting command center',
  '/upload': 'Upload resumes and let AI build structured candidate profiles',
  '/jobs': 'Create job listings, then score candidates against them',
  '/candidates': 'Browse, filter, and manage every candidate in your pipeline',
  '/analytics': 'A live, pool-wide view of skills, experience, and availability',
  '/search': 'Describe who you need in plain English — AI ranks your best matches',
  '/chatbot': 'Chat with your AI recruiting assistant about any candidate',
};

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const activeNavItem = NAV_ITEMS.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
  );
  const isChatbotPage = location.pathname.startsWith('/chatbot');

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={activeNavItem?.label ?? 'RAG ChatBot'}
          subtitle={PAGE_SUBTITLES[location.pathname] ?? PAGE_SUBTITLES[activeNavItem?.to ?? '/']}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
          onOpenMobileMenu={() => setMobileOpen(true)}
        />

        <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {!isChatbotPage && <FloatingAssistantButton />}
      <CandidateProfileSheet />
    </div>
  );
}
