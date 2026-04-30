// Supabase Edge Function: admin-users
// Purpose: admin-only user management (list/create/invite/reset password)
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Role = 'admin' | 'staff';

type Action =
  | 'list'
  | 'create_user'
  | 'invite_user'
  | 'reset_password';

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

function badRequest(message: string, extra?: Record<string, unknown>) {
  return json({ error: message, ...(extra ?? {}) }, 400);
}

function forbidden(message = 'Forbidden') {
  return json({ error: message }, 403);
}

function serverError(message = 'Server error') {
  return json({ error: message }, 500);
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

function userClient(url: string, anonKey: string, token: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function adminClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

async function requireAdmin(req: Request) {
  const url = env('SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY');
  const token = getBearerToken(req);
  if (!token) return { ok: false as const, res: forbidden('Missing Authorization bearer token') };

  const sbUser = userClient(url, anonKey, token);

  const { data: userData, error: userErr } = await sbUser.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false as const, res: forbidden('Invalid user session') };
  }
  const uid = userData.user.id;

  const { data: roleRow, error: roleErr } = await sbUser
    .from('user_roles')
    .select('role')
    .eq('user_id', uid)
    .maybeSingle();
  if (roleErr) return { ok: false as const, res: forbidden('Unable to read role') };
  if (roleRow?.role !== 'admin') return { ok: false as const, res: forbidden('Admins only') };

  const sbAdmin = adminClient(url, env('SUPABASE_SERVICE_ROLE_KEY'));
  return { ok: true as const, uid, sbUser, sbAdmin };
}

function safeRole(v: unknown): Role | null {
  return v === 'admin' || v === 'staff' ? (v as Role) : null;
}

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  if (!e || !e.includes('@')) return null;
  return e;
}

function normalizeName(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length ? s : null;
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return badRequest('Invalid JSON body');
    }

    const action = body?.action as Action | undefined;
    if (!action) return badRequest('Missing action');

    if (action === 'list') {
      const perPage = Math.min(1000, Math.max(1, Number(body?.perPage ?? 200)));
      const page = Math.max(1, Number(body?.page ?? 1));

      // Admin Auth: list users (includes email)
      const { data: listData, error: listErr } = await auth.sbAdmin.auth.admin.listUsers({ page, perPage });
      if (listErr) return serverError(`listUsers failed: ${listErr.message}`);

      const users = (listData?.users ?? []).map((u: any) => ({
        id: String(u.id),
        email: u.email ? String(u.email) : null,
        created_at: u.created_at ? String(u.created_at) : null,
        last_sign_in_at: u.last_sign_in_at ? String(u.last_sign_in_at) : null,
      }));

      const ids = users.map((u) => u.id);
      if (ids.length === 0) return json({ users: [], page, perPage });

      const [{ data: profiles, error: profErr }, { data: roles, error: rolesErr }, { data: presence, error: presErr }] =
        await Promise.all([
          auth.sbAdmin.from('profiles').select('user_id, full_name').in('user_id', ids),
          auth.sbAdmin.from('user_roles').select('user_id, role').in('user_id', ids),
          auth.sbAdmin.from('user_presence').select('user_id, last_heartbeat_at, last_active_at').in('user_id', ids),
        ]);

      if (profErr) return serverError(`profiles query failed: ${profErr.message}`);
      if (rolesErr) return serverError(`user_roles query failed: ${rolesErr.message}`);
      if (presErr) return serverError(`user_presence query failed: ${presErr.message}`);

      const nameById = new Map((profiles ?? []).map((p: any) => [String(p.user_id), p.full_name ? String(p.full_name) : null]));
      const roleById = new Map((roles ?? []).map((r: any) => [String(r.user_id), safeRole(r.role)]));
      const presById = new Map(
        (presence ?? []).map((p: any) => [
          String(p.user_id),
          {
            last_heartbeat_at: p.last_heartbeat_at ? String(p.last_heartbeat_at) : null,
            last_active_at: p.last_active_at ? String(p.last_active_at) : null,
          },
        ])
      );

      const merged = users.map((u) => ({
        ...u,
        full_name: nameById.get(u.id) ?? null,
        role: roleById.get(u.id) ?? null,
        presence: presById.get(u.id) ?? null,
      }));

      return json({ users: merged, page, perPage });
    }

    if (action === 'create_user') {
      const email = normalizeEmail(body?.email);
      const fullName = normalizeName(body?.full_name);
      const role = safeRole(body?.role) ?? 'staff';
      const password = typeof body?.password === 'string' && body.password.trim().length >= 8 ? body.password.trim() : null;
      if (!email) return badRequest('Invalid email');
      if (!password) return badRequest('Invalid password (min 8 chars)');

      const { data, error } = await auth.sbAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) return serverError(`createUser failed: ${error.message}`);
      const userId = String((data as any)?.user?.id ?? '');
      if (!userId) return serverError('createUser did not return user id');

      const [{ error: profErr }, { error: roleErr }] = await Promise.all([
        auth.sbAdmin.from('profiles').upsert({ user_id: userId, full_name: fullName }, { onConflict: 'user_id' }),
        auth.sbAdmin.from('user_roles').upsert({ user_id: userId, role }, { onConflict: 'user_id' }),
      ]);
      if (profErr) return serverError(`profiles upsert failed: ${profErr.message}`);
      if (roleErr) return serverError(`user_roles upsert failed: ${roleErr.message}`);

      return json({ ok: true, user: { id: userId, email, full_name: fullName, role } });
    }

    if (action === 'invite_user') {
      const email = normalizeEmail(body?.email);
      const fullName = normalizeName(body?.full_name);
      const role = safeRole(body?.role) ?? 'staff';
      const redirectTo = typeof body?.redirectTo === 'string' && body.redirectTo.trim().length ? body.redirectTo.trim() : undefined;
      if (!email) return badRequest('Invalid email');

      const { data, error } = await auth.sbAdmin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
      if (error) return serverError(`inviteUserByEmail failed: ${error.message}`);
      const userId = String((data as any)?.user?.id ?? '');
      if (!userId) return serverError('inviteUserByEmail did not return user id');

      const [{ error: profErr }, { error: roleErr }] = await Promise.all([
        auth.sbAdmin.from('profiles').upsert({ user_id: userId, full_name: fullName }, { onConflict: 'user_id' }),
        auth.sbAdmin.from('user_roles').upsert({ user_id: userId, role }, { onConflict: 'user_id' }),
      ]);
      if (profErr) return serverError(`profiles upsert failed: ${profErr.message}`);
      if (roleErr) return serverError(`user_roles upsert failed: ${roleErr.message}`);

      return json({ ok: true, user: { id: userId, email, full_name: fullName, role } });
    }

    if (action === 'reset_password') {
      const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : null;
      const password = typeof body?.password === 'string' && body.password.trim().length >= 8 ? body.password.trim() : null;
      if (!userId) return badRequest('Missing user_id');
      if (!password) return badRequest('Invalid password (min 8 chars)');

      const { error } = await auth.sbAdmin.auth.admin.updateUserById(userId, { password });
      if (error) return serverError(`updateUserById failed: ${error.message}`);
      return json({ ok: true });
    }

    return badRequest('Unknown action');
  } catch (e: any) {
    return serverError(String(e?.message || e));
  }
});

