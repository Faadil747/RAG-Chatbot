import { Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useThemeStore } from '@/store/themeStore';

interface HeaderProps {
  title: string;
  subtitle?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenMobileMenu: () => void;
}

export function Header({ title, subtitle, collapsed, onToggleCollapsed, onOpenMobileMenu }: HeaderProps) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const isDark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMobileMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="hidden md:inline-flex"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Toggle {isDark ? 'light' : 'dark'} mode</TooltipContent>
      </Tooltip>

      <div className="ml-1 flex items-center gap-2 border-l border-border pl-3">
        <Avatar name="Recruiter" size="sm" />
        <div className="hidden leading-none sm:block">
          <p className="text-sm font-medium">Recruiter</p>
          <p className="text-[11px] text-muted-foreground">Talent Acquisition</p>
        </div>
      </div>
    </header>
  );
}
