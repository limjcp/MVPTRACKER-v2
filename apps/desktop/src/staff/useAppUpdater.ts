import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { toast } from 'sonner';

const DEBOUNCE_MS = 12_000;
const LS_DISMISSED_VERSION = 'mvptime:dismissedUpdaterVersion';

function readDismissedVersion(): string | null {
  try {
    return localStorage.getItem(LS_DISMISSED_VERSION);
  } catch {
    return null;
  }
}

function writeDismissedVersion(v: string) {
  try {
    localStorage.setItem(LS_DISMISSED_VERSION, v);
  } catch {
    /* ignore */
  }
}

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
          if (readDismissedVersion() === version) return;

          const install = async (u: Update) => {
            const tid = toast.loading('Downloading update…');
            try {
              await u.downloadAndInstall();
              toast.dismiss(tid);
              await relaunch();
            } catch (e) {
              toast.dismiss(tid);
              toast.error(e instanceof Error ? e.message : 'Update failed');
            }
          };

          toast(`MVPTime ${version} is available`, {
            description: 'Install now or dismiss until the next version.',
            duration: Infinity,
            action: {
              label: 'Install',
              onClick: () => void install(update),
            },
            cancel: {
              label: 'Later',
              onClick: () => writeDismissedVersion(version),
            },
          });
        } catch {
          /* offline, invalid endpoint, or no release yet */
        }
      })();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [enabled]);
}
