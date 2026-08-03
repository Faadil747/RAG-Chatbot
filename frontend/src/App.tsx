import { Route, Routes } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { AppShell } from '@/components/layout/AppShell';
import CandidateCreation from '@/pages/CandidateCreation';
import CandidateList from '@/pages/CandidateList';
import CandidateSearch from '@/pages/CandidateSearch';
import Chatbot from '@/pages/Chatbot';
import Jobs from '@/pages/Jobs';

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<CandidateCreation />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/candidates" element={<CandidateList />} />
            <Route path="/search" element={<CandidateSearch />} />
            <Route path="/chatbot" element={<Chatbot />} />
          </Route>
        </Routes>
      </TooltipProvider>
    </ThemeProvider>
  );
}
