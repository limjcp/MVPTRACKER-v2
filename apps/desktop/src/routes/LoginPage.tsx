import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { cn } from '../utils/cn';
import { supabase } from '../lib/supabase';
import AppIntro from './splash/AppIntro';

const INTRO_SESSION_KEY = 'mvptracker_intro_launched';
const LS_REMEMBER = 'mvptracker_remember_email';
const LS_EMAIL = 'mvptracker_saved_email';

type Portal = 'staff' | 'admin';

function readIntroSkipped(): boolean {
  try {
    return sessionStorage.getItem(INTRO_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'intro' | 'login'>(() => (readIntroSkipped() ? 'login' : 'intro'));

  const [email, setEmail] = useState(() => {
    try {
      if (localStorage.getItem(LS_REMEMBER) === '1') {
        return localStorage.getItem(LS_EMAIL) ?? '';
      }
    } catch {
      /* ignore */
    }
    return '';
  });
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return localStorage.getItem(LS_REMEMBER) === '1';
    } catch {
      return false;
    }
  });

  const [statusText, setStatusText] = useState<string>('Signed out');
  const [initializing, setInitializing] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [techFooter, setTechFooter] = useState('Powered by Rust // Tauri v2');

  const canOpenAdmin = !!userId;

  useEffect(() => {
    void import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((v) => setTechFooter(`Powered by Rust // Tauri ${v}`))
      .catch(() => {
        /* browser dev: keep default label */
      });
  }, []);

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
      setInitializing(true);
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
        if (mounted) setInitializing(false);
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

  const handleLaunch = () => {
    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, '1');
    } catch {
      /* ignore */
    }
    setPhase('login');
  };

  const persistRemember = (nextRemember: boolean, nextEmail: string) => {
    try {
      if (nextRemember) {
        localStorage.setItem(LS_REMEMBER, '1');
        localStorage.setItem(LS_EMAIL, nextEmail);
      } else {
        localStorage.removeItem(LS_REMEMBER);
        localStorage.removeItem(LS_EMAIL);
      }
    } catch {
      /* ignore */
    }
  };

  if (!supabase) {
    return (
      <div className="relative flex min-h-dvh w-full flex-1 flex-col items-center justify-center overflow-hidden bg-[#0a0a0a] p-8 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(0,71,171,0.2),transparent_50%),radial-gradient(ellipse_at_80%_100%,rgba(0,0,128,0.18),transparent_45%)]"
        />
        <div className="relative z-10 w-full max-w-md rounded-2xl border border-amber-500/25 bg-white/[0.06] p-6 shadow-[0_0_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <h1 className="font-sans text-lg font-semibold text-amber-100">Supabase not configured</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/65">
            Add <code className="font-tech rounded bg-black/30 px-1.5 py-0.5 text-xs text-sky-300">VITE_SUPABASE_URL</code> and{' '}
            <code className="font-tech rounded bg-black/30 px-1.5 py-0.5 text-xs text-sky-300">VITE_SUPABASE_ANON_KEY</code> to the
            project root <code className="font-tech text-white/45 text-xs">.env</code> file, then restart the app.
          </p>
          <p className="font-tech mt-3 text-xs text-white/40">See .env.example for variable names.</p>
        </div>
      </div>
    );
  }

  const sb = supabase;

  const loginShell = (
    <div className="relative flex min-h-dvh w-full flex-1 flex-col overflow-hidden bg-[#0a0a0a] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 min-h-dvh bg-[radial-gradient(ellipse_at_15%_10%,rgba(0,71,171,0.22),transparent_42%),radial-gradient(ellipse_at_85%_90%,rgba(0,0,128,0.2),transparent_40%)]"
      />
      <div className="relative z-10 flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="w-full max-w-md sm:max-w-lg rounded-2xl border border-white/12 bg-white/[0.07] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-2xl sm:p-8">
          <div className="mb-8 text-center">
            <h1 className="font-sans text-xl font-semibold tracking-tight text-white">MVP Condos</h1>
            <p className="font-tech mt-2 text-xs text-sky-200/45">MVPTracker · sign in to continue</p>
          </div>

          <p className="font-tech mb-6 min-h-[2.5rem] text-[11px] leading-relaxed text-white/40">
            {statusText}
            {initializing ? ' · loading…' : ''}
          </p>

          {!userId ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setAuthBusy(true);
                setStatusText('Authenticating…');
                persistRemember(rememberMe, email);
                sb.auth
                  .signInWithPassword({ email, password })
                  .then(({ error }) => {
                    if (error) throw error;
                  })
                  .catch((err: unknown) => {
                    setStatusText(`Sign-in error: ${String((err as Error)?.message || err)}`);
                  })
                  .finally(() => setAuthBusy(false));
              }}
              className="space-y-5"
            >
              <div>
                <label htmlFor="login-email" className="font-tech mb-2 block text-[10px] font-medium uppercase tracking-[0.2em] text-white/45">
                  Email
                </label>
                <input
                  id="login-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  className="font-sans w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none ring-sky-500/0 transition-[border-color,box-shadow,background-color] placeholder:text-white/25 hover:border-white/18 focus:border-sky-400/45 focus:ring-2 focus:ring-sky-500/25"
                  placeholder="you@company.com"
                  required
                />
              </div>
              <div>
                <label htmlFor="login-password" className="font-tech mb-2 block text-[10px] font-medium uppercase tracking-[0.2em] text-white/45">
                  Password
                </label>
                <input
                  id="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  className="font-sans w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none ring-sky-500/0 transition-[border-color,box-shadow,background-color] placeholder:text-white/25 hover:border-white/18 focus:border-sky-400/45 focus:ring-2 focus:ring-sky-500/25"
                  placeholder="••••••••"
                  required
                />
              </div>

              <label className="flex cursor-pointer items-center gap-3 select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setRememberMe(v);
                    if (!v) persistRemember(false, '');
                  }}
                  className="size-4 rounded border-white/20 bg-black/30 text-sky-500 focus:ring-sky-500/40"
                />
                <span className="font-tech text-xs text-white/55">Remember me on this device</span>
              </label>

              <button
                type="submit"
                disabled={authBusy || initializing}
                className={cn(
                  'font-sans relative flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold tracking-wide transition-[background-color,box-shadow,opacity]',
                  authBusy || initializing
                    ? 'cursor-not-allowed bg-sky-600/45 text-white/80'
                    : 'bg-gradient-to-b from-sky-500 to-sky-600 text-white shadow-[0_0_32px_rgba(0,71,171,0.35)] hover:from-sky-400 hover:to-sky-500'
                )}
              >
                {authBusy ? (
                  <>
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                    <span>Continuing…</span>
                  </>
                ) : (
                  'Continue'
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <PortalButton portal="staff" enabled onClick={() => navigate('/staff')} />
              <PortalButton portal="admin" enabled={canOpenAdmin} onClick={() => navigate('/admin')} />
              <button
                type="button"
                onClick={() => {
                  void sb.auth.signOut();
                }}
                className="font-sans w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white/70 transition-colors hover:border-white/16 hover:bg-white/[0.09] hover:text-white"
              >
                Sign out
              </button>
            </div>
          )}
        </div>

        <p className="font-tech relative z-10 mt-8 text-center text-[10px] tracking-wider text-white/30">{techFooter}</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <AnimatePresence mode="wait">
        {phase === 'intro' ? (
          <motion.div
            key="intro"
            className="flex min-h-dvh w-full flex-1 flex-col"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, filter: 'blur(8px)' }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <AppIntro onLaunch={handleLaunch} />
          </motion.div>
        ) : (
          <motion.div
            key="login"
            className="flex min-h-dvh w-full flex-1 flex-col"
            initial={{ opacity: 0, filter: 'blur(10px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            {loginShell}
          </motion.div>
        )}
      </AnimatePresence>
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
        'w-full rounded-xl border px-4 py-3.5 text-left transition-[background-color,border-color,opacity]',
        enabled
          ? 'border-white/12 bg-white/[0.05] hover:border-sky-400/25 hover:bg-white/[0.08]'
          : 'cursor-not-allowed border-white/[0.06] bg-white/[0.02] opacity-45'
      )}
    >
      <div className="font-sans text-sm font-semibold capitalize text-white">{portal} portal</div>
      <div className="font-tech mt-1 text-[11px] text-white/38">
        {portal === 'staff' ? 'Time tracking app (current features)' : 'Admin controls'}
      </div>
    </button>
  );
}
