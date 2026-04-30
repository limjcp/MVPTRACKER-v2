import { useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { computeDailyStats } from './store/derive';
import { useStore } from './store/useStore';
import type { ActivityEntry, ManualEntry, Project } from './types';

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function dayStrFromIso(iso: string): string {
  return iso.split('T')[0] ?? '';
}

function clampInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function buildUserAppDaily(activities: ActivityEntry[], daysBack: number, anchorIso: string) {
  const anchor = new Date(anchorIso);
  const out: Array<{ day: string; app_name: string; seconds: number }> = [];
  const byKey = new Map<string, number>();
  for (const a of activities) {
    const d = dayStrFromIso(a.startTime);
    if (!d) continue;
    // basic range guard (we don't clip precisely here; server stores raw slices anyway)
    const deltaDays = Math.floor((anchor.getTime() - new Date(`${d}T00:00:00.000Z`).getTime()) / (24 * 3600 * 1000));
    if (deltaDays < 0 || deltaDays >= daysBack) continue;
    const key = `${d}||${a.appName}`;
    byKey.set(key, (byKey.get(key) ?? 0) + clampInt(a.duration));
  }
  for (const [key, seconds] of byKey) {
    const [day, app_name] = key.split('||');
    if (!day || !app_name) continue;
    out.push({ day, app_name, seconds });
  }
  return out;
}

function buildUserProjectDaily(
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  projects: Project[],
  daysBack: number,
  anchorIso: string
) {
  const anchor = new Date(anchorIso);
  const nameById = new Map(projects.map((p) => [p.id, p.name] as const));
  const byKey = new Map<string, number>();

  const add = (day: string, projectName: string, seconds: number) => {
    if (!day || !projectName) return;
    const key = `${day}||${projectName}`;
    byKey.set(key, (byKey.get(key) ?? 0) + clampInt(seconds));
  };

  const dayInRange = (day: string) => {
    const deltaDays = Math.floor(
      (anchor.getTime() - new Date(`${day}T00:00:00.000Z`).getTime()) / (24 * 3600 * 1000)
    );
    return deltaDays >= 0 && deltaDays < daysBack;
  };

  for (const a of activities) {
    if (!a.projectId) continue;
    const day = dayStrFromIso(a.startTime);
    if (!day || !dayInRange(day)) continue;
    const name = nameById.get(a.projectId);
    if (!name) continue;
    add(day, name, a.duration);
  }

  for (const m of manualEntries) {
    if (!m.projectId) continue;
    const day = dayStrFromIso(m.startTime);
    if (!day || !dayInRange(day)) continue;
    const name = nameById.get(m.projectId);
    if (!name) continue;
    add(day, name, m.duration);
  }

  const out: Array<{ day: string; project_name: string; seconds: number }> = [];
  for (const [key, seconds] of byKey) {
    const [day, project_name] = key.split('||');
    if (!day || !project_name) continue;
    out.push({ day, project_name, seconds });
  }
  return out;
}

function currentTaskLabel(
  taskSegments: Array<{ id: string; startTime: string; endTime: string | null }>,
  blockTags: Array<{ segmentId?: string; corporationId?: string; taskType?: string; taskTypeDetail?: string }>,
  corporations: Array<{ id: string; name: string }>
): string | null {
  const open = taskSegments
    .filter((s) => !s.endTime)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
  if (!open) return null;

  const tag = blockTags.find((t) => t.segmentId === open.id);
  if (!tag) return null;

  const corpName = tag.corporationId ? corporations.find((c) => c.id === tag.corporationId)?.name : undefined;
  const parts = [corpName, tag.taskType, tag.taskTypeDetail].filter(Boolean) as string[];
  return parts.length ? parts.join(' · ') : null;
}

async function upsertAll<T extends Record<string, any>>(
  table: string,
  rows: T[],
  onConflict: string
): Promise<void> {
  const client = supabase;
  if (!client) throw new Error('Supabase client not configured');
  if (rows.length === 0) return;
  for (const part of chunk(rows, 500)) {
    const { error } = await client.from(table).upsert(part, { onConflict });
    if (error) throw error;
  }
}

/**
 * Sends staff time-tracking data + presence heartbeats to Supabase.
 * Summary-only: raw tracker data stays local; Supabase only stores aggregates + current status.
 */
export function useSupabaseSync(enabled: boolean) {
  const syncNonce = useStore((s) => s.syncNonce);

  const activities = useStore((s) => s.activities);
  const manualEntries = useStore((s) => s.manualEntries);
  const projects = useStore((s) => s.projects);
  const corporations = useStore((s) => s.corporations);
  const blockTags = useStore((s) => s.blockTags);
  const taskSegments = useStore((s) => s.taskSegments);
  const settings = useStore((s) => s.settings);
  const trackingStatus = useStore((s) => s.trackingStatus);
  const currentApp = useStore((s) => s.currentApp);

  const anchorIso = useMemo(() => new Date().toISOString(), [syncNonce]);
  const busyRef = useRef(false);
  const lastAutoSyncAtRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;
    if (!settings.syncEnabled) {
      useStore.setState({ syncStatus: 'offline' });
      return;
    }
    if (!supabase) {
      useStore.setState({ syncStatus: 'offline' });
      return;
    }

    const doSync = async (reason: 'manual' | 'auto') => {
      if (busyRef.current) return;
      busyRef.current = true;
      useStore.setState({ syncStatus: 'syncing' });
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const session = data.session;
        if (!session) {
          useStore.setState({ syncStatus: 'offline' });
          return;
        }
        const uid = session.user.id;
        const nowIso = new Date().toISOString();

        // Presence heartbeat
        await upsertAll(
          'user_presence',
          [
            {
              user_id: uid,
              last_heartbeat_at: nowIso,
              last_active_at: trackingStatus === 'active' ? nowIso : null,
              updated_at: nowIso,
            },
          ],
          'user_id'
        );

        // Settings affecting analytics (idle threshold)
        await upsertAll(
          'user_settings',
          [{ user_id: uid, idle_threshold_minutes: settings.idleThreshold, updated_at: nowIso }],
          'user_id'
        );

        // Rollups (last 30 days)
        const anchorDate = new Date();
        const daily = computeDailyStats(activities, manualEntries, 30, anchorDate, settings.idleThreshold);
        await upsertAll(
          'user_daily_stats',
          daily.map((d) => ({
            user_id: uid,
            day: d.date,
            total_seconds: clampInt(d.totalTime),
            productive_seconds: clampInt(d.productiveTime),
            unproductive_seconds: clampInt(d.unproductiveTime),
            idle_seconds: clampInt(d.idleTime),
            productivity_score: clampInt(d.productivityScore),
            updated_at: nowIso,
          })),
          'user_id,day'
        );

        const appDaily = buildUserAppDaily(activities, 30, anchorIso);
        await upsertAll(
          'user_app_daily',
          appDaily.map((r) => ({
            user_id: uid,
            day: r.day,
            app_name: r.app_name,
            seconds: clampInt(r.seconds),
            updated_at: nowIso,
          })),
          'user_id,day,app_name'
        );

        const projectDaily = buildUserProjectDaily(activities, manualEntries, projects, 30, anchorIso);
        await upsertAll(
          'user_project_daily',
          projectDaily.map((r) => ({
            user_id: uid,
            day: r.day,
            project_name: r.project_name,
            seconds: clampInt(r.seconds),
            updated_at: nowIso,
          })),
          'user_id,day,project_name'
        );

        const taskLabel = currentTaskLabel(taskSegments, blockTags, corporations);
        const latestActivity = activities.slice().sort((a, b) => b.endTime.localeCompare(a.endTime))[0];
        const currentProject =
          latestActivity?.projectId ? projects.find((p) => p.id === latestActivity.projectId)?.name : undefined;

        await upsertAll(
          'user_current_status',
          [
            {
              user_id: uid,
              tracking_status: trackingStatus,
              current_app: currentApp || null,
              current_project: currentProject ?? null,
              current_task_label: taskLabel,
              last_sync_at: nowIso,
              updated_at: nowIso,
            },
          ],
          'user_id'
        );

        useStore.setState({ syncStatus: 'synced', lastSynced: nowIso });
      } catch (e) {
        console.error('supabase sync', reason, e);
        useStore.setState({ syncStatus: 'error' });
      } finally {
        busyRef.current = false;
      }
    };

    // Run a sync when enabled / when user clicks sync (syncNonce changes).
    void doSync('manual');

    // Background sync every 15 minutes.
    const id = window.setInterval(() => {
      const now = Date.now();
      if (now - lastAutoSyncAtRef.current < 15 * 60_000) return;
      lastAutoSyncAtRef.current = now;
      void doSync('auto');
    }, 60_000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, settings.syncEnabled, settings.idleThreshold, syncNonce]);
}

