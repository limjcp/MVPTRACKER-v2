import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, KeyRound, Plus, RefreshCw, Send, Users as UsersIcon } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { cn } from '../utils/cn';

type Role = 'admin' | 'staff';

type ApiUser = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  full_name: string | null;
  role: Role | null;
  presence: { last_heartbeat_at: string | null; last_active_at: string | null } | null;
};

function isOnline(lastHeartbeatIso: string | null, windowMinutes = 2): boolean {
  if (!lastHeartbeatIso) return false;
  const t = new Date(lastHeartbeatIso).getTime();
  return Number.isFinite(t) && Date.now() - t <= windowMinutes * 60_000;
}

function fmtAgo(iso: string | null, _tick?: number): string {
  if (!iso) return 'never';
  try {
    return `${formatDistanceToNowStrict(new Date(iso))} ago`;
  } catch {
    return 'unknown';
  }
}

function genTempPassword(len = 14): string {
  // no ambiguous chars; include digits for strength
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function adminInvoke<T>(body: any): Promise<T> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    const anyErr: any = error as any;
    const status = anyErr?.context?.status;
    if (status === 404) {
      throw new Error('Edge Function `admin-users` was not found (404). Deploy it to your Supabase project.');
    }
    throw error;
  }
  return data as T;
}

export default function Users() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<ApiUser[]>([]);

  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const [resetFor, setResetFor] = useState<ApiUser | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [relativeTick, setRelativeTick] = useState(0);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminInvoke<{ users: ApiUser[] }>({ action: 'list', page: 1, perPage: 500 });
      setUsers(res.users ?? []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setRelativeTick((x) => x + 1);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel('admin-users-presence')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, (payload: any) => {
        const eventType = String(payload?.eventType ?? '');
        const nextRow = payload?.new as { user_id?: string; last_heartbeat_at?: string | null; last_active_at?: string | null } | null;
        const oldRow = payload?.old as { user_id?: string } | null;
        const uid = String(nextRow?.user_id ?? oldRow?.user_id ?? '').trim();
        if (!uid) return;
        setUsers((prev) => {
          let changed = false;
          const nextUsers = prev.map((u) => {
            if (u.id !== uid) return u;
            changed = true;
            if (eventType === 'DELETE') {
              return { ...u, presence: null };
            }
            return {
              ...u,
              presence: {
                last_heartbeat_at: nextRow?.last_heartbeat_at ?? null,
                last_active_at: nextRow?.last_active_at ?? null,
              },
            };
          });
          return changed ? nextUsers : prev;
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users
      .filter((u) => (roleFilter === 'all' ? true : u.role === roleFilter))
      .filter((u) => {
        if (!needle) return true;
        const name = (u.full_name ?? '').toLowerCase();
        const email = (u.email ?? '').toLowerCase();
        return name.includes(needle) || email.includes(needle) || u.id.toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        const an = (a.full_name ?? a.email ?? a.id).toLowerCase();
        const bn = (b.full_name ?? b.email ?? b.id).toLowerCase();
        return an.localeCompare(bn);
      });
  }, [users, q, roleFilter]);

  return (
    <div className="flex-1 overflow-y-auto p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-white text-xl font-semibold flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-white/70" />
            Users
          </h2>
          <p className="text-white/35 text-xs mt-1">
            Admin user management · online updates from realtime presence heartbeat.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className={cn(
              'px-3 py-2 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-2',
              loading
                ? 'cursor-not-allowed bg-white/[0.03] border-white/[0.06] text-white/25'
                : 'bg-white/[0.04] border-white/[0.08] text-white/60 hover:bg-white/[0.08] hover:text-white'
            )}
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.04] border border-white/[0.08] text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Invite
          </button>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-violet-500/25 border border-violet-500/30 text-violet-200 hover:bg-violet-500/30 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, or id…"
          className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 placeholder:text-white/20 outline-none focus:border-violet-500/40"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as any)}
          className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/70 outline-none focus:border-violet-500/40"
        >
          <option value="all">All roles</option>
          <option value="admin">Admins</option>
          <option value="staff">Staff</option>
        </select>
      </div>

      {error ? (
        <div className="mt-5 max-w-2xl rounded-2xl border border-red-500/25 bg-red-500/5 p-5">
          <p className="text-red-300 font-semibold">Users error</p>
          <p className="mt-2 text-red-200/70 text-sm">{error}</p>
          <p className="mt-3 text-white/35 text-xs">
            Make sure the `admin-users` Edge Function is deployed and you’re signed in as an admin.
          </p>
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border border-white/[0.06] bg-[#111318] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <p className="text-white/70 text-sm font-semibold">
            {loading ? 'Loading…' : `${filtered.length} user${filtered.length === 1 ? '' : 's'}`}
          </p>
          <p className="text-white/25 text-xs">Online = heartbeat in last 2 minutes</p>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {loading ? (
            <div className="p-5 text-white/40 text-sm">Fetching users…</div>
          ) : filtered.length === 0 ? (
            <div className="p-5 text-white/40 text-sm">No users found.</div>
          ) : (
            filtered.map((u) => {
              const online = isOnline(u.presence?.last_heartbeat_at ?? null);
              const lastSeenOrLoginIso = u.presence?.last_heartbeat_at ?? u.last_sign_in_at ?? null;
              const lastSeen = fmtAgo(lastSeenOrLoginIso, relativeTick);
              const lastActiveIso =
                u.presence?.last_active_at ?? u.presence?.last_heartbeat_at ?? u.last_sign_in_at ?? null;
              const lastActive = fmtAgo(lastActiveIso, relativeTick);
              return (
                <div key={u.id} className="px-4 py-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                    <div className="flex items-start gap-3 min-w-0 xl:w-[420px]">
                      <div className={cn('mt-1 w-2.5 h-2.5 rounded-full', online ? 'bg-emerald-400' : 'bg-white/20')} />
                      <div className="min-w-0">
                        <p className="text-white/80 text-sm font-semibold truncate">
                          {u.full_name?.trim() || u.email?.trim() || `${u.id.slice(0, 8)}…`}
                        </p>
                        <p className="text-white/30 text-xs truncate">{u.email ?? '—'}</p>
                        <p className="text-white/30 text-xs mt-0.5">
                          Role: <span className="text-white/55 font-semibold">{u.role ?? '—'}</span>
                          <span className="text-white/20"> · </span>
                          Last seen/login: <span className="text-white/45">{lastSeen}</span>
                          <span className="text-white/20"> · </span>
                          Last active: <span className="text-white/45">{lastActive}</span>
                        </p>
                      </div>
                    </div>

                    <div className="xl:flex-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setResetFor(u)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.04] border border-white/[0.08] text-white/65 hover:bg-white/[0.08] hover:text-white transition-colors flex items-center gap-2"
                      >
                        <KeyRound className="w-4 h-4" />
                        Reset password
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        busy={busyAction === 'create'}
        onSubmit={async (v) => {
          setBusyAction('create');
          try {
            await adminInvoke({ action: 'create_user', ...v });
            setCreateOpen(false);
            await refresh();
          } finally {
            setBusyAction(null);
          }
        }}
      />

      <InviteUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        busy={busyAction === 'invite'}
        onSubmit={async (v) => {
          setBusyAction('invite');
          try {
            await adminInvoke({ action: 'invite_user', ...v });
            setInviteOpen(false);
            await refresh();
          } finally {
            setBusyAction(null);
          }
        }}
      />

      <ResetPasswordModal
        user={resetFor}
        onClose={() => setResetFor(null)}
        busy={busyAction === 'reset'}
        onSubmit={async (v) => {
          if (!resetFor) return;
          setBusyAction('reset');
          try {
            await adminInvoke({ action: 'reset_password', user_id: resetFor.id, password: v.password });
            setResetFor(null);
          } finally {
            setBusyAction(null);
          }
        }}
      />
    </div>
  );
}

function ModalShell({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#0D0F14] shadow-[0_0_80px_rgba(0,0,0,0.65)]">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-white/85 text-sm font-semibold">{title}</h3>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-white/35 text-[11px] font-semibold uppercase tracking-wider block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function CreateUserModal({
  open,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: { full_name: string; email: string; role: Role; password: string }) => Promise<void>;
  busy: boolean;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [password, setPassword] = useState(() => genTempPassword());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setPassword(genTempPassword());
  }, [open]);

  return (
    <ModalShell open={open} onClose={onClose} title="Create user">
      <div className="space-y-4">
        <Field label="Full name">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 outline-none focus:border-violet-500/40"
            placeholder="Jane Doe"
          />
        </Field>
        <Field label="Email">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 outline-none focus:border-violet-500/40"
            placeholder="jane@company.com"
            required
          />
        </Field>
        <Field label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/70 outline-none focus:border-violet-500/40"
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <Field label="Temporary password">
          <div className="flex gap-2">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 outline-none focus:border-violet-500/40 font-mono"
            />
            <button
              type="button"
              onClick={() => setPassword(genTempPassword())}
              className="px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/60 hover:bg-white/[0.08] hover:text-white transition-colors text-xs font-semibold"
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(password).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                });
              }}
              className="px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/60 hover:bg-white/[0.08] hover:text-white transition-colors text-xs font-semibold flex items-center gap-2"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              Copy
            </button>
          </div>
          <p className="mt-2 text-white/25 text-xs">Share this password securely; user should change it after first login.</p>
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.04] border border-white/[0.08] text-white/60 hover:bg-white/[0.08] hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit({ full_name: fullName.trim(), email: email.trim(), role, password })}
            disabled={busy || !email.trim()}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-violet-500/25 border border-violet-500/30 text-violet-200 hover:bg-violet-500/30 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create user
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function InviteUserModal({
  open,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: { full_name: string; email: string; role: Role; redirectTo?: string }) => Promise<void>;
  busy: boolean;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [redirectTo, setRedirectTo] = useState('');

  return (
    <ModalShell open={open} onClose={onClose} title="Invite user by email">
      <div className="space-y-4">
        <Field label="Full name (optional)">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 outline-none focus:border-violet-500/40"
            placeholder="Jane Doe"
          />
        </Field>
        <Field label="Email">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 outline-none focus:border-violet-500/40"
            placeholder="jane@company.com"
            required
          />
        </Field>
        <Field label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/70 outline-none focus:border-violet-500/40"
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <Field label="Redirect URL (optional)">
          <input
            value={redirectTo}
            onChange={(e) => setRedirectTo(e.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 outline-none focus:border-violet-500/40 font-mono"
            placeholder="https://your-app.com/welcome"
          />
          <p className="mt-2 text-white/25 text-xs">
            Must be whitelisted in Supabase Auth redirect URLs. Leave blank to use project defaults.
          </p>
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.04] border border-white/[0.08] text-white/60 hover:bg-white/[0.08] hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit({ full_name: fullName.trim(), email: email.trim(), role, redirectTo: redirectTo.trim() || undefined })}
            disabled={busy || !email.trim()}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-violet-500/25 border border-violet-500/30 text-violet-200 hover:bg-violet-500/30 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send invite
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onSubmit,
  busy,
}: {
  user: ApiUser | null;
  onClose: () => void;
  onSubmit: (v: { password: string }) => Promise<void>;
  busy: boolean;
}) {
  const open = Boolean(user);
  const [password, setPassword] = useState(() => genTempPassword());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword(genTempPassword());
    setCopied(false);
  }, [open]);

  return (
    <ModalShell open={open} onClose={onClose} title="Reset password (temporary)">
      <div className="space-y-4">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
          <p className="text-white/70 text-xs font-semibold">User</p>
          <p className="text-white/70 text-sm font-semibold mt-0.5">{user?.full_name?.trim() || user?.email || user?.id}</p>
          <p className="text-white/30 text-xs mt-0.5">{user?.email ?? '—'}</p>
        </div>

        <Field label="New temporary password">
          <div className="flex gap-2">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 outline-none focus:border-violet-500/40 font-mono"
            />
            <button
              type="button"
              onClick={() => setPassword(genTempPassword())}
              className="px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/60 hover:bg-white/[0.08] hover:text-white transition-colors text-xs font-semibold"
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(password).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                });
              }}
              className="px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/60 hover:bg-white/[0.08] hover:text-white transition-colors text-xs font-semibold flex items-center gap-2"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              Copy
            </button>
          </div>
          <p className="mt-2 text-white/25 text-xs">
            This will immediately invalidate the old password. Share the new password securely.
          </p>
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.04] border border-white/[0.08] text-white/60 hover:bg-white/[0.08] hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit({ password })}
            disabled={busy || password.trim().length < 8}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/20 border border-amber-500/25 text-amber-200 hover:bg-amber-500/25 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Reset password
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

