import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  indicatorClassName?: string;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, indicatorClassName, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      {...props}
    >
      <motion.div
        className={cn('h-full rounded-full bg-primary', indicatorClassName)}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  )
);
Progress.displayName = 'Progress';

export interface RadialProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: React.ReactNode;
  colorClassName?: string;
}

function RadialProgress({
  value,
  size = 96,
  strokeWidth = 8,
  className,
  label,
  colorClassName = 'text-primary',
}: RadialProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(value, 0), 100);
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="fill-none stroke-secondary"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={cn('fill-none', colorClassName)}
          stroke="currentColor"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {label ?? <span className="text-lg font-semibold">{Math.round(clamped)}</span>}
      </div>
    </div>
  );
}

export { Progress, RadialProgress };
