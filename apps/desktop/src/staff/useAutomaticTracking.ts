import { useEffect, useRef } from 'react';
import { differenceInMinutes, differenceInSeconds, parseISO } from 'date-fns';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { useStore } from './store/useStore';
import type { ActivityEntry } from './types';
import { invalidateTrackingPrefsCache, loadTrackingPrefsFromDb } from './trackingPrefsCache';
import { ACTIVITY_MERGE_GAP_MINUTES, titleMergeKey } from './utils/activityMerge';
import { inferAppCategory, inferProductivityForActivityContext } from './utils/appCategories';
import { inferSystemProjectName, resolveProjectIdForSystemName } from './utils/systemProjects';

/** Extract http(s) URL from window title when present (browsers rarely expose real tab URL). */
export function urlFromWindowTitle(title: string): string | undefined {
  const m = title.match(/https?:\/\/[^\s)\]>"']+/i);
  return m ? m[0] : undefined;
}

function normProcess(s: string) {
  return s.trim().toLowerCase().replace(/\.exe$/i, '');
}

export function sliceKey(app: string, title: string) {
  return `${normProcess(app)}|${title.trim().toLowerCase()}`;
}

function findResumableActivity(
  mergeKey: string,
  activities: ActivityEntry[],
  now: Date
): ActivityEntry | undefined {
  let best: ActivityEntry | undefined;
  let bestEnd = 0;
  for (const a of activities) {
    if (a.type !== 'automatic') continue;
    if (sliceKey(a.appName, a.windowTitle) !== mergeKey) continue;
    const end = parseISO(a.endTime);
    const gapMin = differenceInMinutes(now, end);
    if (gapMin >= 0 && gapMin < ACTIVITY_MERGE_GAP_MINUTES) {
      const t = end.getTime();
      if (!best || t > bestEnd) {
        best = a;
        bestEnd = t;
      }
    }
  }
  return best;
}

function isExcluded(processName: string, title: string, exclusionList: string[]): boolean {
  const p = normProcess(processName);
  if (!p.trim() && !title.trim()) return true;
  // Don't track our own app window.
  if (p === 'mvptime' || p === 'mvptracker') return true;
  for (const raw of exclusionList) {
    const e = normProcess(raw) || raw.trim().toLowerCase();
    if (!e) continue;
    if (p.includes(e) || e.includes(p)) return true;
    if (title.toLowerCase().includes(e)) return true;
  }
  return false;
}

type ActiveWindowPayload = { processName: string; windowTitle: string; available: boolean };

/** IPC may expose camelCase or snake_case depending on serde/Tauri version. */
function normalizeActiveWindow(raw: unknown): ActiveWindowPayload {
  if (!raw || typeof raw !== 'object') {
    return { processName: '', windowTitle: '', available: false };
  }
  const o = raw as Record<string, unknown>;
  return {
    processName: String(o.processName ?? o.process_name ?? ''),
    windowTitle: String(o.windowTitle ?? o.window_title ?? ''),
    available: Boolean(o.available),
  };
}

/**
 * Polls foreground window (Windows) and merges time into `activities` via the store.
 * Settings are read from SQLite with TTL (see trackingPrefsCache); invalidated on settings saves / window focus.
 */
export function useAutomaticTracking(enabled = true) {
  const addActivity = useStore((s) => s.addActivity);
  const updateActivity = useStore((s) => s.updateActivity);
  const setCurrentApp = useStore((s) => s.setCurrentApp);
  const setIsTracking = useStore((s) => s.setIsTracking);
  const setTrackingStatus = useStore((s) => s.setTrackingStatus);

  const currentSliceIdRef = useRef<string | null>(null);
  const currentSliceKeyRef = useRef<string | null>(null);
  const macosAxPromptedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !isTauri()) {
      useStore.getState().clearAutomaticPollBoundary();
      setIsTracking(false);
      setTrackingStatus('idle');
      setCurrentApp('');
      currentSliceIdRef.current = null;
      currentSliceKeyRef.current = null;
      return;
    }

    const intervalMs = 4500;
    let cancelled = false;
    let busy = false;

    const onFocus = () => invalidateTrackingPrefsCache();
    window.addEventListener('focus', onFocus);

    const tick = async () => {
      if (cancelled || busy) return;
      busy = true;
      try {
        const { trackingEnabled, exclusionList } = await loadTrackingPrefsFromDb(() =>
          useStore.getState().settings
        );
        if (cancelled) return;

        if (!trackingEnabled) {
          useStore.getState().clearAutomaticPollBoundary();
          setIsTracking(false);
          setTrackingStatus('idle');
          setCurrentApp('');
          currentSliceIdRef.current = null;
          currentSliceKeyRef.current = null;
          macosAxPromptedRef.current = false;
          return;
        }

        const isMac =
          typeof navigator !== 'undefined' &&
          typeof navigator.platform === 'string' &&
          navigator.platform.toLowerCase().includes('mac');
        if (isMac && !macosAxPromptedRef.current) {
          macosAxPromptedRef.current = true;
          void invoke('macos_ensure_accessibility', { prompt: true }).catch(() => {});
        }

        const snap = normalizeActiveWindow(await invoke('get_active_window'));
        if (cancelled) return;

        useStore.getState().touchAutomaticPollAt();

        if (!snap.available) {
          setIsTracking(false);
          setTrackingStatus('idle');
          setCurrentApp('');
          currentSliceIdRef.current = null;
          currentSliceKeyRef.current = null;
          return;
        }

        const app = snap.processName.trim() || '(unknown)';
        const title = snap.windowTitle || '';
        setCurrentApp(app);

        if (isExcluded(snap.processName, title, exclusionList)) {
          setIsTracking(false);
          setTrackingStatus('idle');
          currentSliceIdRef.current = null;
          currentSliceKeyRef.current = null;
          return;
        }

        setIsTracking(true);
        setTrackingStatus('active');

        const tKey = sliceKey(app, titleMergeKey(title));
        const nowIso = new Date().toISOString();
        const nowDate = new Date(nowIso);
        const url = urlFromWindowTitle(title);

        const sessionId =
          useStore.getState().trackingSessionId.trim() || 'legacy';

        const resume = findResumableActivity(tKey, useStore.getState().activities, nowDate);
        if (resume) {
          currentSliceIdRef.current = resume.id;
          currentSliceKeyRef.current = tKey;
          const duration = Math.max(0, differenceInSeconds(nowDate, new Date(resume.startTime)));
          const category = inferAppCategory(app, title);
          updateActivity(resume.id, {
            endTime: nowIso,
            duration,
            appName: app,
            windowTitle: title,
            url: url ?? resume.url,
            category,
            productivity: inferProductivityForActivityContext(app, title, category),
          });
          return;
        }

        if (currentSliceIdRef.current && currentSliceKeyRef.current === tKey) {
          const id = currentSliceIdRef.current;
          const row = useStore.getState().activities.find((a) => a.id === id);
          if (row) {
            const gapMin = differenceInMinutes(nowDate, parseISO(row.endTime));
            if (gapMin < ACTIVITY_MERGE_GAP_MINUTES) {
              const duration = Math.max(0, differenceInSeconds(nowDate, new Date(row.startTime)));
              const category = inferAppCategory(app, title);
              updateActivity(id, {
                endTime: nowIso,
                duration,
                appName: app,
                windowTitle: title,
                url: url ?? row.url,
                category,
                productivity: inferProductivityForActivityContext(app, title, category),
              });
              return;
            }
          }
        }

        currentSliceKeyRef.current = tKey;
        const id = crypto.randomUUID();
        currentSliceIdRef.current = id;

        const category = inferAppCategory(app, title);
        const inferredProject = inferSystemProjectName(app, title, category);
        const projectId = resolveProjectIdForSystemName(
          inferredProject,
          useStore.getState().projects
        );
        const entry: ActivityEntry = {
          id,
          appName: app,
          windowTitle: title,
          url,
          startTime: nowIso,
          endTime: nowIso,
          duration: 0,
          category,
          productivity: inferProductivityForActivityContext(app, title, category),
          type: 'automatic',
          trackingSessionId: sessionId,
          ...(projectId ? { projectId } : {}),
        };
        addActivity(entry);
      } catch {
        if (!cancelled) {
          setIsTracking(false);
          setTrackingStatus('idle');
        }
      } finally {
        busy = false;
      }
    };

    void tick();
    const handle = window.setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      clearInterval(handle);
      useStore.getState().clearAutomaticPollBoundary();
      setIsTracking(false);
      setTrackingStatus('idle');
      setCurrentApp('');
      currentSliceIdRef.current = null;
      currentSliceKeyRef.current = null;
    };
  }, [enabled, addActivity, updateActivity, setCurrentApp, setIsTracking, setTrackingStatus]);
}
