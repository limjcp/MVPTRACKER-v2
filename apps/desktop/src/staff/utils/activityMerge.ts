import { parseISO } from 'date-fns';
import type { ActivityEntry } from '../types';

/** Same gap as tracker resume / timeline session aggregation. */
export const ACTIVITY_MERGE_GAP_MINUTES = 15;

/** Normalize window title for merging tracking rows. */
export function titleMergeKey(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * All Activities panel: merge every automatic row that shares the same normalized window title
 * for this day into one row (total duration = sum of segments; start/end = earliest / latest).
 * Non-automatic rows are unchanged. Empty titles do not collapse together (each stays separate).
 */
export function mergeAllAutomaticBySameWindowTitle(activities: ActivityEntry[]): ActivityEntry[] {
  const sorted = [...activities].sort(
    (a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime()
  );

  const nonAuto: ActivityEntry[] = [];
  const buckets = new Map<string, ActivityEntry[]>();

  for (const a of sorted) {
    if (a.type !== 'automatic') {
      nonAuto.push({ ...a });
      continue;
    }
    const k = titleMergeKey(a.windowTitle);
    const bucketKey = k.length > 0 ? k : `__empty_title__${a.id}`;
    const list = buckets.get(bucketKey) ?? [];
    list.push(a);
    buckets.set(bucketKey, list);
  }

  const mergedAuto: ActivityEntry[] = [];
  for (const [, group] of buckets) {
    const g = [...group].sort(
      (x, y) => parseISO(x.startTime).getTime() - parseISO(y.startTime).getTime()
    );
    if (g.length === 1) {
      mergedAuto.push({ ...g[0]! });
      continue;
    }
    const primary = g[0]!;
    const startMs = Math.min(...g.map((x) => parseISO(x.startTime).getTime()));
    const endMs = Math.max(...g.map((x) => parseISO(x.endTime).getTime()));
    const startTime = new Date(startMs).toISOString();
    const endTime = new Date(endMs).toISOString();
    const durationSum = g.reduce((s, x) => s + x.duration, 0);
    const labels = g.map((x) => x.displayLabel).filter(Boolean) as string[];
    const displayLabel =
      labels.length && new Set(labels.map((l) => l.trim())).size === 1 ? labels[0]!.trim() : undefined;
    const projectIds = [...new Set(g.map((x) => x.projectId).filter(Boolean))] as string[];
    const projectId = projectIds.length === 1 ? projectIds[0] : undefined;
    const titlePick = g.find((x) => x.windowTitle.trim())?.windowTitle ?? primary.windowTitle;

    mergedAuto.push({
      ...primary,
      id: primary.id,
      startTime,
      endTime,
      duration: Math.max(0, durationSum),
      windowTitle: titlePick,
      appName: primary.appName,
      url: g.map((x) => x.url).find(Boolean) ?? primary.url,
      filePath: g.map((x) => x.filePath).find(Boolean) ?? primary.filePath,
      displayLabel,
      projectId,
    });
  }

  return [...nonAuto, ...mergedAuto].sort(
    (a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime()
  );
}
