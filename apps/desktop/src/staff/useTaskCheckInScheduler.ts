import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LogicalPosition, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { primaryMonitor } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { parseISO } from 'date-fns';
import { useStore } from './store/useStore';
import type { TaskSegment } from './types';

const CHECKIN_MS = 15 * 60 * 1000;
const TICK_MS = 60 * 1000;
const LS_DAILY_CHECKIN_SHOWN_DAY = 'mvptime:lastDailyCheckinShownDay';
const LS_DAILY_CHECKIN_SHOWN_DAY_LEGACY = 'mvptracker:lastDailyCheckinShownDay';
export const LS_TASK_CHECKIN_SNOOZE_UNTIL = 'mvptime:taskCheckinSnoozeUntil';

/** Match TaskCheckInPanel compact layout for placement math. */
export const TASK_CHECKIN_WINDOW_WIDTH = 360;
export const TASK_CHECKIN_WINDOW_HEIGHT = 300;
const CORNER_MARGIN = 10;

/** Disables native close / minimize / maximize so the user must answer in the UI. */
export async function restrictTaskCheckInWindowChrome(w: WebviewWindow): Promise<void> {
  try {
    await w.setClosable(false);
    await w.setMinimizable(false);
    await w.setMaximizable(false);
  } catch {
    // Unsupported platform or missing capability
  }
}

async function logicalTopRightForCheckInWindow(): Promise<{ x: number; y: number }> {
  const mon = await primaryMonitor();
  if (!mon) {
    return { x: CORNER_MARGIN, y: CORNER_MARGIN };
  }
  const f = mon.scaleFactor;
  const wa = mon.workArea;
  const posPx = new PhysicalPosition(wa.position.x, wa.position.y).toLogical(f);
  const sizePx = new PhysicalSize(wa.size.width, wa.size.height).toLogical(f);
  const x = Math.round(posPx.x + sizePx.width - TASK_CHECKIN_WINDOW_WIDTH - CORNER_MARGIN);
  const y = Math.round(posPx.y + CORNER_MARGIN);
  return {
    x: Math.max(Math.round(posPx.x + CORNER_MARGIN), x),
    y: Math.max(Math.round(posPx.y + CORNER_MARGIN), y),
  };
}

/** Snap check-in webview to primary monitor work area (top-right). */
export async function positionTaskCheckInWindowCorner(w: WebviewWindow): Promise<void> {
  try {
    const { x, y } = await logicalTopRightForCheckInWindow();
    await w.setPosition(new LogicalPosition(x, y));
  } catch {
    // ignore
  }
}

export async function prepareTaskCheckInWindow(w: WebviewWindow): Promise<void> {
  await positionTaskCheckInWindowCorner(w);
  await restrictTaskCheckInWindowChrome(w);
}

let openInFlight = false;

async function safeCloseOrDestroy(w: WebviewWindow): Promise<void> {
  try {
    await w.close();
    return;
  } catch {
    // ignore
  }
  try {
    await w.destroy();
  } catch {
    // ignore
  }
}

async function createCheckInWindow(opts?: { defaultNo?: boolean }): Promise<void> {
  const { x, y } = await logicalTopRightForCheckInWindow();
  const w = new WebviewWindow('task-checkin', {
    url: opts?.defaultNo ? checkInWindowUrlWithDefaultNo() : checkInWindowUrl(),
    title: 'Task check-in',
    width: TASK_CHECKIN_WINDOW_WIDTH,
    height: TASK_CHECKIN_WINDOW_HEIGHT,
    x,
    y,
    center: false,
    alwaysOnTop: true,
    resizable: false,
    visible: true,
    closable: false,
    minimizable: false,
    maximizable: false,
  });
  w.once('tauri://created', () => {
    void prepareTaskCheckInWindow(w);
  });
  w.once('tauri://error', (e) => {
    console.error('task-checkin window', e);
  });
}

function checkInWindowUrl(): string {
  return `${window.location.origin}/staff?checkin=1`;
}

function checkInWindowUrlWithDefaultNo(): string {
  return `${window.location.origin}/staff?checkin=1&default=no`;
}

function safeGetLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function snoozeUntilMs(): number {
  const raw = safeGetLocalStorage(LS_TASK_CHECKIN_SNOOZE_UNTIL);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function deadlineMs(segments: TaskSegment[]): number {
  const open = segments
    .filter((s) => !s.endTime)
    .sort((a, b) => parseISO(b.startTime).getTime() - parseISO(a.startTime).getTime())[0];
  const anchorIso = open?.lastPromptAt ?? open?.startTime;
  if (!anchorIso) return Date.now() + CHECKIN_MS;
  return parseISO(anchorIso).getTime() + CHECKIN_MS;
}

async function openOrFocusCheckInWindow(opts?: { defaultNo?: boolean }): Promise<void> {
  if (openInFlight) return;
  openInFlight = true;
  try {
    const existing = await WebviewWindow.getByLabel('task-checkin');
    if (existing) {
      try {
        const visible = await existing.isVisible();
        if (visible) {
          await existing.setFocus();
          await prepareTaskCheckInWindow(existing);
          return;
        }
      } catch {
        await safeCloseOrDestroy(existing);
      }
      try {
        await existing.show();
        await existing.setFocus();
        await prepareTaskCheckInWindow(existing);
        return;
      } catch {
        await safeCloseOrDestroy(existing);
      }
    }
    await createCheckInWindow(opts);
  } finally {
    openInFlight = false;
  }
}

/**
 * While the main staff UI is shown, opens or focuses the check-in window when the 15-minute deadline is due.
 */
export function useTaskCheckInScheduler(enabled: boolean) {
  const reloadTaskSegments = useStore((s) => s.reloadTaskSegments);
  const refreshDerivedTimeline = useStore((s) => s.refreshDerivedTimeline);
  const taskSegments = useStore((s) => s.taskSegments);

  useEffect(() => {
    if (!enabled || !isTauri()) return;
    if (taskSegments.length === 0) return;

    const today = localDayKey(new Date());
    const shown =
      safeGetLocalStorage(LS_DAILY_CHECKIN_SHOWN_DAY) ??
      safeGetLocalStorage(LS_DAILY_CHECKIN_SHOWN_DAY_LEGACY);
    if (shown === today) {
      // Ensure we migrate forward so only one key is used long-term.
      safeSetLocalStorage(LS_DAILY_CHECKIN_SHOWN_DAY, today);
      return;
    }

    void openOrFocusCheckInWindow({ defaultNo: true }).then(() => {
      safeSetLocalStorage(LS_DAILY_CHECKIN_SHOWN_DAY, today);
    });
  }, [enabled, taskSegments]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen('task-checkin-answered', () => {
      void reloadTaskSegments();
      refreshDerivedTimeline();
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [reloadTaskSegments, refreshDerivedTimeline]);

  useEffect(() => {
    if (!enabled || !isTauri()) return;

    const tick = () => {
      const segments = useStore.getState().taskSegments;
      if (segments.length === 0) return;
      const dueAt = Math.max(deadlineMs(segments), snoozeUntilMs());
      if (Date.now() >= dueAt) {
        void openOrFocusCheckInWindow();
      }
    };

    const id = window.setInterval(tick, TICK_MS);
    tick();
    return () => clearInterval(id);
  }, [enabled]);
}
