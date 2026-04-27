import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LogicalPosition, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { primaryMonitor } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { parseISO } from 'date-fns';
import { useStore } from './store/useStore';
import type { TaskSegment } from './types';

const CHECKIN_MS = 1 * 60 * 1000;
const TICK_MS = 60 * 1000;

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

function checkInWindowUrl(): string {
  return `${window.location.origin}/staff?checkin=1`;
}

function deadlineMs(segments: TaskSegment[]): number {
  const open = segments
    .filter((s) => !s.endTime)
    .sort((a, b) => parseISO(b.startTime).getTime() - parseISO(a.startTime).getTime())[0];
  const anchorIso = open?.lastPromptAt ?? open?.startTime;
  if (!anchorIso) return Date.now() + CHECKIN_MS;
  return parseISO(anchorIso).getTime() + CHECKIN_MS;
}

async function openOrFocusCheckInWindow(): Promise<void> {
  const { x, y } = await logicalTopRightForCheckInWindow();
  const existing = await WebviewWindow.getByLabel('task-checkin');
  if (existing) {
    await existing.show();
    await prepareTaskCheckInWindow(existing);
    await existing.setFocus();
    return;
  }
  const w = new WebviewWindow('task-checkin', {
    url: checkInWindowUrl(),
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

/**
 * While the main staff UI is shown, opens or focuses the check-in window when the 15-minute deadline is due.
 */
export function useTaskCheckInScheduler(enabled: boolean) {
  const reloadTaskSegments = useStore((s) => s.reloadTaskSegments);
  const refreshDerivedTimeline = useStore((s) => s.refreshDerivedTimeline);

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
      if (Date.now() >= deadlineMs(segments)) {
        void openOrFocusCheckInWindow();
      }
    };

    const id = window.setInterval(tick, TICK_MS);
    tick();
    return () => clearInterval(id);
  }, [enabled]);
}
