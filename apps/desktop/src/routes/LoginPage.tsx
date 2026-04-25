import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../utils/cn';
import { supabase } from '../lib/supabase';

type Portal = 'staff' | 'admin';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [statusText, setStatusText] = useState<string>('Signed out');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const canOpenAdmin = !!userId;

  const fetchRole = async (uid: string) => {
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
  };

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        const session = data.session;
        if (!session) {
          if (!mounted) return;
          setUserId(null);
          setStatusText('Signed out');
          return;
        }

        const uid = session.user.id;
        if (!mounted) return;
        setUserId(uid);
        setStatusText('Signed in · fetching role…');

        const r = await fetchRole(uid);
        if (!mounted) return;
        setStatusText(r ? `Signed in · role=${r}` : 'Signed in · role=unknown');
      } catch (e: unknown) {
        if (!mounted) return;
        setUserId(null);
        setStatusText(`Auth error: ${String((e as Error)?.message || e)}`);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) {
        setUserId(null);
        setStatusText('Signed out');
        return;
      }
      const uid = session.user.id;
      setUserId(uid);
      setStatusText('Signed in · fetching role…');
      void fetchRole(uid)
        .then((r) => {
          if (!mounted) return;
          setStatusText(r ? `Signed in · role=${r}` : 'Signed in · role=unknown');
        })
        .catch((e: unknown) => {
          if (!mounted) return;
          setStatusText(`Role fetch error: ${String((e as Error)?.message || e)}`);
        });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!supabase) {
    return (
      <div className="min-h-screen bg-[#0D0F14] text-white flex items-center justify-center p-8">
        <div className="w-full max-w-md bg-[#161920] border border-amber-500/20 rounded-2xl p-6 space-y-3">
          <h1 className="text-lg font-semibold text-amber-200">Supabase not configured</h1>
          <p className="text-white/60 text-sm leading-relaxed">
            Add <code className="text-violet-300 text-xs">VITE_SUPABASE_URL</code> and{' '}
            <code className="text-violet-300 text-xs">VITE_SUPABASE_ANON_KEY</code> to the project root{' '}
            <code className="text-white/40 text-xs">.env</code> file, then restart the app.
          </p>
          <p className="text-white/35 text-xs">See <code className="text-white/50">.env.example</code> for variable names.</p>
        </div>
      </div>
    );
  }

  const sb = supabase;

  return (
    <div className="min-h-screen bg-[#0D0F14] text-white flex items-center justify-center p-8">
      <div className="w-full max-w-md bg-[#161920] border border-white/[0.06] rounded-2xl p-6">
        <div className="mb-6">
          <h1 className="text-lg font-semibold">MVPTracker</h1>
          <p className="text-white/30 text-xs mt-1">Sign in and open a portal in this window</p>
        </div>

        <div className="text-white/30 text-xs mb-4">{statusText}{loading ? ' (loading…)' : ''}</div>

        {!userId ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setLoading(true);
              setStatusText('Signing in…');
              sb.auth
                .signInWithPassword({ email, password })
                .then(({ error }) => {
                  if (error) throw error;
                })
                .catch((err: unknown) => {
                  setStatusText(`Sign-in error: ${String((err as Error)?.message || err)}`);
                })
                .finally(() => setLoading(false));
            }}
            className="space-y-3"
          >
            <div>
              <label className="block text-white/40 text-[11px] uppercase tracking-wider mb-1.5">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
                placeholder="you@company.com"
                required
              />
            </div>
            <div>
              <label className="block text-white/40 text-[11px] uppercase tracking-wider mb-1.5">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-colors',
                loading ? 'bg-violet-600/60 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500'
              )}
            >
              Sign in
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <PortalButton
              portal="staff"
              enabled
              onClick={() => navigate('/staff')}
            />
            <PortalButton
              portal="admin"
              enabled={canOpenAdmin}
              onClick={() => navigate('/admin')}
            />
            <button
              type="button"
              onClick={() => {
                void sb.auth.signOut();
              }}
              className="w-full px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/70 text-sm font-medium transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PortalButton({ portal, enabled, onClick }: { portal: Portal; enabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      className={cn(
        'w-full px-4 py-3 rounded-xl border text-left transition-colors',
        enabled
          ? 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12]'
          : 'bg-white/[0.02] border-white/[0.06] opacity-50 cursor-not-allowed'
      )}
    >
      <div className="text-sm font-semibold capitalize">{portal} portal</div>
      <div className="text-xs text-white/30 mt-0.5">
        {portal === 'staff' ? 'Time tracking app (current features)' : 'Admin controls'}
      </div>
    </button>
  );
}
