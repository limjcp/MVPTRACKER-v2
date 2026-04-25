import { create } from 'zustand';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  Project,
  ActivityEntry,
  ManualEntry,
  CalendarEvent,
  DailyStats,
  ActiveTimer,
  AppSettings,
  ViewType,
  TimelineBlock,
  Corporation,
  BlockTag,
} from '../types';
import {
  computeDailyStats,
  computeTimelineBlocks,
  mergeOverlappingTimelineBlocks,
} from './derive';
import { normalizeStoredCategory } from '../utils/appCategories';

function isTauriRuntime() {
  return isTauri();
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
  };
}

function derivedFrom(
  selectedDate: string,
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  projects: Project[],
  blockTags: BlockTag[] = []
): { timelineBlocks: TimelineBlock[]; dailyStats: DailyStats[] } {
  const raw = computeTimelineBlocks(selectedDate, activities, manualEntries, projects, blockTags);
  return {
    timelineBlocks: mergeOverlappingTimelineBlocks(raw, activities, manualEntries),
    dailyStats: computeDailyStats(activities, manualEntries, 30, new Date()),
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
  addCorporation: (name: string) => Corporation;
  deleteCorporation: (id: string) => void;

  blockTags: BlockTag[];
  setBlockTag: (
    bucket: { id: string; bucketDate: string; bucketStart: string; bucketEnd: string },
    updates: { corporationId?: string; taskType?: string; taskTypeDetail?: string }
  ) => void;
  clearBlockTag: (id: string) => void;

  calendarEvents: CalendarEvent[];
  recordCalendarEvent: (eventId: string, projectId: string) => void;

  activeTimers: ActiveTimer[];
  startTimer: (projectId: string, title?: string) => void;
  stopTimer: (timerId: string) => void;
  tickTimers: () => void;

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
  []
);

export const useStore = create<AppState>((set, get) => ({
  currentView: 'dashboard',
  selectedDate: new Date().toISOString().split('T')[0],
  setView: (view) => set({ currentView: view }),
  setSelectedDate: (date) => {
    const { activities, manualEntries, projects, blockTags } = get();
    set({
      selectedDate: date,
      ...derivedFrom(date, activities, manualEntries, projects, blockTags),
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
        calendarEvents: [],
        ...derivedFrom(selectedDate, [], [], [], []),
      });
      return;
    }

    await invoke('db_init');

    const rows = await invoke<any[]>('db_list_projects');
    const projects = rows.map(fromProjectRow);

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

    const blockTagRows = await invoke<any[]>('db_list_block_tags');
    const blockTags = blockTagRows.map(fromBlockTagRow);

    set({
      projects,
      settings,
      manualEntries,
      activities,
      corporations,
      blockTags,
      calendarEvents: [],
      ...derivedFrom(selectedDate, activities, manualEntries, projects, blockTags),
    });
  },

  projects: [],
  addProject: (project) => {
    set((state) => {
      const projects = [...state.projects, project];
      return {
        projects,
        ...derivedFrom(state.selectedDate, state.activities, state.manualEntries, projects, state.blockTags),
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
        ...derivedFrom(state.selectedDate, state.activities, state.manualEntries, projects, state.blockTags),
      };
    }),
  deleteProject: (id) => {
    set((state) => {
      const projects = state.projects.filter((p) => p.id !== id);
      return {
        projects,
        ...derivedFrom(state.selectedDate, state.activities, state.manualEntries, projects, state.blockTags),
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
        ...derivedFrom(state.selectedDate, activities, state.manualEntries, state.projects, state.blockTags),
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
        ...derivedFrom(state.selectedDate, activities, state.manualEntries, state.projects, state.blockTags),
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
        ...derivedFrom(state.selectedDate, activities, state.manualEntries, state.projects, state.blockTags),
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
        ...derivedFrom(state.selectedDate, activities, state.manualEntries, state.projects, state.blockTags),
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
        ...derivedFrom(state.selectedDate, state.activities, manualEntries, state.projects, state.blockTags),
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
        ...derivedFrom(state.selectedDate, state.activities, manualEntries, state.projects, state.blockTags),
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
        ...derivedFrom(state.selectedDate, state.activities, manualEntries, state.projects, state.blockTags),
      };
    });
  },

  corporations: [],
  addCorporation: (name) => {
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
    set((state) => ({ corporations: [...state.corporations, corp] }));
    if (isTauriRuntime()) void invoke('db_upsert_corporation', { corporation: toCorporationRow(corp) });
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
        ...derivedFrom(state.selectedDate, state.activities, state.manualEntries, state.projects, blockTags),
      };
    });
    if (isTauriRuntime()) void invoke('db_delete_corporation', { id });
  },

  blockTags: [],
  setBlockTag: (bucket, updates) => {
    set((state) => {
      const existing = state.blockTags.find((t) => t.id === bucket.id);
      const merged: BlockTag = {
        id: bucket.id,
        bucketDate: bucket.bucketDate,
        bucketStart: bucket.bucketStart,
        bucketEnd: bucket.bucketEnd,
        corporationId: 'corporationId' in updates ? updates.corporationId : existing?.corporationId,
        taskType: 'taskType' in updates ? updates.taskType : existing?.taskType,
        taskTypeDetail: 'taskTypeDetail' in updates ? updates.taskTypeDetail : existing?.taskTypeDetail,
        updatedAt: new Date().toISOString(),
      };
      const blockTags = existing
        ? state.blockTags.map((t) => (t.id === bucket.id ? merged : t))
        : [...state.blockTags, merged];
      if (isTauriRuntime()) void invoke('db_set_block_tag', { tag: toBlockTagRow(merged) });
      return {
        blockTags,
        ...derivedFrom(state.selectedDate, state.activities, state.manualEntries, state.projects, blockTags),
      };
    });
  },
  clearBlockTag: (id) => {
    set((state) => {
      const blockTags = state.blockTags.filter((t) => t.id !== id);
      if (isTauriRuntime()) void invoke('db_clear_block_tag', { id });
      return {
        blockTags,
        ...derivedFrom(state.selectedDate, state.activities, state.manualEntries, state.projects, blockTags),
      };
    });
  },

  calendarEvents: [],
  recordCalendarEvent: (eventId, projectId) =>
    set((state) => ({
      calendarEvents: state.calendarEvents.map((e) =>
        e.id === eventId ? { ...e, recorded: true, projectId } : e
      ),
    })),

  activeTimers: [],
  startTimer: (projectId, title) => {
    const timer: ActiveTimer = {
      id: crypto.randomUUID(),
      projectId,
      startTime: new Date().toISOString(),
      elapsed: 0,
      running: true,
      title,
    };
    set((state) => ({ activeTimers: [...state.activeTimers, timer] }));
  },
  stopTimer: (timerId) => {
    const timer = get().activeTimers.find((t) => t.id === timerId);
    if (!timer) return;
    const entry: ManualEntry = {
      id: crypto.randomUUID(),
      title: timer.title || 'Manual Timer',
      projectId: timer.projectId,
      startTime: timer.startTime,
      endTime: new Date().toISOString(),
      duration: timer.elapsed,
      type: 'manual',
    };
    set((state) => {
      const manualEntries = [...state.manualEntries, entry];
      if (isTauriRuntime()) void invoke('db_add_manual_entry', { entry: toManualEntryRow(entry) });
      return {
        activeTimers: state.activeTimers.filter((t) => t.id !== timerId),
        manualEntries,
        ...derivedFrom(state.selectedDate, state.activities, manualEntries, state.projects, state.blockTags),
      };
    });
  },
  tickTimers: () => {
    set((state) => ({
      activeTimers: state.activeTimers.map((t) =>
        t.running ? { ...t, elapsed: t.elapsed + 1 } : t
      ),
    }));
  },

  dailyStats: emptyDerived.dailyStats,
  timelineBlocks: emptyDerived.timelineBlocks,

  settings: defaultSettings,
  updateSettings: (updates) =>
    set((state) => {
      const next = { ...state.settings, ...updates };
      if (isTauriRuntime()) void invoke('db_set_settings', { json: JSON.stringify(next) });
      return { settings: next };
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
    set({ syncStatus: 'syncing' });
    setTimeout(() => {
      set({ syncStatus: 'synced', lastSynced: new Date().toISOString() });
    }, 1500);
  },
}));
