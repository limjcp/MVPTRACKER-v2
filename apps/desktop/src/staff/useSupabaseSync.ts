import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { computeDailyStats } from './store/derive';
import { useStore } from './store/useStore';
import type { ActivityEntry, ManualEntry, Project, TaskSegment } from './types';
import { unionAppSecondsForActivitiesOnDate } from './utils/sidebarTotals';
import { formatTaskType } from './utils/taskTypes';

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

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysLocal(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfDayLocal(dateStr: string): Date {
  // Local midnight (matches staff timeline day bucketing)
  return new Date(`${dateStr}T00:00:00`);
}

function endOfDayLocal(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999`);
}

function diffDaysInclusive(startDay: string, endDay: string): number {
  const startMs = startOfDayLocal(startDay).getTime();
  const endMs = startOfDayLocal(endDay).getTime();
  const diff = Math.floor((endMs - startMs) / (24 * 3600 * 1000));
  return Math.max(0, diff) + 1;
}

function minDay(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return startOfDayLocal(a).getTime() <= startOfDayLocal(b).getTime() ? a : b;
}

function oldestLocalTrackedDay(
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  taskSegments: TaskSegment[]
): string | null {
  let oldest: string | null = null;
  for (const a of activities) {
    oldest = minDay(oldest, dayStrFromIso(a.startTime));
  }
  for (const m of manualEntries) {
    oldest = minDay(oldest, dayStrFromIso(m.startTime));
  }
  for (const s of taskSegments) {
    oldest = minDay(oldest, dayStrFromIso(s.startTime));
  }
  return oldest;
}

const BACKFILL_CURSOR_KEY = 'mvptracker.supabase.backfill.oldestSyncedDay.v1';

function readBackfillCursor(uid: string): string | null {
  try {
    const raw = window.localStorage.getItem(`${BACKFILL_CURSOR_KEY}.${uid}`);
    if (!raw) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeBackfillCursor(uid: string, day: string): void {
  try {
    window.localStorage.setItem(`${BACKFILL_CURSOR_KEY}.${uid}`, day);
  } catch {
    // Best-effort cursor write only.
  }
}

function clipMsToDay(startMs: number, endMs: number, dateStr: string): { startMs: number; endMs: number } | null {
  const d0 = startOfDayLocal(dateStr).getTime();
  const d1 = endOfDayLocal(dateStr).getTime();
  const s = Math.max(startMs, d0);
  const e = Math.min(endMs, d1);
  if (e <= s) return null;
  return { startMs: s, endMs: e };
}

function buildUserTaskBlockDaily(
  taskSegments: TaskSegment[],
  blockTags: Array<{ segmentId?: string; corporationId?: string; taskType?: string; taskTypeDetail?: string }>,
  corporations: Array<{ id: string; name: string }>,
  daysBack: number,
  anchorIso: string
): Array<{
  day: string;
  corporation_id: string | null;
  task_type: string | null;
  task_type_detail: string | null;
  label: string;
  seconds: number;
}> {
  const anchor = new Date(anchorIso);
  const anchorDay = localDayKey(anchor);
  const corpNameById = new Map(corporations.map((c) => [c.id, c.name] as const));

  const tagBySegmentId = new Map<string, { corporationId?: string; taskType?: string; taskTypeDetail?: string }>();
  for (const t of blockTags) {
    if (t.segmentId) tagBySegmentId.set(t.segmentId, t);
  }

  const byKey = new Map<string, { day: string; corporation_id: string | null; task_type: string | null; task_type_detail: string | null; label: string; seconds: number }>();

  const dayInRange = (day: string) => {
    const dayStart = startOfDayLocal(day).getTime();
    const anchorStart = startOfDayLocal(anchorDay).getTime();
    const deltaDays = Math.floor((anchorStart - dayStart) / (24 * 3600 * 1000));
    return deltaDays >= 0 && deltaDays < daysBack;
  };

  for (const seg of taskSegments) {
    const segStartMs = new Date(seg.startTime).getTime();
    const segEndMs = seg.endTime ? new Date(seg.endTime).getTime() : anchor.getTime();
    if (!(Number.isFinite(segStartMs) && Number.isFinite(segEndMs) && segEndMs > segStartMs)) continue;

    // Iterate across each day the segment touches (bounded by daysBack window)
    // Start from local day of seg.startTime to local day of segEndMs
    const startDay = localDayKey(new Date(segStartMs));
    const endDay = localDayKey(new Date(segEndMs));

    // Simple day loop (max 60-ish iterations in practice)
    let d = startOfDayLocal(startDay);
    const endD = startOfDayLocal(endDay);
    for (; d.getTime() <= endD.getTime(); d = addDaysLocal(d, 1)) {
      const day = localDayKey(d);
      if (!dayInRange(day)) continue;
      const clip = clipMsToDay(segStartMs, segEndMs, day);
      if (!clip) continue;
      const seconds = clampInt((clip.endMs - clip.startMs) / 1000);
      if (seconds <= 0) continue;

      const tag = tagBySegmentId.get(seg.id);
      const corporation_id = tag?.corporationId ?? null;
      const task_type = tag?.taskType ?? null;
      const task_type_detail = tag?.taskTypeDetail ?? null;
      const corpName = corporation_id ? corpNameById.get(corporation_id) : undefined;
      const taskLabel =
        task_type && String(task_type).trim()
          ? formatTaskType(task_type, task_type_detail ?? undefined)
          : undefined;

      const label =
        corpName || taskLabel
          ? [corpName, taskLabel].filter(Boolean).join(' · ')
          : 'Untagged task block';

      const key = `${day}||${label}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.seconds += seconds;
      } else {
        byKey.set(key, {
          day,
          corporation_id,
          task_type,
          task_type_detail,
          label,
          seconds,
        });
      }
    }
  }

  return [...byKey.values()];
}

function buildUserAppDaily(activities: ActivityEntry[], daysBack: number, anchorIso: string) {
  const out: Array<{ day: string; app_name: string; seconds: number }> = [];
  const anchor = new Date(anchorIso);
  const anchorDay = localDayKey(anchor);

  // Compute union-attributed app seconds per day so totals sum to the day's union time
  // (no double-counting overlaps or duplicates).
  for (let i = 0; i < daysBack; i++) {
    const day = localDayKey(addDaysLocal(startOfDayLocal(anchorDay), -i));
    const totals = unionAppSecondsForActivitiesOnDate(activities, day);
    for (const [app_name, { duration }] of Object.entries(totals)) {
      const seconds = clampInt(duration);
      if (seconds <= 0) continue;
      out.push({ day, app_name, seconds });
    }
  }
  return out;
}

function buildUserProjectDaily(
  _activities: ActivityEntry[],
  _manualEntries: ManualEntry[],
  projects: Project[],
  daysBack: number,
  anchorIso: string,
  daily: Array<{ date: string; projects: Record<string, number> }>
) {
  const nameById = new Map(projects.map((p) => [p.id, p.name] as const));
  const out: Array<{ day: string; project_name: string; seconds: number }> = [];
  const anchor = new Date(anchorIso);
  const anchorDay = localDayKey(anchor);

  // Use the already-unioned per-day project totals from computeDailyStats so this matches `total_seconds`.
  // (Avoids double-counting overlaps/duplicates across activities/manual entries.)
  const byDate = new Map(daily.map((d) => [d.date, d.projects] as const));
  for (let i = 0; i < daysBack; i++) {
    const day = localDayKey(addDaysLocal(startOfDayLocal(anchorDay), -i));
    const projSeconds = byDate.get(day) ?? {};
    for (const [projectId, secondsRaw] of Object.entries(projSeconds)) {
      const project_name = nameById.get(projectId);
      if (!project_name) continue;
      const seconds = clampInt(secondsRaw);
      if (seconds <= 0) continue;
      out.push({ day, project_name, seconds });
    }
  }
  return out;
}

function clipMsToHour(startMs: number, endMs: number, hourStartMs: number, hourEndMs: number) {
  const s = Math.max(startMs, hourStartMs);
  const e = Math.min(endMs, hourEndMs);
  if (e <= s) return null;
  return { startMs: s, endMs: e };
}

function buildUserHourlyStats(
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  day: string,
  anchorIso: string
): Array<{ day: string; hour: number; total_seconds: number; productive_seconds: number; idle_seconds: number }> {
  const rows: Array<{ startMs: number; endMs: number; prod: number }> = [];
  for (const a of activities) {
    const startMs = new Date(a.startTime).getTime();
    const endMs = new Date(a.endTime).getTime();
    if (!(Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs)) continue;
    const clip = clipMsToDay(startMs, endMs, day);
    if (!clip) continue;
    rows.push({ startMs: clip.startMs, endMs: clip.endMs, prod: Number(a.productivity) || 0 });
  }
  for (const m of manualEntries) {
    const startMs = new Date(m.startTime).getTime();
    const endMs = new Date(m.endTime).getTime();
    if (!(Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs)) continue;
    const clip = clipMsToDay(startMs, endMs, day);
    if (!clip) continue;
    rows.push({ startMs: clip.startMs, endMs: clip.endMs, prod: 1 });
  }
  if (rows.length === 0) return [];

  const out: Array<{ day: string; hour: number; total_seconds: number; productive_seconds: number; idle_seconds: number }> = [];
  const dayStartMs = startOfDayLocal(day).getTime();
  const anchorMs = new Date(anchorIso).getTime();
  for (let hour = 0; hour < 24; hour++) {
    const hourStartMs = dayStartMs + hour * 3600_000;
    const hourEndMs = hourStartMs + 3600_000;
    const clipped = rows
      .map((r) => {
        const c = clipMsToHour(r.startMs, r.endMs, hourStartMs, hourEndMs);
        if (!c) return null;
        return { startMs: c.startMs, endMs: c.endMs, prod: r.prod };
      })
      .filter(Boolean) as Array<{ startMs: number; endMs: number; prod: number }>;
    if (clipped.length === 0) continue;

    const bounds = new Set<number>();
    for (const c of clipped) {
      bounds.add(c.startMs);
      bounds.add(c.endMs);
    }
    const sorted = [...bounds].sort((a, b) => a - b);

    let total = 0;
    let productive = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      const lo = sorted[i]!;
      const hi = sorted[i + 1]!;
      if (hi <= lo) continue;
      const covering = clipped.filter((r) => r.startMs < hi && r.endMs > lo);
      if (covering.length === 0) continue;
      const sec = clampInt((hi - lo) / 1000);
      if (sec <= 0) continue;
      total += sec;
      const anyNeg = covering.some((r) => r.prod < 0);
      const anyPos = covering.some((r) => r.prod > 0);
      if (!anyNeg && anyPos) productive += sec;
    }

    const elapsedSec = clampInt((Math.max(hourStartMs, Math.min(hourEndMs, anchorMs)) - hourStartMs) / 1000);
    const idle = Math.max(0, elapsedSec - total);
    out.push({
      day,
      hour,
      total_seconds: clampInt(total),
      productive_seconds: clampInt(productive),
      idle_seconds: clampInt(idle),
    });
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
  const syncEnabled = useStore((s) => s.settings.syncEnabled);
  const busyRef = useRef(false);
  const heartbeatBusyRef = useRef(false);
  const lastAutoSyncAtRef = useRef<number>(0);
  const lastActiveAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!syncEnabled) {
      useStore.setState({ syncStatus: 'offline' });
      return;
    }
    const client = supabase;
    if (!client) {
      useStore.setState({ syncStatus: 'offline' });
      return;
    }

    const upsertPresenceByUid = async (uid: string, nowIso: string) => {
      const state = useStore.getState();
      const isActive = state.trackingStatus === 'active';
      if (isActive) lastActiveAtRef.current = nowIso;
      const lastActiveIso = isActive ? nowIso : lastActiveAtRef.current;
      const row: Record<string, any> = {
        user_id: uid,
        last_heartbeat_at: nowIso,
        updated_at: nowIso,
      };
      // Keep the latest active timestamp instead of nulling it out while idle.
      if (lastActiveIso) row.last_active_at = lastActiveIso;
      await upsertAll('user_presence', [row], 'user_id');
    };

    const doHeartbeat = async () => {
      if (heartbeatBusyRef.current) return;
      heartbeatBusyRef.current = true;
      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        const session = data.session;
        if (!session) return;
        await upsertPresenceByUid(session.user.id, new Date().toISOString());
      } catch (e) {
        console.error('supabase presence heartbeat', e);
      } finally {
        heartbeatBusyRef.current = false;
      }
    };

    const doSync = async (reason: 'manual' | 'auto') => {
      if (busyRef.current) return;
      busyRef.current = true;
      useStore.setState({ syncStatus: 'syncing' });
      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        const session = data.session;
        if (!session) {
          useStore.setState({ syncStatus: 'offline' });
          return;
        }
        const uid = session.user.id;
        const nowIso = new Date().toISOString();
        const state = useStore.getState();
        const {
          activities,
          manualEntries,
          projects,
          corporations,
          blockTags,
          taskSegments,
          settings,
          trackingStatus,
          currentApp,
        } = state;

        const failures: string[] = [];
        const runStep = async (name: string, fn: () => Promise<void>) => {
          try {
            await fn();
          } catch (error) {
            failures.push(name);
            console.error(`supabase sync step failed: ${name}`, error);
          }
        };

        await runStep('user_presence', async () => {
          await upsertPresenceByUid(uid, nowIso);
        });

        await runStep('user_settings', async () => {
          await upsertAll(
            'user_settings',
            [{ user_id: uid, idle_threshold_minutes: settings.idleThreshold, updated_at: nowIso }],
            'user_id'
          );
        });

        const uploadRollupWindow = async (windowEndDay: string, daysBack: number, includeHourly: boolean) => {
          const anchorDate = endOfDayLocal(windowEndDay);
          const anchorIso = anchorDate.toISOString();
          const lastIso = useStore.getState().lastAutomaticPollAt;
          const lastPollDt = lastIso ? new Date(lastIso) : null;
          const lastAutomaticPollAt =
            lastPollDt && !Number.isNaN(lastPollDt.getTime()) ? lastPollDt : null;

          const daily = computeDailyStats(
            activities,
            manualEntries,
            daysBack,
            anchorDate,
            settings.idleThreshold,
            lastAutomaticPollAt
          );
          await runStep('user_daily_stats', async () => {
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
          });

          if (includeHourly) {
            const todayLocalDay = localDayKey(anchorDate);
            const hourly = buildUserHourlyStats(activities, manualEntries, todayLocalDay, nowIso);
            await runStep('user_hourly_stats', async () => {
              await upsertAll(
                'user_hourly_stats',
                hourly.map((r) => ({
                  user_id: uid,
                  day: r.day,
                  hour: r.hour,
                  total_seconds: clampInt(r.total_seconds),
                  productive_seconds: clampInt(r.productive_seconds),
                  idle_seconds: clampInt(r.idle_seconds),
                  updated_at: nowIso,
                })),
                'user_id,day,hour'
              );
            });
          }

          const appDaily = buildUserAppDaily(activities, daysBack, anchorIso);
          await runStep('user_app_daily', async () => {
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
          });

          const projectDaily = buildUserProjectDaily(
            activities,
            manualEntries,
            projects,
            daysBack,
            anchorIso,
            daily
          );
          await runStep('user_project_daily', async () => {
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
          });

          const taskBlocksDaily = buildUserTaskBlockDaily(taskSegments, blockTags, corporations, daysBack, anchorIso);
          await runStep('user_task_block_daily', async () => {
            await upsertAll(
              'user_task_block_daily',
              taskBlocksDaily.map((r) => ({
                user_id: uid,
                day: r.day,
                corporation_id: r.corporation_id,
                task_type: r.task_type,
                task_type_detail: r.task_type_detail,
                label: r.label,
                seconds: clampInt(r.seconds),
                updated_at: nowIso,
              })),
              'user_id,day,label'
            );
          });
        };

        const todayDay = dayStrFromIso(nowIso);
        await uploadRollupWindow(todayDay, 30, true);

        const oldestLocalDay = oldestLocalTrackedDay(activities, manualEntries, taskSegments);
        const backfillCursor = readBackfillCursor(uid);
        const needsHistoricalBackfill =
          Boolean(oldestLocalDay) && (!backfillCursor || startOfDayLocal(oldestLocalDay!).getTime() < startOfDayLocal(backfillCursor).getTime());

        if (reason === 'manual' && oldestLocalDay && needsHistoricalBackfill) {
          // Backfill in month-sized chunks to avoid long UI stalls and large payload spikes.
          let chunkEndDay = todayDay;
          while (startOfDayLocal(chunkEndDay).getTime() >= startOfDayLocal(oldestLocalDay).getTime()) {
            const daysInChunk = Math.min(31, diffDaysInclusive(oldestLocalDay, chunkEndDay));
            await uploadRollupWindow(chunkEndDay, daysInChunk, false);
            const nextChunkEnd = addDaysLocal(startOfDayLocal(chunkEndDay), -daysInChunk);
            chunkEndDay = localDayKey(nextChunkEnd);
          }
          writeBackfillCursor(uid, oldestLocalDay);
        }

        const taskLabel = currentTaskLabel(taskSegments, blockTags, corporations);
        const latestActivity = activities.slice().sort((a, b) => b.endTime.localeCompare(a.endTime))[0];
        const currentProject =
          latestActivity?.projectId ? projects.find((p) => p.id === latestActivity.projectId)?.name : undefined;

        await runStep('user_current_status', async () => {
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
        });

        lastAutoSyncAtRef.current = Date.now();
        if (failures.length === 0) {
          useStore.setState({ syncStatus: 'synced', lastSynced: nowIso });
        } else if (failures.length >= 7) {
          useStore.setState({ syncStatus: 'error' });
        } else {
          useStore.setState({ syncStatus: 'partial', lastSynced: nowIso });
        }
      } catch (e) {
        console.error('supabase sync', reason, e);
        useStore.setState({ syncStatus: 'error' });
      } finally {
        busyRef.current = false;
      }
    };

    void doHeartbeat();

    // Lightweight presence heartbeat every 30 seconds.
    const heartbeatId = window.setInterval(() => {
      void doHeartbeat();
    }, 30_000);

    // Run a sync when enabled / when user clicks sync (syncNonce changes).
    void doSync('manual');

    // Background sync every 15 minutes.
    const id = window.setInterval(() => {
      const now = Date.now();
      if (now - lastAutoSyncAtRef.current < 15 * 60_000) return;
      lastAutoSyncAtRef.current = now;
      void doSync('auto');
    }, 60_000);

    return () => {
      clearInterval(heartbeatId);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, syncEnabled, syncNonce]);
}

