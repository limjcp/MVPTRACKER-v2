import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PROJECT_COLORS: Record<string, { bg: string; text: string; border: string; light: string; dot: string }> = {
  blue: {
    bg: 'bg-blue-500',
    text: 'text-blue-400',
    border: 'border-blue-500',
    light: 'bg-blue-500/20',
    dot: '#3B82F6',
  },
  purple: {
    bg: 'bg-purple-500',
    text: 'text-purple-400',
    border: 'border-purple-500',
    light: 'bg-purple-500/20',
    dot: '#8B5CF6',
  },
  green: {
    bg: 'bg-emerald-500',
    text: 'text-emerald-400',
    border: 'border-emerald-500',
    light: 'bg-emerald-500/20',
    dot: '#10B981',
  },
  orange: {
    bg: 'bg-orange-500',
    text: 'text-orange-400',
    border: 'border-orange-500',
    light: 'bg-orange-500/20',
    dot: '#F97316',
  },
  red: {
    bg: 'bg-red-500',
    text: 'text-red-400',
    border: 'border-red-500',
    light: 'bg-red-500/20',
    dot: '#EF4444',
  },
  pink: {
    bg: 'bg-pink-500',
    text: 'text-pink-400',
    border: 'border-pink-500',
    light: 'bg-pink-500/20',
    dot: '#EC4899',
  },
  teal: {
    bg: 'bg-teal-500',
    text: 'text-teal-400',
    border: 'border-teal-500',
    light: 'bg-teal-500/20',
    dot: '#14B8A6',
  },
  yellow: {
    bg: 'bg-yellow-500',
    text: 'text-yellow-400',
    border: 'border-yellow-500',
    light: 'bg-yellow-500/20',
    dot: '#EAB308',
  },
  indigo: {
    bg: 'bg-indigo-500',
    text: 'text-indigo-400',
    border: 'border-indigo-500',
    light: 'bg-indigo-500/20',
    dot: '#6366F1',
  },
  cyan: {
    bg: 'bg-cyan-500',
    text: 'text-cyan-400',
    border: 'border-cyan-500',
    light: 'bg-cyan-500/20',
    dot: '#06B6D4',
  },
};

