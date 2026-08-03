import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Briefcase, FileUp, Users, Sparkles, MessageSquareText, Target, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof FileUp;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Candidate Creation', icon: FileUp },
  { to: '/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/candidates', label: 'Candidate List', icon: Users },
  { to: '/search', label: 'Candidate Search', icon: Sparkles },
  { to: '/chatbot', label: 'AI Chatbot', icon: MessageSquareText },
];

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function SidebarContent({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 items-center gap-2 px-4', collapsed && 'justify-center px-0')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-soft">
          <Target className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold tracking-tight text-sidebar-foreground">RAG ChatBot</span>
            <span className="text-[11px] text-muted-foreground">Recruiter AI</span>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-sidebar-foreground/80 hover:bg-secondary hover:text-sidebar-foreground'
              )
            }
            title={collapsed ? item.label : undefined}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 rounded-lg bg-primary/10"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <item.icon className="relative z-10 h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {!collapsed && (
        <div className="mx-3 mb-4 rounded-xl border border-sidebar-border bg-secondary/50 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-sidebar-foreground">AI-Powered Search</p>
          <p className="mt-1 leading-relaxed">
            Upload resumes, then search candidates in plain English.
          </p>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex',
          collapsed ? 'w-[72px]' : 'w-64'
        )}
      >
        <SidebarContent collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onCloseMobile} />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border bg-sidebar shadow-soft-lg"
          >
            <button
              onClick={onCloseMobile}
              className="absolute right-3 top-4 rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent collapsed={false} />
          </motion.div>
        </div>
      )}
    </>
  );
}
