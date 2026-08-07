import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { AppShell } from '@/components/layout/AppShell';
import Home from '@/pages/Home';
import NotFound from '@/pages/NotFound';

// Code-split every page beyond the landing route -- keeps the initial bundle
// lean (Analytics alone pulls in recharts) at the cost of a per-route chunk
// fetch, which AppShell's own route-transition animation comfortably masks.
const Analytics = lazy(() => import('@/pages/Analytics'));
const CandidateCreation = lazy(() => import('@/pages/CandidateCreation'));
const CandidateList = lazy(() => import('@/pages/CandidateList'));
const CandidateSearch = lazy(() => import('@/pages/CandidateSearch'));
const Chatbot = lazy(() => import('@/pages/Chatbot'));
const Jobs = lazy(() => import('@/pages/Jobs'));

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Home />} />
              <Route path="/upload" element={<CandidateCreation />} />
              <Route path="/jobs" element={<Jobs />} />
              <Route path="/candidates" element={<CandidateList />} />
              <Route path="/search" element={<CandidateSearch />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/chatbot" element={<Chatbot />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </TooltipProvider>
    </ThemeProvider>
  );
}
