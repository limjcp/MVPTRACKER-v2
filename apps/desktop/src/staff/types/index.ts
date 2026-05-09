export type ProjectColor =
  | 'blue'
  | 'purple'
  | 'green'
  | 'orange'
  | 'red'
  | 'pink'
  | 'teal'
  | 'yellow'
  | 'indigo'
  | 'cyan';

export type ProjectScope = 'private' | 'team';

export interface Project {
  id: string;
  name: string;
  color: ProjectColor;
  icon: string;
  productivityScore: number; // 0-100
  hourlyRate?: number;
  client?: string;
  description?: string;
  totalTime: number; // seconds
  createdAt: string;
  /** Local vs team bucket (team sync is future work). */
  scope: ProjectScope;
  teamLabel?: string;
  rules?: Rule[];
}

export interface Rule {
  id: string;
  projectId: string;
  pattern: string; // app name or URL pattern
  type: 'app' | 'url' | 'document';
}

export interface ActivityEntry {
  id: string;
  appName: string;
  windowTitle: string;
  /** User-editable label shown in timeline / lists (persisted). */
  displayLabel?: string;
  url?: string;
  filePath?: string;
  startTime: string;
  endTime: string;
  duration: number; // seconds
  projectId?: string;
  category: AppCategory;
  productivity: number; // -1 = unproductive, 0 = neutral, 1 = productive
  type: 'automatic' | 'manual' | 'calendar';
  /** Automatic slices only: session boundary from last hydrate / app launch (`legacy` for pre-migration rows). */
  trackingSessionId?: string;
}

export interface ManualEntry {
  id: string;
  title: string;
  projectId?: string;
  startTime: string;
  endTime: string;
  duration: number;
  notes?: string;
  type: 'manual' | 'calendar';
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  calendar: string;
  color: string;
  recorded: boolean;
  projectId?: string;
}

/** Top-level activity buckets (aligned with product grouping + inference in `inferAppCategory`). */
export type AppCategory =
  | 'browser'
  | 'office'
  | 'tools'
  | 'graphics'
  | 'ide'
  | 'editor'
  | 'productivity'
  | 'communication'
  | 'media'
  | 'video'
  | 'reading'
  | 'system'
  | 'other';

/** Populated only for the anchor calendar day in `computeDailyStats` (e.g. “today” when anchor is now). */
export interface DayOverlapDiagnostic {
  /** Sum of per-row clipped lengths (double-counts wall clock when intervals overlap). */
  sumRawClippedSeconds: number;
  /** Union length of overlapping intervals (matches `totalTime`). */
  unionTotalSeconds: number;
  /** `sumRawClippedSeconds - unionTotalSeconds` (how much raw sums overstated wall time). */
  doubleCountedSeconds: number;
  /** Pairs of rows with positive overlap, largest first (capped). */
  pairs: Array<{
    overlapSec: number;
    aId: string;
    bId: string;
    aLabel: string;
    bLabel: string;
  }>;
}

export interface DailyStats {
  date: string;
  totalTime: number;
  productiveTime: number;
  unproductiveTime: number;
  /** Seconds with no foreground tracking between slices (gaps ≥ idle threshold), plus trailing gap today. */
  idleTime: number;
  productivityScore: number;
  projects: Record<string, number>;
  /** Only set for the stats row matching the anchor date (dashboard “today” debug). */
  overlapDiagnostics?: DayOverlapDiagnostic;
}

export interface ActiveTimer {
  id: string;
  projectId: string;
  startTime: string;
  elapsed: number;
  running: boolean;
  title?: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  idleThreshold: number; // minutes
  syncEnabled: boolean;
  calendarIntegration: boolean;
  menuBarWidget: boolean;
  showProductivityInMenuBar: boolean;
  defaultHourlyRate: number;
  currency: string;
  workingHoursStart: number;
  workingHoursEnd: number;
  trackingEnabled: boolean;
  exclusionList: string[];
}

export type ViewType = 'dashboard' | 'timeline' | 'review' | 'projects' | 'reports';

export interface TimelineBlock {
  id: string;
  startTime: string;
  endTime: string;
  duration: number;
  appName: string;
  windowTitle: string;
  /** Shown in timeline bar when set (from activity.displayLabel). */
  displayLabel?: string;
  projectId?: string;
  color: string;
  type: 'activity' | 'idle' | 'manual' | 'calendar';
  /** When merged for display, underlying activity/manual ids (no prefixes). */
  sourceIds?: string[];
  /** Populated for task-segment blocks (`seg-` prefix): activity slices overlapping the segment. */
  segmentActivities?: BucketActivityContribution[];
  /** @deprecated use segmentActivities */
  bucketActivities?: BucketActivityContribution[];
  /** Tagging state from `block_tags` (segment-tagged blocks). */
  corporationId?: string;
  taskType?: string;
  taskTypeDetail?: string;
}

export interface BucketActivityContribution {
  activityId: string;
  durationInBucket: number;
}

export interface Corporation {
  id: string;
  name: string;
  createdAt: string;
}

export interface TaskSegment {
  id: string;
  startTime: string;
  /** When null, segment is open and extends to “now” on the current day in the UI. */
  endTime: string | null;
  title?: string;
  createdAt: string;
  lastPromptAt?: string;
}

export interface BlockTag {
  /** Stable id: `segmentTag:${segmentId}` for segment tags, or legacy `${bucketStart}|${bucketEnd}`. */
  id: string;
  bucketDate: string;
  bucketStart: string;
  bucketEnd: string;
  corporationId?: string;
  /** Predefined task slug or `'other'`. */
  taskType?: string;
  /** Free-text fill-in (department for 'communicating_with_other_staff', label for 'other'). */
  taskTypeDetail?: string;
  updatedAt: string;
  /** When set, tag applies to the task segment with this id (UUID, no `seg-` prefix). */
  segmentId?: string;
}

