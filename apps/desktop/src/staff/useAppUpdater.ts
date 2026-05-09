import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { toast } from 'sonner';

const DEBOUNCE_MS = 12_000;
const LS_DISMISSED_VERSION = 'mvptime:dismissedUpdaterVersion';

function normalizeVersion(v: string | null | undefined): string | null {
  const raw = (v ?? '').trim();
  if (!raw) return null;
  const noPrefix = raw.replace(/^v/i, '').trim();
  const parts = noPrefix.split('.').map((p) => p.trim());
  // Drop trailing ".0" segments so 0.1.2 == 0.1.2.0
  while (parts.length > 1 && parts[parts.length - 1] === '0') parts.pop();
  const out = parts.join('.');
  return out ? out : null;
}

function readDismissedVersion(): string | null {
  try {
    return normalizeVersion(localStorage.getItem(LS_DISMISSED_VERSION));
  } catch {
    return null;
  }
}

function writeDismissedVersion(v: string) {
  try {
    const nv = normalizeVersion(v);
    if (!nv) localStorage.removeItem(LS_DISMISSED_VERSION);
    else localStorage.setItem(LS_DISMISSED_VERSION, nv);
  } catch {
    /* ignore */
  }
}

/**
 * After startup, checks GitHub release `latest.json` (Tauri updater) and offers to install.
 */
export function useAppUpdater(enabled: boolean) {
  const ran = useRef(false);
  const installingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !isTauri()) return;

    const timer = window.setTimeout(() => {
      if (ran.current) return;
      ran.current = true;
      void (async () => {
        try {
          const currentVersion = normalizeVersion(await getVersion().catch(() => null));
          const update = await check();
          if (!update) return;
          const version = normalizeVersion(update.version) ?? update.version;
          if (currentVersion && normalizeVersion(version) === currentVersion) {
            // If we're already on that version, don't prompt and clear any stale dismissal.
            if (readDismissedVersion() === normalizeVersion(version)) writeDismissedVersion('');
            return;
          }
          if (readDismissedVersion() === normalizeVersion(version)) return;

          const install = async (u: Update) => {
            if (installingRef.current) return;
            installingRef.current = true;
            // Avoid re-prompting this same version if the app closes during install.
            writeDismissedVersion(version);
            const tid = toast.loading('Downloading update…');
            try {
              await u.downloadAndInstall();
              toast.dismiss(tid);
              toast.message('Update installed. Restarting…');
              // Some environments close the app during install; relaunch is best-effort.
              window.setTimeout(() => {
                void relaunch();
              }, 350);
            } catch (e) {
              toast.dismiss(tid);
              toast.error(e instanceof Error ? e.message : 'Update failed');
              // Allow retry if install failed.
              installingRef.current = false;
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
