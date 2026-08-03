import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names, resolving conflicts (later classes win) while
 * still allowing conditional class objects/arrays via clsx.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Clamp a number between a min and max value. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Get the initials (up to 2 letters) from a full name. */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Score band used to color AI score badges consistently across the app. */
export type ScoreBand = 'high' | 'medium' | 'low';

export function getScoreBand(score: number): ScoreBand {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

export function scoreBandClasses(band: ScoreBand): string {
  switch (band) {
    case 'high':
      return 'bg-success/15 text-success border-success/30';
    case 'medium':
      return 'bg-warning/15 text-warning border-warning/30';
    case 'low':
      return 'bg-destructive/15 text-destructive border-destructive/30';
  }
}

/** Generate a reasonably unique id for client-side-only entities (e.g. optimistic chat messages). */
export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}
