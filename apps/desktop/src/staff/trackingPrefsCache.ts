import { invoke, isTauri } from '@tauri-apps/api/core';
import type { AppSettings } from './types';

let prefsCache: { at: number; trackingEnabled: boolean; exclusionList: string[] } | null = null;

/** SQLite settings read used by automatic tracking; refreshed at most every 30s unless invalidated. */
export const TRACKING_PREFS_TTL_MS = 30_000;

export function invalidateTrackingPrefsCache(): void {
  prefsCache = null;
}

export async function loadTrackingPrefsFromDb(getFallback: () => AppSettings): Promise<{
  trackingEnabled: boolean;
  exclusionList: string[];
}> {
  const fallback = getFallback();
  if (!isTauri()) {
    return {
      trackingEnabled: fallback.trackingEnabled,
      exclusionList: fallback.exclusionList,
    };
  }
  const now = Date.now();
  if (prefsCache && now - prefsCache.at < TRACKING_PREFS_TTL_MS) {
    return {
      trackingEnabled: prefsCache.trackingEnabled,
      exclusionList: prefsCache.exclusionList,
    };
  }
  try {
    const json = await invoke<string | null>('db_get_settings');
    if (!json) {
      prefsCache = { at: now, trackingEnabled: fallback.trackingEnabled, exclusionList: fallback.exclusionList };
      return {
        trackingEnabled: fallback.trackingEnabled,
        exclusionList: fallback.exclusionList,
      };
    }
    const s = JSON.parse(json) as AppSettings;
    const trackingEnabled = s.trackingEnabled ?? true;
    const exclusionList = Array.isArray(s.exclusionList) ? s.exclusionList : fallback.exclusionList;
    prefsCache = { at: Date.now(), trackingEnabled, exclusionList };
    return { trackingEnabled, exclusionList };
  } catch {
    return {
      trackingEnabled: fallback.trackingEnabled,
      exclusionList: fallback.exclusionList,
    };
  }
}
