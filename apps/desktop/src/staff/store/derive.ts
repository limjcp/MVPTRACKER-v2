import { differenceInSeconds, format, parseISO, subDays } from 'date-fns';
import type {
  ActivityEntry,
  BlockTag,
  BucketActivityContribution,
  DailyStats,
  DayOverlapDiagnostic,
  ManualEntry,
  Project,
  TaskSegment,
  TimelineBlock,
} from '../types';
import { CATEGORY_HEX, effectiveActivityProductivity } from '../utils/appCategories';
import { PROJECT_COLORS } from '../utils/cn';
import { formatTaskType } from '../utils/taskTypes';

const TASK_BLOCK_APP = 'Task';

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

export function blockTagBucketId(bucketStartIso: string, bucketEndIso: string): string {
  return `${bucketStartIso}|${bucketEndIso}`;
}

/** Stable block_tags row id for a task segment. */
export function blockSegmentTagId(segmentId: string): string {
  return `segmentTag:${segmentId}`;
}

function segmentWallEndMs(s: TaskSegment, nowIso: string): number {
  if (s.endTime) return parseISO(s.endTime).getTime();
  return parseISO(nowIso).getTime();
}

/** Intersects [startMs, endMs] with the calendar day `dateStr` (local midnight bounds). */
function clipIntervalToDay(
  startMs: number,
  endMs: number,
  dateStr: string
): { start: number; end: number } | null {
  const d0 = parseISO(`${dateStr}T00:00:00`).getTime();
  const d1 = parseISO(`${dateStr}T23:59:59.999`).getTime();
  const s = Math.max(startMs, d0);
  const e = Math.min(endMs, d1);
  if (e <= s) return null;
  return { start: s, end: e };
}

/** Screen-time lane: one bar per task segment; underlying apps are not separate timeline blocks. */
function computeTaskSegmentBlocksForDay(
  dateStr: string,
  taskSegments: TaskSegment[],
  activities: ActivityEntry[],
  projects: Project[],
  nowIso: string,
  blockTags: BlockTag[] = []
): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];

  const tagBySegmentId = new Map<string, BlockTag>();
  for (const t of blockTags) {
    if (t.segmentId) tagBySegmentId.set(t.segmentId, t);
  }

  const segmentsTouchingDay = taskSegments.filter((s) => {
    const ss = parseISO(s.startTime).getTime();
    const ee = segmentWallEndMs(s, nowIso);
    return clipIntervalToDay(ss, ee, dateStr) !== null;
  });

  if (segmentsTouchingDay.length === 0) {
    return [];
  }

  for (const s of segmentsTouchingDay) {
    const ss = parseISO(s.startTime).getTime();
    const ee = segmentWallEndMs(s, nowIso);
    const clip = clipIntervalToDay(ss, ee, dateStr);
    if (!clip) continue;

    const fullStart = ss;
    const fullEnd = ee;

    const contributions: BucketActivityContribution[] = [];
    let dominant: ActivityEntry | undefined;
    let dominantOverlap = 0;
    const labelSet = new Set<string>();
    const projectIdSet = new Set<string>();

    for (const a of activities) {
      if (a.type !== 'automatic') continue;
      const aStart = parseISO(a.startTime).getTime();
      const aEnd = parseISO(a.endTime).getTime();
      const overlap = Math.max(0, Math.min(aEnd, fullEnd) - Math.max(aStart, fullStart));
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

    const startTime = new Date(clip.start).toISOString();
    const endTime = new Date(clip.end).toISOString();
    const duration = Math.max(0, differenceInSeconds(parseISO(endTime), parseISO(startTime)));
    const titleTrim = s.title?.trim();
    const segTag = tagBySegmentId.get(s.id);
    const typeFromTag =
      segTag?.taskType != null && String(segTag.taskType).trim() !== ''
        ? formatTaskType(segTag.taskType, segTag.taskTypeDetail)
        : '';
    const displayLabel =
      typeFromTag ||
      titleTrim ||
      (labelSet.size === 1 ? [...labelSet][0] : undefined) ||
      'Task';
    const projectId = projectIdSet.size === 1 ? [...projectIdSet][0] : undefined;
    const primaryActivity =
      dominant ??
      (contributions.length
        ? activities.find((x) => x.id === contributions[0]!.activityId)
        : undefined);
    const color = primaryActivity ? blockColorForActivity(primaryActivity, projects) : '#6B7280';

    blocks.push({
      id: `seg-${s.id}`,
      startTime,
      endTime,
      duration,
      appName: TASK_BLOCK_APP,
      windowTitle: '',
      displayLabel,
      projectId,
      color,
      type: 'activity' as const,
      sourceIds: contributions.map((c) => c.activityId),
      segmentActivities: contributions,
      bucketActivities: contributions,
    });
  }

  return blocks;
}

function applyBlockTags(blocks: TimelineBlock[], blockTags: BlockTag[]): TimelineBlock[] {
  if (blockTags.length === 0) return blocks;
  const bySegmentId = new Map<string, BlockTag>();
  const byLegacyBucket = new Map<string, BlockTag>();
  for (const t of blockTags) {
    if (t.segmentId) bySegmentId.set(t.segmentId, t);
    if (!t.segmentId) byLegacyBucket.set(blockTagBucketId(t.bucketStart, t.bucketEnd), t);
  }

  return blocks.map((b) => {
    if (b.id.startsWith('seg-')) {
      const segId = b.id.slice(4);
      const tag =
        bySegmentId.get(segId) ?? byLegacyBucket.get(blockTagBucketId(b.startTime, b.endTime));
      if (!tag) return b;
      return {
        ...b,
        corporationId: tag.corporationId,
        taskType: tag.taskType,
        taskTypeDetail: tag.taskTypeDetail,
      };
    }
    if (b.id.startsWith('bkt-')) {
      const tag = byLegacyBucket.get(blockTagBucketId(b.startTime, b.endTime));
      if (!tag) return b;
      return {
        ...b,
        corporationId: tag.corporationId,
        taskType: tag.taskType,
        taskTypeDetail: tag.taskTypeDetail,
      };
    }
    return b;
  });
}

export function computeTimelineBlocks(
  dateStr: string,
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  projects: Project[],
  blockTags: BlockTag[] = [],
  taskSegments: TaskSegment[] = [],
  nowIso: string = new Date().toISOString()
): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];

  blocks.push(
    ...computeTaskSegmentBlocksForDay(dateStr, taskSegments, activities, projects, nowIso, blockTags)
  );

  // Per-app automatic tracking is folded into `seg-*` blocks only — no separate `act-*` rows.
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
 * Task segment blocks (`seg-`) stay separate (carry segmentActivities / tags).
 */
export function mergeOverlappingTimelineBlocks(
  blocks: TimelineBlock[],
  activities: ActivityEntry[],
  manualEntries: ManualEntry[]
): TimelineBlock[] {
  if (blocks.length === 0) return [];

  const activityById = new Map(activities.map((a) => [a.id, a]));
  const manualById = new Map(manualEntries.map((m) => [m.id, m]));

  const passthrough: TimelineBlock[] = [];
  const mergeable: TimelineBlock[] = [];
  for (const b of blocks) {
    if (b.id.startsWith('bkt-') || b.id.startsWith('seg-')) passthrough.push(b);
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

/** Gaps between automatic slices (and trailing gap on anchor day) counted as idle when ≥ threshold. */
function computeIdleSecondsForDay(
  dateStr: string,
  activities: ActivityEntry[],
  idleThresholdMinutes: number,
  anchorDate: Date
): number {
  const thresholdSec = Math.max(0, idleThresholdMinutes) * 60;
  const auto = activities
    .filter((a) => a.type === 'automatic' && format(parseISO(a.startTime), 'yyyy-MM-dd') === dateStr)
    .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());

  let idle = 0;
  for (let i = 0; i < auto.length - 1; i++) {
    const end = parseISO(auto[i]!.endTime).getTime();
    const nextStart = parseISO(auto[i + 1]!.startTime).getTime();
    const gapSec = Math.max(0, Math.round((nextStart - end) / 1000));
    if (gapSec >= thresholdSec) idle += gapSec;
  }

  const todayStr = format(anchorDate, 'yyyy-MM-dd');
  if (dateStr === todayStr && auto.length > 0) {
    const lastEnd = parseISO(auto[auto.length - 1]!.endTime).getTime();
    const tailSec = Math.max(0, Math.round((anchorDate.getTime() - lastEnd) / 1000));
    if (tailSec >= thresholdSec) idle += tailSec;
  }

  return idle;
}

type ClippedDayRow = {
  id: string;
  label: string;
  startMs: number;
  endMs: number;
  prod: number;
  projectId?: string;
};

function gatherClippedRowsForDay(
  dateStr: string,
  activities: ActivityEntry[],
  manualEntries: ManualEntry[]
): ClippedDayRow[] {
  const out: ClippedDayRow[] = [];

  for (const a of activities) {
    const s = parseISO(a.startTime).getTime();
    const e = parseISO(a.endTime).getTime();
    const clip = clipIntervalToDay(s, e, dateStr);
    if (!clip) continue;
    out.push({
      id: a.id,
      label: a.appName,
      startMs: clip.start,
      endMs: clip.end,
      prod: effectiveActivityProductivity(a),
      projectId: a.projectId,
    });
  }

  for (const m of manualEntries) {
    const s = parseISO(m.startTime).getTime();
    const e = parseISO(m.endTime).getTime();
    const clip = clipIntervalToDay(s, e, dateStr);
    if (!clip) continue;
    out.push({
      id: `man:${m.id}`,
      label: `Manual · ${m.title}`,
      startMs: clip.start,
      endMs: clip.end,
      prod: 1,
      projectId: m.projectId,
    });
  }

  return out;
}

/** Per-second classification on the union timeline: distraction wins over productive over neutral. */
function sweepDayUnionMetrics(rows: ClippedDayRow[]): {
  totalSec: number;
  productiveSec: number;
  unproductiveSec: number;
} {
  if (rows.length === 0) {
    return { totalSec: 0, productiveSec: 0, unproductiveSec: 0 };
  }

  const bounds = new Set<number>();
  for (const r of rows) {
    bounds.add(r.startMs);
    bounds.add(r.endMs);
  }
  const sorted = [...bounds].sort((a, b) => a - b);

  let totalSec = 0;
  let productiveSec = 0;
  let unproductiveSec = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i]!;
    const hi = sorted[i + 1]!;
    if (hi <= lo) continue;

    const covering = rows.filter((r) => r.startMs < hi && r.endMs > lo);
    if (covering.length === 0) continue;

    const sec = Math.max(0, Math.round((hi - lo) / 1000));
    if (sec <= 0) continue;

    totalSec += sec;
    const anyNeg = covering.some((r) => r.prod < 0);
    const anyPos = covering.some((r) => r.prod > 0);
    if (anyNeg) unproductiveSec += sec;
    else if (anyPos) productiveSec += sec;
  }

  return { totalSec, productiveSec, unproductiveSec };
}

const MAX_OVERLAP_PAIRS = 28;

function buildOverlapDiagnostics(
  rows: ClippedDayRow[],
  unionTotalSeconds: number
): DayOverlapDiagnostic {
  let sumRawClippedSeconds = 0;
  for (const r of rows) {
    sumRawClippedSeconds += Math.max(0, Math.round((r.endMs - r.startMs) / 1000));
  }

  const pairs: DayOverlapDiagnostic['pairs'] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      const start = Math.max(a.startMs, b.startMs);
      const end = Math.min(a.endMs, b.endMs);
      if (end <= start) continue;
      const overlapSec = Math.max(0, Math.round((end - start) / 1000));
      if (overlapSec < 1) continue;
      pairs.push({
        overlapSec,
        aId: a.id,
        bId: b.id,
        aLabel: a.label,
        bLabel: b.label,
      });
    }
  }
  pairs.sort((x, y) => y.overlapSec - x.overlapSec);
  const top = pairs.slice(0, MAX_OVERLAP_PAIRS);

  return {
    sumRawClippedSeconds,
    unionTotalSeconds: unionTotalSeconds,
    doubleCountedSeconds: Math.max(0, sumRawClippedSeconds - unionTotalSeconds),
    pairs: top,
  };
}

export function computeDailyStats(
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  days: number,
  anchorDate: Date,
  idleThresholdMinutes: number = 2
): DailyStats[] {
  const out: DailyStats[] = [];
  const anchorDayStr = format(anchorDate, 'yyyy-MM-dd');

  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(anchorDate, i);
    const dateStr = format(d, 'yyyy-MM-dd');

    const clippedRows = gatherClippedRowsForDay(dateStr, activities, manualEntries);
    const { totalSec, productiveSec, unproductiveSec } = sweepDayUnionMetrics(clippedRows);

    const totalTime = totalSec;
    const productiveTime = productiveSec;
    const unproductiveTime = unproductiveSec;

    const projectSeconds: Record<string, number> = {};
    for (const r of clippedRows) {
      if (!r.projectId) continue;
      const len = Math.max(0, Math.round((r.endMs - r.startMs) / 1000));
      projectSeconds[r.projectId] = (projectSeconds[r.projectId] ?? 0) + len;
    }

    const denom = productiveTime + unproductiveTime;
    const productivityScore =
      denom > 0 ? Math.round((productiveTime / denom) * 100) : totalTime > 0 ? 50 : 0;

    const idleTime = computeIdleSecondsForDay(dateStr, activities, idleThresholdMinutes, anchorDate);

    const overlapDiagnostics =
      dateStr === anchorDayStr ? buildOverlapDiagnostics(clippedRows, totalTime) : undefined;

    out.push({
      date: dateStr,
      totalTime,
      productiveTime,
      unproductiveTime,
      idleTime,
      productivityScore,
      projects: projectSeconds,
      overlapDiagnostics,
    });
  }
  return out;
}
