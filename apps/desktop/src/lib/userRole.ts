import { supabase } from './supabase';

/** Keep session across app restarts when "1"; "0" means clear session on next launch (see main.tsx bootstrap). */
export const LS_PERSIST_SESSION = 'mvptracker_persist_session';

export type AppUserRole = 'admin' | 'staff';

/**
 * App role from `user_roles` (RLS: user can read own row).
 * Returns null if no row, invalid value, or error.
 */
export async function fetchUserRole(uid: string): Promise<AppUserRole | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', uid)
    .single();

  if (error) throw error;
  const r = data?.role;
  if (r !== 'admin' && r !== 'staff') return null;
  return r;
}
