import { differenceInSeconds, format, parseISO, subDays } from 'date-fns';
import type {
  ActivityEntry,
  BlockTag,
  BucketActivityContribution,
  DailyStats,
  ManualEntry,
  Project,
  TimelineBlock,
} from '../types';
import { ACTIVITY_MERGE_GAP_MINUTES } from '../utils/activityMerge';
import { CATEGORY_HEX } from '../utils/appCategories';
import { PROJECT_COLORS } from '../utils/cn';

const AGGREGATE_SESSION_GAP_MS = ACTIVITY_MERGE_GAP_MINUTES * 60 * 1000;
const BUCKET_DURATION_MS = 15 * 60 * 1000;
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

function bucketIdFor(startMs: number, endMs: number): string {
  return `bkt-${startMs}-${endMs}`;
}

export function blockTagBucketId(bucketStartIso: string, bucketEndIso: string): string {
  return `${bucketStartIso}|${bucketEndIso}`;
}

/**
 * Slice automatic activities into rolling 15-minute buckets.
 *
 * Sessions are runs of automatic activities where consecutive rows are no more
 * than `ACTIVITY_MERGE_GAP_MINUTES` apart. Each session anchors its own 15-min
 * cadence at the first activity's start, so the bucket clock restarts after any
 * idle gap > 15 min. Buckets are emitted with fixed 15-min width as long as any
 * activity overlaps the slot; empty slots are skipped.
 */
function computeFifteenMinuteBuckets(
  dateStr: string,
  activities: ActivityEntry[],
  projects: Project[]
): TimelineBlock[] {
  const dayAutomatic = activities
    .filter((a) => a.type === 'automatic' && format(parseISO(a.startTime), 'yyyy-MM-dd') === dateStr)
    .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());

  if (dayAutomatic.length === 0) return [];

  const sessions: ActivityEntry[][] = [];
  let session: ActivityEntry[] = [];
  let prevEndMs = 0;
  for (const a of dayAutomatic) {
    const s = parseISO(a.startTime).getTime();
    const e = parseISO(a.endTime).getTime();
    if (session.length === 0 || s - prevEndMs > AGGREGATE_SESSION_GAP_MS) {
      if (session.length) sessions.push(session);
      session = [a];
    } else {
      session.push(a);
    }
    prevEndMs = Math.max(prevEndMs, e);
  }
  if (session.length) sessions.push(session);

  const out: TimelineBlock[] = [];

  for (const sess of sessions) {
    const anchorMs = parseISO(sess[0]!.startTime).getTime();
    const sessionEndMs = sess.reduce(
      (m, a) => Math.max(m, parseISO(a.endTime).getTime()),
      0
    );
    const slotCount = Math.max(1, Math.ceil((sessionEndMs - anchorMs) / BUCKET_DURATION_MS));

    for (let i = 0; i < slotCount; i++) {
      const startMs = anchorMs + i * BUCKET_DURATION_MS;
      const endMs = startMs + BUCKET_DURATION_MS;

      const contributions: BucketActivityContribution[] = [];
      let dominant: ActivityEntry | undefined;
      let dominantOverlap = 0;
      const labelSet = new Set<string>();
      const projectIdSet = new Set<string>();

      for (const a of sess) {
        const aStart = parseISO(a.startTime).getTime();
        const aEnd = parseISO(a.endTime).getTime();
        const overlap = Math.max(0, Math.min(aEnd, endMs) - Math.max(aStart, startMs));
        if (overlap <= 0) continue;
        contributions.push({
          activityId: a.id,
          durationInBucket: Math.round(overlap / 1000),
        });
        if (overlap > dominantOverlap) {
          dominant = a;
          dominantOverlap = overlap;
        }
        if (a.displayLabel?.trim()) labelSet.add(a.displayLabel.trim());
        if (a.projectId) projectIdSet.add(a.projectId);
      }

      if (contributions.length === 0) continue;

      const startTime = new Date(startMs).toISOString();
      const endTime = new Date(endMs).toISOString();
      const totalSecs = contributions.reduce((s, c) => s + c.durationInBucket, 0);
      const displayLabel = labelSet.size === 1 ? [...labelSet][0] : undefined;
      const projectId = projectIdSet.size === 1 ? [...projectIdSet][0] : undefined;
      const primary = dominant ?? sess[0]!;

      out.push({
        id: bucketIdFor(startMs, endMs),
        startTime,
        endTime,
        duration: totalSecs,
        appName: AGGREGATE_APP_LABEL,
        windowTitle: '',
        displayLabel,
        projectId,
        color: blockColorForActivity(primary, projects),
        type: 'activity' as const,
        sourceIds: contributions.map((c) => c.activityId),
        bucketActivities: contributions,
      });
    }
  }

  return out;
}

function applyBlockTags(
  blocks: TimelineBlock[],
  blockTags: BlockTag[]
): TimelineBlock[] {
  if (blockTags.length === 0) return blocks;
  const byId = new Map<string, BlockTag>();
  for (const t of blockTags) byId.set(t.id, t);

  return blocks.map((b) => {
    if (!b.id.startsWith('bkt-')) return b;
    const tagId = blockTagBucketId(b.startTime, b.endTime);
    const tag = byId.get(tagId);
    if (!tag) return b;
    return {
      ...b,
      corporationId: tag.corporationId,
      taskType: tag.taskType,
      taskTypeDetail: tag.taskTypeDetail,
    };
  });
}

export function computeTimelineBlocks(
  dateStr: string,
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  projects: Project[],
  blockTags: BlockTag[] = []
): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];

  blocks.push(...computeFifteenMinuteBuckets(dateStr, activities, projects));

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
  return applyBlockTags(blocks, blockTags);
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

  // 15-min bucket blocks are disjoint and carry their own `bucketActivities`
  // payload; never merge them with other blocks (would lose the per-activity
  // contribution data and the stable bucket id used by block_tags).
  const passthrough: TimelineBlock[] = [];
  const mergeable: TimelineBlock[] = [];
  for (const b of blocks) {
    if (b.id.startsWith('bkt-')) passthrough.push(b);
    else mergeable.push(b);
  }

  const byType = new Map<TimelineBlock['type'], TimelineBlock[]>();
  for (const b of mergeable) {
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

  return [...out, ...passthrough].sort(
    (x, y) => parseISO(x.startTime).getTime() - parseISO(y.startTime).getTime()
  );
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
