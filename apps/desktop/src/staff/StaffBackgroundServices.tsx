import { useEffect, useState } from 'react';
import { useAutomaticTracking } from './useAutomaticTracking';
import { useTaskCheckInScheduler } from './useTaskCheckInScheduler';
import { useSupabaseSync } from './useSupabaseSync';
import { useAppUpdater } from './useAppUpdater';
import { useStore } from './store/useStore';

/**
 * Runs staff background services (tracking, sync, check-ins) even when user is in Admin portal.
 * Must be mounted only after auth is confirmed (e.g. inside ProtectedRoute).
 */
export default function StaffBackgroundServices() {
  const { hydrate } = useStore();
  const trackingPaused = useStore((s) => s.trackingPaused);
  const [hydrated, setHydrated] = useState(false);

  // The check-in window route is `/staff?checkin=1`. When it is open, we avoid spawning another.
  const isCheckIn =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('checkin');

  const enabled = !isCheckIn;
  const trackingFeaturesEnabled = enabled && !trackingPaused;

  useEffect(() => {
    let cancelled = false;
    if (isCheckIn) {
      setHydrated(false);
      return;
    }
    setHydrated(false);
    void hydrate().finally(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrate, isCheckIn]);

  useTaskCheckInScheduler(trackingFeaturesEnabled);
  useAutomaticTracking(trackingFeaturesEnabled);
  useSupabaseSync(enabled && hydrated);
  useAppUpdater(enabled);

  return null;
}

