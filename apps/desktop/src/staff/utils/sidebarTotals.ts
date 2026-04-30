import { format, parseISO } from 'date-fns';
import type { ActivityEntry, ManualEntry } from '../types';

function onDate(iso: string, dateStr: string): boolean {
  return format(parseISO(iso), 'yyyy-MM-dd') === dateStr;
}

type Interval = { startMs: number; endMs: number };

type ActivityInterval = Interval & { appName: string; category: ActivityEntry['category'] };

function clipToLocalDay(startIso: string, endIso: string, dateStr: string): Interval | null {
  const s = parseISO(startIso).getTime();
  const e = parseISO(endIso).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  const d0 = parseISO(`${dateStr}T00:00:00`).getTime();
  const d1 = parseISO(`${dateStr}T23:59:59.999`).getTime();
  const startMs = Math.max(s, d0);
  const endMs = Math.min(e, d1);
  if (endMs <= startMs) return null;
  return { startMs, endMs };
}

function unionSeconds(intervals: Interval[]): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  let totalMs = 0;
  let curS = sorted[0]!.startMs;
  let curE = sorted[0]!.endMs;
  for (let i = 1; i < sorted.length; i++) {
    const it = sorted[i]!;
    if (it.startMs <= curE) {
      curE = Math.max(curE, it.endMs);
    } else {
      totalMs += Math.max(0, curE - curS);
      curS = it.startMs;
      curE = it.endMs;
    }
  }
  totalMs += Math.max(0, curE - curS);
  return Math.max(0, Math.round(totalMs / 1000));
}

export function unionSecondsForActivitiesOnDate(activities: ActivityEntry[], dateStr: string): number {
  const intervals: Interval[] = [];
  for (const a of activities) {
    if (!onDate(a.startTime, dateStr)) continue;
    const clip = clipToLocalDay(a.startTime, a.endTime, dateStr);
    if (clip) intervals.push(clip);
  }
  return unionSeconds(intervals);
}

/**
 * Union-time attribution by app for a day (no double counting across apps).
 * If multiple activities overlap in time, the overlap is assigned to exactly one app
 * (latest-starting interval wins; ties broken deterministically).
 */
export function unionAppSecondsForActivitiesOnDate(
  activities: ActivityEntry[],
  dateStr: string
): Record<string, { duration: number; category: ActivityEntry['category'] }> {
  const intervals: ActivityInterval[] = [];
  for (const a of activities) {
    if (!onDate(a.startTime, dateStr)) continue;
    const clip = clipToLocalDay(a.startTime, a.endTime, dateStr);
    if (!clip) continue;
    intervals.push({ ...clip, appName: a.appName, category: a.category });
  }
  if (intervals.length === 0) return {};

  const bounds = new Set<number>();
  for (const it of intervals) {
    bounds.add(it.startMs);
    bounds.add(it.endMs);
  }
  const sorted = [...bounds].sort((a, b) => a - b);

  const totals: Record<string, { duration: number; category: ActivityEntry['category'] }> = {};
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i]!;
    const hi = sorted[i + 1]!;
    if (hi <= lo) continue;

    const covering = intervals.filter((r) => r.startMs < hi && r.endMs > lo);
    if (covering.length === 0) continue;

    // Pick a single winner so totals sum to union time.
    const winner = [...covering].sort((a, b) => {
      if (a.startMs !== b.startMs) return b.startMs - a.startMs; // latest start wins
      if (a.endMs !== b.endMs) return b.endMs - a.endMs; // then longer
      return a.appName.localeCompare(b.appName);
    })[0]!;

    const sec = Math.max(0, Math.round((hi - lo) / 1000));
    if (sec <= 0) continue;
    if (!totals[winner.appName]) {
      totals[winner.appName] = { duration: 0, category: winner.category };
    }
    totals[winner.appName]!.duration += sec;
  }

  return totals;
}

export function unionSecondsForManualOnDate(manualEntries: ManualEntry[], dateStr: string): number {
  const intervals: Interval[] = [];
  for (const m of manualEntries) {
    if (!onDate(m.startTime, dateStr)) continue;
    const clip = clipToLocalDay(m.startTime, m.endTime, dateStr);
    if (clip) intervals.push(clip);
  }
  return unionSeconds(intervals);
}

/** Total tracked seconds (automatic + manual) for a calendar day. */
export function totalSecondsForDate(
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  dateStr: string
): number {
  const intervals: Interval[] = [];
  for (const a of activities) {
    if (!onDate(a.startTime, dateStr)) continue;
    const clip = clipToLocalDay(a.startTime, a.endTime, dateStr);
    if (clip) intervals.push(clip);
  }
  for (const m of manualEntries) {
    if (!onDate(m.startTime, dateStr)) continue;
    const clip = clipToLocalDay(m.startTime, m.endTime, dateStr);
    if (clip) intervals.push(clip);
  }
  return unionSeconds(intervals);
}

/** Seconds on date with no project assignment. */
export function unassignedSecondsForDate(
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  dateStr: string
): number {
  const intervals: Interval[] = [];
  for (const a of activities) {
    if (a.projectId) continue;
    if (!onDate(a.startTime, dateStr)) continue;
    const clip = clipToLocalDay(a.startTime, a.endTime, dateStr);
    if (clip) intervals.push(clip);
  }
  for (const m of manualEntries) {
    if (m.projectId) continue;
    if (!onDate(m.startTime, dateStr)) continue;
    const clip = clipToLocalDay(m.startTime, m.endTime, dateStr);
    if (clip) intervals.push(clip);
  }
  return unionSeconds(intervals);
}

export function secondsForProjectOnDate(
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  projectId: string,
  dateStr: string
): number {
  const intervals: Interval[] = [];
  for (const a of activities) {
    if (a.projectId !== projectId) continue;
    if (!onDate(a.startTime, dateStr)) continue;
    const clip = clipToLocalDay(a.startTime, a.endTime, dateStr);
    if (clip) intervals.push(clip);
  }
  for (const m of manualEntries) {
    if (m.projectId !== projectId) continue;
    if (!onDate(m.startTime, dateStr)) continue;
    const clip = clipToLocalDay(m.startTime, m.endTime, dateStr);
    if (clip) intervals.push(clip);
  }
  return unionSeconds(intervals);
}
