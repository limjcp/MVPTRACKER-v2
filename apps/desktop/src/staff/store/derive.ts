import { differenceInSeconds, format, parseISO, subDays } from 'date-fns';
import type { ActivityEntry, DailyStats, ManualEntry, Project, TimelineBlock } from '../types';
import { ACTIVITY_MERGE_GAP_MINUTES } from '../utils/activityMerge';
import { CATEGORY_HEX } from '../utils/appCategories';
import { PROJECT_COLORS } from '../utils/cn';

const AGGREGATE_SESSION_GAP_MS = ACTIVITY_MERGE_GAP_MINUTES * 60 * 1000;
const AGGREGATE_APP_LABEL = 'Activity';

function blockColorForActivity(a: ActivityEntry, projects: Project[]): string {
  if (a.projectId) {
    const p = projects.find((x) => x.id === a.projectId);
    if (p && PROJECT_COLORS[p.color]) return PROJECT_COLORS[p.color].dot;
  }
  return CATEGORY_HEX[a.category] ?? '#6B7280';
}

function blockColorForManual(m: ManualEntry, projects: Project[]): string {
  if (m.projectId) {
    const p = projects.find((x) => x.id === m.projectId);
    if (p && PROJECT_COLORS[p.color]) return PROJECT_COLORS[p.color].dot;
  }
  return '#8B5CF6';
}

/** One timeline bar per session: automatic rows chained by overlap or gap ≤ 15 min (any app). */
function aggregateAutomaticDayBlocks(
  dateStr: string,
  activities: ActivityEntry[],
  projects: Project[]
): TimelineBlock[] {
  const dayAutomatic = activities
    .filter((a) => a.type === 'automatic' && format(parseISO(a.startTime), 'yyyy-MM-dd') === dateStr)
    .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());

  if (dayAutomatic.length === 0) return [];

  const clusters: ActivityEntry[][] = [];
  let cluster: ActivityEntry[] = [];
  let clusterEndMs = 0;

  const flush = () => {
    if (cluster.length) clusters.push(cluster);
    cluster = [];
    clusterEndMs = 0;
  };

  for (const a of dayAutomatic) {
    const s = parseISO(a.startTime).getTime();
    const e = parseISO(a.endTime).getTime();
    if (cluster.length === 0) {
      cluster = [a];
      clusterEndMs = e;
      continue;
    }
    if (s <= clusterEndMs + AGGREGATE_SESSION_GAP_MS) {
      cluster.push(a);
      clusterEndMs = Math.max(clusterEndMs, e);
    } else {
      flush();
      cluster = [a];
      clusterEndMs = e;
    }
  }
  flush();

  return clusters.map((acts) => {
    const starts = acts.map((x) => parseISO(x.startTime).getTime());
    const ends = acts.map((x) => parseISO(x.endTime).getTime());
    const startMs = Math.min(...starts);
    const endMs = Math.max(...ends);
    const startTime = new Date(startMs).toISOString();
    const endTime = new Date(endMs).toISOString();
    const duration = Math.max(0, differenceInSeconds(parseISO(endTime), parseISO(startTime)));
    const sourceIds = acts.map((x) => x.id);
    const labels = acts.map((x) => x.displayLabel).filter(Boolean) as string[];
    const displayLabel = labels.length && new Set(labels).size === 1 ? labels[0] : undefined;
    const projectIds = [...new Set(acts.map((x) => x.projectId).filter(Boolean))] as string[];
    const projectId = projectIds.length === 1 ? projectIds[0] : undefined;
    const primary = [...acts].sort((x, y) => y.duration - x.duration)[0]!;

    return {
      id: `agg-${startMs}-${endMs}-${sourceIds[0]}`,
      startTime,
      endTime,
      duration,
      appName: AGGREGATE_APP_LABEL,
      windowTitle: '',
      displayLabel,
      projectId,
      color: blockColorForActivity(primary, projects),
      type: 'activity' as const,
      sourceIds,
    };
  });
}

export function computeTimelineBlocks(
  dateStr: string,
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  projects: Project[]
): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];

  blocks.push(...aggregateAutomaticDayBlocks(dateStr, activities, projects));

  for (const a of activities) {
    if (format(parseISO(a.startTime), 'yyyy-MM-dd') !== dateStr) continue;
    if (a.type === 'automatic') continue;
    blocks.push({
      id: `act-${a.id}`,
      startTime: a.startTime,
      endTime: a.endTime,
      duration: a.duration,
      appName: a.appName,
      windowTitle: a.windowTitle,
      displayLabel: a.displayLabel,
      projectId: a.projectId,
      color: blockColorForActivity(a, projects),
      type: a.type === 'calendar' ? 'calendar' : 'activity',
    });
  }

  for (const m of manualEntries) {
    if (format(parseISO(m.startTime), 'yyyy-MM-dd') !== dateStr) continue;
    blocks.push({
      id: `man-${m.id}`,
      startTime: m.startTime,
      endTime: m.endTime,
      duration: m.duration,
      appName: 'Manual entry',
      windowTitle: m.title,
      projectId: m.projectId,
      color: blockColorForManual(m, projects),
      type: m.type === 'calendar' ? 'calendar' : 'manual',
    });
  }

  blocks.sort((x, y) => parseISO(x.startTime).getTime() - parseISO(y.startTime).getTime());
  return blocks;
}

function intervalsOverlap(a: TimelineBlock, b: TimelineBlock): boolean {
  const as = parseISO(a.startTime).getTime();
  const ae = parseISO(a.endTime).getTime();
  const bs = parseISO(b.startTime).getTime();
  const be = parseISO(b.endTime).getTime();
  return as < be && bs < ae;
}

function stripBlockPrefix(id: string): string {
  if (id.startsWith('act-')) return id.slice(4);
  if (id.startsWith('man-')) return id.slice(4);
  return id;
}

function mergeComponentGroup(
  comp: TimelineBlock[],
  activityById: Map<string, ActivityEntry>,
  _manualById: Map<string, ManualEntry>
): TimelineBlock {
  const primary = [...comp].sort((x, y) => y.duration - x.duration)[0]!;
  const starts = comp.map((b) => parseISO(b.startTime).getTime());
  const ends = comp.map((b) => parseISO(b.endTime).getTime());
  const startMs = Math.min(...starts);
  const endMs = Math.max(...ends);
  const startTime = new Date(startMs).toISOString();
  const endTime = new Date(endMs).toISOString();
  const duration = Math.max(0, differenceInSeconds(parseISO(endTime), parseISO(startTime)));
  const sourceIds = comp.map((b) => stripBlockPrefix(b.id));

  let displayLabel = primary.displayLabel;
  if (primary.type === 'activity' && primary.id.startsWith('act-')) {
    const a = activityById.get(primary.id.slice(4));
    displayLabel = a?.displayLabel ?? primary.displayLabel;
  }

  const projectIds = [...new Set(comp.map((b) => b.projectId).filter(Boolean))] as string[];
  const projectId = projectIds.length === 1 ? projectIds[0] : undefined;

  return {
    id: `merged-${startMs}-${sourceIds.join('|')}`,
    startTime,
    endTime,
    duration,
    appName: primary.appName,
    windowTitle: primary.windowTitle,
    displayLabel,
    projectId,
    color: primary.color,
    type: primary.type,
    sourceIds,
  };
}

/**
 * Merges overlapping timeline intervals within the same block type so the lane is single-column.
 * Underlying activities/manual rows stay in the store; `sourceIds` lists contributors.
 */
export function mergeOverlappingTimelineBlocks(
  blocks: TimelineBlock[],
  activities: ActivityEntry[],
  manualEntries: ManualEntry[]
): TimelineBlock[] {
  if (blocks.length === 0) return [];

  const activityById = new Map(activities.map((a) => [a.id, a]));
  const manualById = new Map(manualEntries.map((m) => [m.id, m]));

  const byType = new Map<TimelineBlock['type'], TimelineBlock[]>();
  for (const b of blocks) {
    const list = byType.get(b.type) ?? [];
    list.push(b);
    byType.set(b.type, list);
  }

  const out: TimelineBlock[] = [];
  for (const [, group] of byType) {
    const sorted = [...group].sort(
      (x, y) => parseISO(x.startTime).getTime() - parseISO(y.startTime).getTime()
    );
    const components: TimelineBlock[][] = [];
    for (const b of sorted) {
      let placed = false;
      for (const comp of components) {
        if (comp.some((c) => intervalsOverlap(c, b))) {
          comp.push(b);
          placed = true;
          break;
        }
      }
      if (!placed) components.push([b]);
    }
    for (const comp of components) {
      if (comp.length === 1) {
        const only = comp[0]!;
        if (only.type === 'activity' && only.id.startsWith('act-')) {
          const a = activityById.get(only.id.slice(4));
          out.push({ ...only, displayLabel: a?.displayLabel ?? only.displayLabel });
        } else if (only.type === 'activity' && only.sourceIds?.length) {
          const labels = only.sourceIds
            .map((id) => activityById.get(id)?.displayLabel)
            .filter(Boolean) as string[];
          const unified =
            labels.length && new Set(labels).size === 1 ? labels[0] : only.displayLabel;
          out.push({ ...only, displayLabel: unified });
        } else {
          out.push(only);
        }
      } else {
        out.push(mergeComponentGroup(comp, activityById, manualById));
      }
    }
  }

  return out.sort((x, y) => parseISO(x.startTime).getTime() - parseISO(y.startTime).getTime());
}

export function computeDailyStats(
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  days: number,
  anchorDate: Date
): DailyStats[] {
  const out: DailyStats[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(anchorDate, i);
    const dateStr = format(d, 'yyyy-MM-dd');

    let totalTime = 0;
    let productiveTime = 0;
    let unproductiveTime = 0;
    const projectSeconds: Record<string, number> = {};

    const addProjectTime = (pid: string | undefined, secs: number) => {
      if (!pid) return;
      projectSeconds[pid] = (projectSeconds[pid] ?? 0) + secs;
    };

    for (const a of activities) {
      if (format(parseISO(a.startTime), 'yyyy-MM-dd') !== dateStr) continue;
      totalTime += a.duration;
      if (a.productivity > 0) productiveTime += a.duration;
      else if (a.productivity < 0) unproductiveTime += a.duration;
      addProjectTime(a.projectId, a.duration);
    }

    for (const m of manualEntries) {
      if (format(parseISO(m.startTime), 'yyyy-MM-dd') !== dateStr) continue;
      totalTime += m.duration;
      productiveTime += m.duration;
      addProjectTime(m.projectId, m.duration);
    }

    const denom = productiveTime + unproductiveTime;
    const productivityScore =
      denom > 0 ? Math.round((productiveTime / denom) * 100) : totalTime > 0 ? 50 : 0;

    out.push({
      date: dateStr,
      totalTime,
      productiveTime,
      unproductiveTime,
      productivityScore,
      projects: projectSeconds,
    });
  }
  return out;
}
