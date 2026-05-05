import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const DEBOUNCE_MS = 12_000;

/**
 * After startup, checks GitHub release `latest.json` (Tauri updater) and offers to install.
 */
export function useAppUpdater(enabled: boolean) {
  const ran = useRef(false);

  useEffect(() => {
    if (!enabled || !isTauri()) return;

    const timer = window.setTimeout(() => {
      if (ran.current) return;
      ran.current = true;
      void (async () => {
        try {
          const update = await check();
          if (!update) return;
          const version = update.version;
          const ok = window.confirm(
            `MVPTime ${version} is available. Download and install the update now?`
          );
          if (!ok) return;
          await update.downloadAndInstall();
          await relaunch();
        } catch {
          /* offline, invalid endpoint, or no release yet */
        }
      })();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [enabled]);
}
