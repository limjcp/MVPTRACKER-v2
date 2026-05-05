import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Loader2, LogOut, UserRound, KeyRound, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';

type ProfileRow = { user_id: string; full_name: string | null };

function shortId(id: string) {
  if (!id) return '';
  return id.length <= 10 ? id : `${id.slice(0, 8)}…`;
}

export default function CurrentUserMenu({
  variant = 'titlebar',
}: {
  variant?: 'titlebar' | 'sidebar';
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string>('');
  const [nameDraft, setNameDraft] = useState<string>('');
  const [pwDraft, setPwDraft] = useState<string>('');

  const pillClass =
    variant === 'titlebar'
      ? 'h-6 px-2 rounded-lg text-[11px]'
      : 'h-9 px-3 rounded-xl text-[12px]';

  const containerClass =
    variant === 'titlebar'
      ? 'relative flex items-center'
      : 'relative w-full';

  const label = useMemo(() => {
    if (fullName.trim()) return fullName.trim();
    if (email?.trim()) return email.trim();
    return uid ? shortId(uid) : 'Signed out';
  }, [email, fullName, uid]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let mounted = true;

    const load = async () => {
      const { data } = await client.auth.getSession();
      const session = data.session;
      if (!mounted) return;
      if (!session) {
        setUid(null);
        setEmail(null);
        setFullName('');
        setNameDraft('');
        return;
      }
      setUid(session.user.id);
      setEmail(session.user.email ?? null);

      try {
        const { data: p } = await client
          .from('profiles')
          .select('user_id, full_name')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (!mounted) return;
        const nm = (p as ProfileRow | null)?.full_name ?? '';
        setFullName(nm ?? '');
        setNameDraft(nm ?? '');
      } catch {
        if (!mounted) return;
        setFullName('');
        setNameDraft('');
      }
    };

    void load();

    const { data: sub } = client.auth.onAuthStateChange((_evt, session) => {
      if (!mounted) return;
      if (!session) {
        setUid(null);
        setEmail(null);
        setFullName('');
        setNameDraft('');
        setOpen(false);
        return;
      }
      setUid(session.user.id);
      setEmail(session.user.email ?? null);
      void load();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const saveName = async () => {
    const client = supabase;
    if (!client || !uid) return;
    const next = nameDraft.trim();
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await client
        .from('profiles')
        .upsert({ user_id: uid, full_name: next }, { onConflict: 'user_id' });
      if (error) throw error;
      setFullName(next);
      setStatus('Saved name');
      setTimeout(() => setStatus(null), 1200);
    } catch (e: any) {
      setStatus(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    const client = supabase;
    if (!client) return;
    const next = pwDraft.trim();
    if (next.length < 8) {
      setStatus('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await client.auth.updateUser({ password: next });
      if (error) throw error;
      setPwDraft('');
      setStatus('Updated password');
      setTimeout(() => setStatus(null), 1200);
    } catch (e: any) {
      setStatus(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const doSignOut = async () => {
    const client = supabase;
    if (!client) return;
    setBusy(true);
    setStatus(null);
    try {
      await client.auth.signOut();
      setOpen(false);
    } catch (e: any) {
      setStatus(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={containerClass}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          'flex items-center gap-2 border border-white/[0.08] bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white/85 transition-colors',
          pillClass,
          variant === 'sidebar' ? 'w-full justify-between' : '',
        ].join(' ')}
        title={uid ? `Signed in as ${email ?? uid}` : 'Not signed in'}
      >
        <span className="flex items-center gap-2 min-w-0">
          <UserRound className={variant === 'titlebar' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className={variant === 'titlebar' ? 'w-3.5 h-3.5 opacity-70' : 'w-4 h-4 opacity-70'} />
      </button>

      {open && (
        <div
          className={[
            'absolute right-0 z-[200] mt-2 w-[360px] rounded-2xl border border-white/[0.10] bg-[#0D0F14] shadow-[0_24px_80px_rgba(0,0,0,0.65)] overflow-hidden',
            variant === 'titlebar' ? 'top-full' : 'bottom-full mb-2',
          ].join(' ')}
        >
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <p className="text-white/80 text-xs font-semibold">Account</p>
            <button
              type="button"
              className="text-white/35 hover:text-white/70 text-[11px]"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-white/25 text-[10px] uppercase tracking-wider font-semibold">Signed in</p>
              <p className="text-white/80 text-sm font-semibold mt-0.5 truncate">{label}</p>
              <p className="text-white/30 text-xs mt-0.5 truncate">{email ?? (uid ? `id: ${shortId(uid)}` : '—')}</p>
            </div>

            <div>
              <label className="text-white/35 text-[11px] font-semibold uppercase tracking-wider block mb-1.5">
                Display name
              </label>
              <div className="flex gap-2">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Your name"
                  className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 outline-none focus:border-violet-500/40"
                />
                <button
                  type="button"
                  onClick={() => void saveName()}
                  disabled={busy || !uid}
                  className="px-3 py-2.5 rounded-xl bg-violet-500/25 border border-violet-500/30 text-violet-200 hover:bg-violet-500/30 transition-colors text-xs font-semibold disabled:opacity-50 flex items-center gap-2"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
              </div>
              <p className="mt-1 text-white/25 text-[11px]">Saved to `profiles.full_name`.</p>
            </div>

            <div>
              <label className="text-white/35 text-[11px] font-semibold uppercase tracking-wider block mb-1.5">
                Update password
              </label>
              <div className="flex gap-2">
                <input
                  value={pwDraft}
                  onChange={(e) => setPwDraft(e.target.value)}
                  type="password"
                  placeholder="New password (min 8 chars)"
                  className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 outline-none focus:border-violet-500/40"
                />
                <button
                  type="button"
                  onClick={() => void savePassword()}
                  disabled={busy || pwDraft.trim().length < 8}
                  className="px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors text-xs font-semibold disabled:opacity-50 flex items-center gap-2"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  Update
                </button>
              </div>
            </div>

            {status ? (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[11px] text-white/55 flex items-center gap-2">
                {status === 'Saved name' || status === 'Updated password' ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : null}
                <span className="truncate">{status}</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void doSignOut()}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200/90 hover:bg-red-500/15 transition-colors text-xs font-semibold disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

