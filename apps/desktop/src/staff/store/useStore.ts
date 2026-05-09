import { create } from 'zustand';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  Project,
  ActivityEntry,
  ManualEntry,
  CalendarEvent,
  DailyStats,
  AppSettings,
  ViewType,
  TimelineBlock,
  Corporation,
  BlockTag,
  TaskSegment,
} from '../types';
import { invalidateTrackingPrefsCache } from '../trackingPrefsCache';
import {
  blockSegmentTagId,
  computeDailyStats,
  computeTimelineBlocks,
  mergeOverlappingTimelineBlocks,
} from './derive';
import { normalizeStoredCategory } from '../utils/appCategories';
import { SYSTEM_PROJECT_SPECS, buildSystemProjectRow } from '../utils/systemProjects';

/** Timeline vertical zoom; persisted in localStorage across views and reloads. */
export const TIMELINE_ZOOM_MIN = 0.125;
export const TIMELINE_ZOOM_MAX = 48;
const TIMELINE_ZOOM_STORAGE_KEY = 'mvptime:timelineZoom';
const TIMELINE_ZOOM_STORAGE_KEY_LEGACY = 'mvptracker:timelineZoom';

function readStoredTimelineZoom(): number {
  if (typeof localStorage === 'undefined') return 1;
  try {
    const raw =
      localStorage.getItem(TIMELINE_ZOOM_STORAGE_KEY) ??
      localStorage.getItem(TIMELINE_ZOOM_STORAGE_KEY_LEGACY);
    if (raw == null || raw === '') return 1;
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) return 1;
    const v = Math.min(TIMELINE_ZOOM_MAX, Math.max(TIMELINE_ZOOM_MIN, Math.round(n * 1000) / 1000));
    // Migrate forward.
    try {
      localStorage.setItem(TIMELINE_ZOOM_STORAGE_KEY, String(v));
      localStorage.removeItem(TIMELINE_ZOOM_STORAGE_KEY_LEGACY);
    } catch {
      // ignore
    }
    return v;
  } catch {
    return 1;
  }
}

function persistTimelineZoom(value: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TIMELINE_ZOOM_STORAGE_KEY, String(value));
  } catch {
    // ignore quota / private mode
  }
}

function isTauriRuntime() {
  return isTauri();
}

function parseIsoMs(iso: string): number {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
}

function findBlockTagForSegment(blockTags: BlockTag[], segmentId: string): BlockTag | undefined {
  const stable = blockSegmentTagId(segmentId);
  return blockTags.find((t) => t.segmentId === segmentId || t.id === stable);
}

function blockTagHasCorpOrTask(t: BlockTag | undefined): boolean {
  if (!t) return false;
  const c = t.corporationId?.trim();
  const tt = t.taskType?.trim();
  const td = t.taskTypeDetail?.trim();
  return Boolean(c || tt || td);
}

/**
 * If the open task segment has no corp/task in SQLite-backed tags, copy from the last closed
 * tagged segment (or latest legacy bucket tag). Hydrate must load block_tags *after*
 * `db_ensure_open_task_segment` so Rust-written tags are visible; this also patches gaps.
 */
async function ensureOpenSegmentTagFromHistory(
  taskSegments: TaskSegment[],
  blockTags: BlockTag[],
  nowIso: string
): Promise<BlockTag[]> {
  const open = taskSegments.find((s) => !s.endTime);
  if (!open) return blockTags;
  if (blockTagHasCorpOrTask(findBlockTagForSegment(blockTags, open.id))) {
    return blockTags;
  }

  const closed = taskSegments
    .filter((s) => s.endTime && s.id !== open.id)
    .sort((a, b) => parseIsoMs(b.endTime!) - parseIsoMs(a.endTime!));

  let donor: BlockTag | undefined;
  for (const s of closed) {
    const t = findBlockTagForSegment(blockTags, s.id);
    if (blockTagHasCorpOrTask(t)) {
      donor = t;
      break;
    }
  }

  if (!donor) {
    donor = [...blockTags]
      .filter((t) => !t.segmentId && blockTagHasCorpOrTask(t))
      .sort((a, b) => parseIsoMs(b.updatedAt) - parseIsoMs(a.updatedAt))[0];
  }

  if (!donor) return blockTags;

  const bucketDate = nowIso.slice(0, 10);
  const merged: BlockTag = {
    id: blockSegmentTagId(open.id),
    bucketDate,
    bucketStart: nowIso,
    bucketEnd: nowIso,
    segmentId: open.id,
    corporationId: donor.corporationId,
    taskType: donor.taskType,
    taskTypeDetail: donor.taskTypeDetail,
    updatedAt: nowIso,
  };
  await invoke('db_set_block_tag', { tag: toBlockTagRow(merged) });
  return [
    ...blockTags.filter((t) => t.segmentId !== open.id && t.id !== merged.id),
    merged,
  ];
}

function toProjectRow(p: Project) {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    icon: p.icon,
    productivity_score: p.productivityScore,
    hourly_rate: p.hourlyRate ?? null,
    client: p.client ?? null,
    description: p.description ?? null,
    total_time: p.totalTime,
    created_at: p.createdAt,
    scope: p.scope === 'team' ? 'team' : 'private',
    team_label: p.teamLabel ?? null,
  };
}

function fromProjectRow(r: any): Project {
  const scopeRaw = String(r.scope ?? 'private');
  const scope = scopeRaw === 'team' ? 'team' : 'private';
  return {
    id: String(r.id),
    name: String(r.name),
    color: r.color,
    icon: String(r.icon),
    productivityScore: Number(r.productivity_score ?? r.productivityScore ?? 0),
    hourlyRate: r.hourly_rate ?? r.hourlyRate ?? undefined,
    client: r.client ?? undefined,
    description: r.description ?? undefined,
    totalTime: Number(r.total_time ?? r.totalTime ?? 0),
    createdAt: String(r.created_at ?? r.createdAt ?? new Date().toISOString()),
    scope,
    teamLabel: r.team_label ?? r.teamLabel ?? undefined,
  };
}

function toManualEntryRow(e: ManualEntry) {
  return {
    id: e.id,
    title: e.title,
    project_id: e.projectId ?? null,
    start_time: e.startTime,
    end_time: e.endTime,
    duration: e.duration,
    notes: e.notes ?? null,
    entry_type: e.type,
  };
}

function fromManualEntryRow(r: any): ManualEntry {
  return {
    id: String(r.id),
    title: String(r.title),
    projectId: r.project_id ?? undefined,
    startTime: String(r.start_time),
    endTime: String(r.end_time),
    duration: Number(r.duration),
    notes: r.notes ?? undefined,
    type: (r.entry_type || 'manual') as ManualEntry['type'],
  };
}

function toActivityRow(a: ActivityEntry) {
  return {
    id: a.id,
    app_name: a.appName,
    window_title: a.windowTitle,
    url: a.url ?? null,
    file_path: a.filePath ?? null,
    start_time: a.startTime,
    end_time: a.endTime,
    duration: a.duration,
    project_id: a.projectId ?? null,
    category: a.category,
    productivity: a.productivity,
    activity_type: a.type,
    display_label: a.displayLabel ?? null,
    tracking_session_id: a.trackingSessionId ?? null,
  };
}

function toCorporationRow(c: Corporation) {
  return {
    id: c.id,
    name: c.name,
    created_at: c.createdAt,
  };
}

function fromCorporationRow(r: any): Corporation {
  return {
    id: String(r.id),
    name: String(r.name),
    createdAt: String(r.created_at ?? r.createdAt ?? new Date().toISOString()),
  };
}

function toBlockTagRow(t: BlockTag) {
  return {
    id: t.id,
    bucket_date: t.bucketDate,
    bucket_start: t.bucketStart,
    bucket_end: t.bucketEnd,
    corporation_id: t.corporationId ?? null,
    task_type: t.taskType ?? null,
    task_type_detail: t.taskTypeDetail ?? null,
    updated_at: t.updatedAt,
    segment_id: t.segmentId ?? null,
  };
}

function fromBlockTagRow(r: any): BlockTag {
  return {
    id: String(r.id),
    bucketDate: String(r.bucket_date ?? r.bucketDate),
    bucketStart: String(r.bucket_start ?? r.bucketStart),
    bucketEnd: String(r.bucket_end ?? r.bucketEnd),
    corporationId: r.corporation_id ?? r.corporationId ?? undefined,
    taskType: r.task_type ?? r.taskType ?? undefined,
    taskTypeDetail: r.task_type_detail ?? r.taskTypeDetail ?? undefined,
    updatedAt: String(r.updated_at ?? r.updatedAt ?? new Date().toISOString()),
    segmentId: r.segment_id ?? r.segmentId ?? undefined,
  };
}

function fromTaskSegmentRow(r: any): TaskSegment {
  return {
    id: String(r.id),
    startTime: String(r.start_time ?? r.startTime),
    endTime: (r.end_time ?? r.endTime) != null ? String(r.end_time ?? r.endTime) : null,
    title: r.title != null ? String(r.title) : undefined,
    createdAt: String(r.created_at ?? r.createdAt ?? new Date().toISOString()),
    lastPromptAt:
      r.last_prompt_at != null || r.lastPromptAt != null
        ? String(r.last_prompt_at ?? r.lastPromptAt)
        : undefined,
  };
}

function fromActivityRow(r: any): ActivityEntry {
  return {
    id: String(r.id),
    appName: String(r.app_name ?? r.appName),
    windowTitle: String(r.window_title ?? r.windowTitle),
    displayLabel: r.display_label ?? r.displayLabel ?? undefined,
    url: r.url ?? undefined,
    filePath: r.file_path ?? r.filePath ?? undefined,
    startTime: String(r.start_time ?? r.startTime),
    endTime: String(r.end_time ?? r.endTime),
    duration: Number(r.duration),
    projectId: r.project_id ?? r.projectId ?? undefined,
    category: normalizeStoredCategory(r.category),
    productivity: Number(r.productivity ?? 0),
    type: (r.activity_type || r.type || 'automatic') as ActivityEntry['type'],
    trackingSessionId: r.tracking_session_id ?? r.trackingSessionId ?? undefined,
  };
}

function derivedFrom(
  selectedDate: string,
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  projects: Project[],
  blockTags: BlockTag[] = [],
  taskSegments: TaskSegment[] = [],
  nowIso: string = new Date().toISOString(),
  idleThresholdMinutes: number = defaultSettings.idleThreshold,
  lastAutomaticPollAtIso: string | null = null
): { timelineBlocks: TimelineBlock[]; dailyStats: DailyStats[] } {
  const raw = computeTimelineBlocks(
    selectedDate,
    activities,
    manualEntries,
    projects,
    blockTags,
    taskSegments,
    nowIso
  );
  const anchorDate = new Date(nowIso);
  const lastPollParsed =
    lastAutomaticPollAtIso != null && lastAutomaticPollAtIso !== ''
      ? new Date(lastAutomaticPollAtIso)
      : null;
  const lastAutomaticPollAt =
    lastPollParsed != null && !Number.isNaN(lastPollParsed.getTime()) ? lastPollParsed : null;
  return {
    timelineBlocks: mergeOverlappingTimelineBlocks(raw, activities, manualEntries),
    dailyStats: computeDailyStats(
      activities,
      manualEntries,
      30,
      anchorDate,
      idleThresholdMinutes,
      lastAutomaticPollAt
    ),
  };
}

interface AppState {
  currentView: ViewType;
  selectedDate: string;
  setView: (view: ViewType) => void;
  setSelectedDate: (date: string) => void;

  hydrate: () => Promise<void>;

  projects: Project[];
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  assignActivityToProject: (activityId: string, projectId: string | undefined) => void;

  activities: ActivityEntry[];
  addActivity: (activity: ActivityEntry) => void;
  updateActivity: (id: string, updates: Partial<ActivityEntry>) => void;
  deleteActivity: (id: string) => void;
  deleteActivities: (ids: string[]) => void;

  manualEntries: ManualEntry[];
  addManualEntry: (entry: ManualEntry) => void;
  updateManualEntry: (id: string, updates: Partial<ManualEntry>) => void;
  deleteManualEntry: (id: string) => void;
  deleteManualEntries: (ids: string[]) => void;

  corporations: Corporation[];
  addCorporation: (name: string) => Promise<Corporation>;
  deleteCorporation: (id: string) => void;

  blockTags: BlockTag[];
  setBlockTag: (
    bucket: {
      id: string;
      bucketDate: string;
      bucketStart: string;
      bucketEnd: string;
      segmentId?: string;
    },
    updates: { corporationId?: string; taskType?: string; taskTypeDetail?: string }
  ) => void;
  clearBlockTag: (id: string) => void;

  taskSegments: TaskSegment[];
  refreshDerivedTimeline: () => void;
  reloadTaskSegments: () => Promise<void>;
  taskCheckInYes: () => Promise<void>;
  taskCheckInNo: (newTitle?: string | null) => Promise<void>;

  calendarEvents: CalendarEvent[];
  recordCalendarEvent: (eventId: string, projectId: string) => void;

  dailyStats: DailyStats[];
  timelineBlocks: TimelineBlock[];

  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;

  selectedActivityId: string | null;
  setSelectedActivity: (id: string | null) => void;
  showAddEntry: boolean;
  setShowAddEntry: (show: boolean) => void;
  showAddProject: boolean;
  setShowAddProject: (show: boolean) => void;
  isTracking: boolean;
  trackingStatus: 'active' | 'idle' | 'away';
  currentApp: string;
  setIsTracking: (on: boolean) => void;
  setTrackingStatus: (status: 'active' | 'idle' | 'away') => void;
  setCurrentApp: (app: string) => void;

  syncStatus: 'synced' | 'syncing' | 'error' | 'offline';
  lastSynced: string | null;
  triggerSync: () => void;
  /** Changes whenever a sync is requested (manual or automatic). */
  syncNonce: number;

  /** Vertical scale of the day timeline (1 = default). */
  timelineZoom: number;
  setTimelineZoom: (zoom: number) => void;

  /** Review screen project filter: `all`, `unassigned`, or a project id. */
  reviewProjectFilter: string;
  setReviewProjectFilter: (filter: string) => void;

  /** New UUID each staff hydrate; automatic activities tag slices for idle gap rules. */
  trackingSessionId: string;
  /** Latest successful automatic-tracking poll (ISO); bounds idle tail for today. */
  lastAutomaticPollAt: string | null;
  touchAutomaticPollAt: () => void;
  clearAutomaticPollBoundary: () => void;
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  idleThreshold: 2,
  syncEnabled: true,
  calendarIntegration: true,
  menuBarWidget: true,
  showProductivityInMenuBar: true,
  defaultHourlyRate: 150,
  currency: 'USD',
  workingHoursStart: 9,
  workingHoursEnd: 18,
  trackingEnabled: true,
  exclusionList: ['1Password', 'Keychain', 'SecureInput'],
};

const emptyDerived = derivedFrom(
  new Date().toISOString().split('T')[0],
  [],
  [],
  [],
  [],
  [],
  new Date().toISOString(),
  defaultSettings.idleThreshold,
  null
);

export const useStore = create<AppState>((set, get) => ({
  currentView: 'dashboard',
  selectedDate: new Date().toISOString().split('T')[0],
  reviewProjectFilter: 'all',
  setReviewProjectFilter: (reviewProjectFilter) => set({ reviewProjectFilter }),
  setView: (view) => set({ currentView: view }),
  setSelectedDate: (date) => {
    const { activities, manualEntries, projects, blockTags, taskSegments, settings, lastAutomaticPollAt } =
      get();
    set({
      selectedDate: date,
      ...derivedFrom(
        date,
        activities,
        manualEntries,
        projects,
        blockTags,
        taskSegments,
        new Date().toISOString(),
        settings.idleThreshold,
        lastAutomaticPollAt
      ),
    });
  },

  hydrate: async () => {
    const selectedDate = get().selectedDate;

    if (!isTauriRuntime()) {
      set({
        projects: [],
        settings: defaultSettings,
        manualEntries: [],
        activities: [],
        corporations: [],
        blockTags: [],
        taskSegments: [],
        calendarEvents: [],
        trackingSessionId: '',
        lastAutomaticPollAt: null,
        ...derivedFrom(selectedDate, [], [], [], [], [], new Date().toISOString(), defaultSettings.idleThreshold, null),
      });
      return;
    }

    await invoke('db_init');

    const rows = await invoke<any[]>('db_list_projects');
    let projects = rows.map(fromProjectRow);
    const projectNamesLower = new Set(projects.map((p) => p.name.trim().toLowerCase()));
    for (const spec of SYSTEM_PROJECT_SPECS) {
      const key = spec.name.trim().toLowerCase();
      if (projectNamesLower.has(key)) continue;
      const np = buildSystemProjectRow(spec);
      await invoke('db_upsert_project', { project: toProjectRow(np) });
      projects = [...projects, np];
      projectNamesLower.add(key);
    }

    const settingsJson = await invoke<string | null>('db_get_settings');
    const settings = settingsJson ? (JSON.parse(settingsJson) as AppSettings) : defaultSettings;
    if (!settingsJson) {
      await invoke('db_set_settings', { json: JSON.stringify(settings) });
    }

    const manualRows = await invoke<any[]>('db_list_manual_entries');
    const manualEntries = manualRows.map(fromManualEntryRow);

    const activityRows = await invoke<any[]>('db_list_activities');
    const activities = activityRows.map(fromActivityRow);

    const corporationRows = await invoke<any[]>('db_list_corporations');
    const corporations = corporationRows.map(fromCorporationRow);

    const ensureSegId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    await invoke('db_ensure_open_task_segment', {
      newId: ensureSegId,
      nowIso,
      maxGapSeconds: 5 * 60,
    });
    const segmentRows = await invoke<any[]>('db_list_task_segments');
    const taskSegments = segmentRows.map(fromTaskSegmentRow);

    let blockTagRows = await invoke<any[]>('db_list_block_tags');
    let blockTags = blockTagRows.map(fromBlockTagRow);
    blockTags = await ensureOpenSegmentTagFromHistory(taskSegments, blockTags, nowIso);

    set({
      projects,
      settings,
      manualEntries,
      activities,
      corporations,
      blockTags,
      taskSegments,
      calendarEvents: [],
      trackingSessionId: crypto.randomUUID(),
      lastAutomaticPollAt: null,
      ...derivedFrom(
        selectedDate,
        activities,
        manualEntries,
        projects,
        blockTags,
        taskSegments,
        new Date().toISOString(),
        settings.idleThreshold,
        null
      ),
    });
  },

  projects: [],
  addProject: (project) => {
    set((state) => {
      const projects = [...state.projects, project];
      return {
        projects,
        ...derivedFrom(state.selectedDate, state.activities, state.manualEntries, projects, state.blockTags, state.taskSegments, new Date().toISOString(), state.settings.idleThreshold, state.lastAutomaticPollAt),
      };
    });
    if (isTauriRuntime()) void invoke('db_upsert_project', { project: toProjectRow(project) });
  },
  updateProject: (id, updates) =>
    set((state) => {
      const projects = state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p));
      const updated = projects.find((p) => p.id === id);
      if (updated && isTauriRuntime()) void invoke('db_upsert_project', { project: toProjectRow(updated) });
      return {
        projects,
        ...derivedFrom(state.selectedDate, state.activities, state.manualEntries, projects, state.blockTags, state.taskSegments, new Date().toISOString(), state.settings.idleThreshold, state.lastAutomaticPollAt),
      };
    }),
  deleteProject: (id) => {
    set((state) => {
      const projects = state.projects.filter((p) => p.id !== id);
      return {
        projects,
        ...derivedFrom(state.selectedDate, state.activities, state.manualEntries, projects, state.blockTags, state.taskSegments, new Date().toISOString(), state.settings.idleThreshold, state.lastAutomaticPollAt),
      };
    });
    if (isTauriRuntime()) void invoke('db_delete_project', { id });
  },
  assignActivityToProject: (activityId, projectId) => {
    set((state) => {
      const activities = state.activities.map((a) =>
        a.id === activityId ? { ...a, projectId } : a
      );
      const next = activities.find((a) => a.id === activityId);
      if (next && isTauriRuntime()) void invoke('db_upsert_activity', { activity: toActivityRow(next) });
      return {
        activities,
        ...derivedFrom(state.selectedDate, activities, state.manualEntries, state.projects, state.blockTags, state.taskSegments, new Date().toISOString(), state.settings.idleThreshold, state.lastAutomaticPollAt),
      };
    });
  },

  activities: [],
  addActivity: (activity) => {
    set((state) => {
      const activities = [activity, ...state.activities];
      if (isTauriRuntime()) void invoke('db_upsert_activity', { activity: toActivityRow(activity) });
      return {
        activities,
        ...derivedFrom(state.selectedDate, activities, state.manualEntries, state.projects, state.blockTags, state.taskSegments, new Date().toISOString(), state.settings.idleThreshold, state.lastAutomaticPollAt),
      };
    });
  },
  updateActivity: (id, updates) => {
    set((state) => {
      const activities = state.activities.map((a) => (a.id === id ? { ...a, ...updates } : a));
      const next = activities.find((a) => a.id === id);
      if (next && isTauriRuntime()) void invoke('db_upsert_activity', { activity: toActivityRow(next) });
      return {
        activities,
        ...derivedFrom(state.selectedDate, activities, state.manualEntries, state.projects, state.blockTags, state.taskSegments, new Date().toISOString(), state.settings.idleThreshold, state.lastAutomaticPollAt),
      };
    });
  },
  deleteActivity: (id) => {
    get().deleteActivities([id]);
  },
  deleteActivities: (ids) => {
    if (ids.length === 0) return;
    if (isTauriRuntime()) {
      for (const id of ids) {
        void invoke('db_delete_activity', { id });
      }
    }
    set((state) => {
      const idSet = new Set(ids);
      const activities = state.activities.filter((a) => !idSet.has(a.id));
      return {
        activities,
        ...derivedFrom(state.selectedDate, activities, state.manualEntries, state.projects, state.blockTags, state.taskSegments, new Date().toISOString(), state.settings.idleThreshold, state.lastAutomaticPollAt),
      };
    });
  },

  manualEntries: [],
  addManualEntry: (entry) => {
    set((state) => {
      const manualEntries = [...state.manualEntries, entry];
      if (isTauriRuntime()) void invoke('db_add_manual_entry', { entry: toManualEntryRow(entry) });
      return {
        manualEntries,
        ...derivedFrom(state.selectedDate, state.activities, manualEntries, state.projects, state.blockTags, state.taskSegments, new Date().toISOString(), state.settings.idleThreshold, state.lastAutomaticPollAt),
      };
    });
  },
  updateManualEntry: (id, updates) => {
    set((state) => {
      const manualEntries = state.manualEntries.map((e) => (e.id === id ? { ...e, ...updates } : e));
      const next = manualEntries.find((e) => e.id === id);
      if (next && isTauriRuntime()) void invoke('db_update_manual_entry', { entry: toManualEntryRow(next) });
      return {
        manualEntries,
        ...derivedFrom(state.selectedDate, state.activities, manualEntries, state.projects, state.blockTags, state.taskSegments, new Date().toISOString(), state.settings.idleThreshold, state.lastAutomaticPollAt),
      };
    });
  },
  deleteManualEntry: (id) => {
    get().deleteManualEntries([id]);
  },
  deleteManualEntries: (ids) => {
    if (ids.length === 0) return;
    if (isTauriRuntime()) {
      for (const id of ids) {
        void invoke('db_delete_manual_entry', { id });
      }
    }
    set((state) => {
      const idSet = new Set(ids);
      const manualEntries = state.manualEntries.filter((e) => !idSet.has(e.id));
      return {
        manualEntries,
        ...derivedFrom(state.selectedDate, state.activities, manualEntries, state.projects, state.blockTags, state.taskSegments, new Date().toISOString(), state.settings.idleThreshold, state.lastAutomaticPollAt),
      };
    });
  },

  corporations: [],
  addCorporation: async (name) => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Corporation name is required');
    }
    const existing = get().corporations.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) return existing;
    const corp: Corporation = {
      id: crypto.randomUUID(),
      name: trimmed,
      createdAt: new Date().toISOString(),
    };
    if (isTauriRuntime()) {
      await invoke('db_upsert_corporation', { corporation: toCorporationRow(corp) });
    }
    set((state) => ({ corporations: [...state.corporations, corp] }));
    return corp;
  },
  deleteCorporation: (id) => {
    set((state) => {
      const corporations = state.corporations.filter((c) => c.id !== id);
      const blockTags = state.blockTags.map((t) =>
        t.corporationId === id ? { ...t, corporationId: undefined } : t
      );
      return {
        corporations,
        blockTags,
        ...derivedFrom(state.selectedDate, state.activities, state.manualEntries, state.projects, blockTags, state.taskSegments, new Date().toISOString(), state.settings.idleThreshold, state.lastAutomaticPollAt),
      };
    });
    if (isTauriRuntime()) void invoke('db_delete_corporation', { id });
  },

  blockTags: [],
  setBlockTag: (bucket, updates) => {
    set((state) => {
      const segmentId = bucket.segmentId;
      const stableId = segmentId ? blockSegmentTagId(segmentId) : bucket.id;
      const existing = segmentId
        ? state.blockTags.find((t) => t.segmentId === segmentId || t.id === stableId)
        : state.blockTags.find((t) => t.id === bucket.id);
      const merged: BlockTag = {
        id: stableId,
        bucketDate: bucket.bucketDate,
        bucketStart: bucket.bucketStart,
        bucketEnd: bucket.bucketEnd,
        segmentId: segmentId ?? existing?.segmentId,
        corporationId: 'corporationId' in updates ? updates.corporationId : existing?.corporationId,
        taskType: 'taskType' in updates ? updates.taskType : existing?.taskType,
        taskTypeDetail: 'taskTypeDetail' in updates ? updates.taskTypeDetail : existing?.taskTypeDetail,
        updatedAt: new Date().toISOString(),
      };
      const blockTags = segmentId
        ? [
            ...state.blockTags.filter(
              (t) => t.segmentId !== segmentId && t.id !== stableId
            ),
            merged,
          ]
        : existing
          ? state.blockTags.map((t) => (t.id === bucket.id ? merged : t))
          : [...state.blockTags, merged];
      if (isTauriRuntime()) void invoke('db_set_block_tag', { tag: toBlockTagRow(merged) });
      return {
        blockTags,
        ...derivedFrom(state.selectedDate, state.activities, state.manualEntries, state.projects, blockTags, state.taskSegments, new Date().toISOString(), state.settings.idleThreshold, state.lastAutomaticPollAt),
      };
    });
  },
  clearBlockTag: (id) => {
    set((state) => {
      const blockTags = state.blockTags.filter((t) => t.id !== id);
      if (isTauriRuntime()) void invoke('db_clear_block_tag', { id });
      return {
        blockTags,
        ...derivedFrom(state.selectedDate, state.activities, state.manualEntries, state.projects, blockTags, state.taskSegments, new Date().toISOString(), state.settings.idleThreshold, state.lastAutomaticPollAt),
      };
    });
  },

  taskSegments: [],
  refreshDerivedTimeline: () => {
    set((state) => ({
      ...derivedFrom(
        state.selectedDate,
        state.activities,
        state.manualEntries,
        state.projects,
        state.blockTags,
        state.taskSegments,
        new Date().toISOString(),
        state.settings.idleThreshold,
        state.lastAutomaticPollAt
      ),
    }));
  },
  reloadTaskSegments: async () => {
    if (!isTauriRuntime()) return;
    const [segmentRows, blockTagRows, corporationRows] = await Promise.all([
      invoke<any[]>('db_list_task_segments'),
      invoke<any[]>('db_list_block_tags'),
      invoke<any[]>('db_list_corporations'),
    ]);
    const taskSegments = segmentRows.map(fromTaskSegmentRow);
    const blockTags = blockTagRows.map(fromBlockTagRow);
    const corporations = corporationRows.map(fromCorporationRow);
    set((state) => ({
      taskSegments,
      blockTags,
      corporations,
      ...derivedFrom(
        state.selectedDate,
        state.activities,
        state.manualEntries,
        state.projects,
        blockTags,
        taskSegments,
        new Date().toISOString(),
        state.settings.idleThreshold,
        state.lastAutomaticPollAt
      ),
    }));
  },
  taskCheckInYes: async () => {
    if (!isTauriRuntime()) return;
    await invoke('db_task_checkin_yes', { nowIso: new Date().toISOString() });
    get().refreshDerivedTimeline();
  },
  taskCheckInNo: async (newTitle) => {
    if (!isTauriRuntime()) return;
    const newSegmentId = crypto.randomUUID();
    const title = newTitle?.trim() ? newTitle.trim() : null;
    await invoke('db_task_checkin_no', {
      newSegmentId,
      newTitle: title,
      nowIso: new Date().toISOString(),
    });
    await get().reloadTaskSegments();
  },

  calendarEvents: [],
  recordCalendarEvent: (eventId, projectId) =>
    set((state) => ({
      calendarEvents: state.calendarEvents.map((e) =>
        e.id === eventId ? { ...e, recorded: true, projectId } : e
      ),
    })),

  dailyStats: emptyDerived.dailyStats,
  timelineBlocks: emptyDerived.timelineBlocks,

  trackingSessionId: '',
  lastAutomaticPollAt: null,
  touchAutomaticPollAt: () => set({ lastAutomaticPollAt: new Date().toISOString() }),
  clearAutomaticPollBoundary: () => set({ lastAutomaticPollAt: null }),

  settings: defaultSettings,
  updateSettings: (updates) =>
    set((state) => {
      const next = { ...state.settings, ...updates };
      if (isTauriRuntime()) void invoke('db_set_settings', { json: JSON.stringify(next) });
      invalidateTrackingPrefsCache();
      return {
        settings: next,
        ...derivedFrom(
          state.selectedDate,
          state.activities,
          state.manualEntries,
          state.projects,
          state.blockTags,
          state.taskSegments,
          new Date().toISOString(),
          next.idleThreshold,
          state.lastAutomaticPollAt
        ),
      };
    }),

  selectedActivityId: null,
  setSelectedActivity: (id) => set({ selectedActivityId: id }),
  showAddEntry: false,
  setShowAddEntry: (show) => set({ showAddEntry: show }),
  showAddProject: false,
  setShowAddProject: (show) => set({ showAddProject: show }),
  isTracking: false,
  trackingStatus: 'idle',
  currentApp: '',
  setIsTracking: (on) => set({ isTracking: on }),
  setTrackingStatus: (status) => set({ trackingStatus: status }),
  setCurrentApp: (app) => set({ currentApp: app }),

  syncStatus: 'offline',
  lastSynced: null,
  triggerSync: () => {
    set((s) => ({ syncNonce: s.syncNonce + 1, syncStatus: 'syncing' }));
  },
  syncNonce: 0,

  timelineZoom: readStoredTimelineZoom(),
  setTimelineZoom: (zoom) => {
    const clamped = Math.min(
      TIMELINE_ZOOM_MAX,
      Math.max(TIMELINE_ZOOM_MIN, Math.round(zoom * 1000) / 1000)
    );
    persistTimelineZoom(clamped);
    set({ timelineZoom: clamped });
  },
}));
