import { useEffect } from 'react';
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

  // The check-in window route is `/staff?checkin=1`. When it is open, we avoid spawning another.
  const isCheckIn =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('checkin');

  const enabled = !isCheckIn;

  useEffect(() => {
    if (isCheckIn) return;
    void hydrate();
  }, [hydrate, isCheckIn]);

  useTaskCheckInScheduler(enabled);
  useAutomaticTracking(enabled);
  useSupabaseSync(enabled);
  useAppUpdater(enabled);

  return null;
}

