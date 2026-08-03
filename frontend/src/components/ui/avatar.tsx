import * as React from 'react';
import { cn, getInitials } from '@/lib/utils';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  colorSeed?: string;
}

const sizeClasses: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
};

const palette = [
  'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ name, size = 'md', colorSeed, className, ...props }, ref) => {
    const colorClass = palette[hashString(colorSeed ?? name) % palette.length];
    return (
      <div
        ref={ref}
        className={cn(
          'flex shrink-0 select-none items-center justify-center rounded-full font-semibold',
          sizeClasses[size],
          colorClass,
          className
        )}
        {...props}
      >
        {getInitials(name)}
      </div>
    );
  }
);
Avatar.displayName = 'Avatar';

export { Avatar };
