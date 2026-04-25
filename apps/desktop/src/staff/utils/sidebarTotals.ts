import { format, parseISO } from 'date-fns';
import type { ActivityEntry, ManualEntry } from '../types';

function onDate(iso: string, dateStr: string): boolean {
  return format(parseISO(iso), 'yyyy-MM-dd') === dateStr;
}

/** Total tracked seconds (automatic + manual) for a calendar day. */
export function totalSecondsForDate(
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  dateStr: string
): number {
  let s = 0;
  for (const a of activities) {
    if (onDate(a.startTime, dateStr)) s += a.duration;
  }
  for (const m of manualEntries) {
    if (onDate(m.startTime, dateStr)) s += m.duration;
  }
  return s;
}

/** Seconds on date with no project assignment. */
export function unassignedSecondsForDate(
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  dateStr: string
): number {
  let s = 0;
  for (const a of activities) {
    if (!a.projectId && onDate(a.startTime, dateStr)) s += a.duration;
  }
  for (const m of manualEntries) {
    if (!m.projectId && onDate(m.startTime, dateStr)) s += m.duration;
  }
  return s;
}

export function secondsForProjectOnDate(
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  projectId: string,
  dateStr: string
): number {
  let s = 0;
  for (const a of activities) {
    if (a.projectId === projectId && onDate(a.startTime, dateStr)) s += a.duration;
  }
  for (const m of manualEntries) {
    if (m.projectId === projectId && onDate(m.startTime, dateStr)) s += m.duration;
  }
  return s;
}
