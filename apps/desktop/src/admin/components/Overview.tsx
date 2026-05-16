import { useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNowStrict, subDays } from 'date-fns';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RefreshCw, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../utils/cn';
import StaffDashboardFromSupabase from './StaffDashboardFromSupabase';

type RangeKey = 'today' | '7d' | '30d' | 'all';

type RoleRow = { user_id: string; role: 'admin' | 'staff' };
type ProfileRow = { user_id: string; full_name: string | null; avatar_url: string | null };
type PresenceRow = { user_id: string; last_heartbeat_at: string; last_active_at: string | null };
type DailyRow = {
  user_id: string;
  day: string;
  total_seconds: number;
  productive_seconds: number;
  unproductive_seconds: number;
  idle_seconds: number;
  productivity_score: number;
};
type AppDailyRow = { user_id: string; day: string; app_name: string; seconds: number };
type ProjectDailyRow = { user_id: string; day: string; project_name: string; seconds: number };
type TaskBlockDailyRow = {
  user_id: string;
  day: string;
  label: string;
  seconds: number;
};
type CurrentStatusRow = {
  user_id: string;
  tracking_status: 'active' | 'idle' | 'away';
  current_app: string | null;
  current_project: string | null;
  current_task_label: string | null;
  last_sync_at: string | null;
};

function secondsToHours(sec: number) {
  return Math.round((Math.max(0, sec) / 3600) * 100) / 100;
}

function formatHrMinFromSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}hr${h === 1 ? '' : 's'}`);
  parts.push(`${m}min${m === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/** Local calendar day — matches staff sync (`computeDailyStats`, `localDayKey`) and Postgres date strings. */
function rangeToStartDay(r: RangeKey, now: Date): string | null {
  if (r === 'today') return format(now, 'yyyy-MM-dd');
  if (r === '7d') return format(subDays(now, 6), 'yyyy-MM-dd');
  if (r === '30d') return format(subDays(now, 29), 'yyyy-MM-dd');
  return null;
}

function rangeTotalsStatLabel(r: RangeKey): string {
  if (r === 'today') return 'Today';
  if (r === '7d') return 'Last 7 days';
  if (r === '30d') return 'Last 30 days';
  return 'All time';
}

function isOnline(lastHeartbeatIso: string, windowMinutes = 2): boolean {
  const t = new Date(lastHeartbeatIso).getTime();
  return Date.now() - t <= windowMinutes * 60_000;
}

function safeNum(n: any): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

/** Compare rollups using YYYY-MM-DD only (Supabase may return `date` as ISO with `T…`). */
function dayKeyFromRow(day: string): string {
  return String(day || '').split('T')[0] ?? '';
}

/** Stable map key for UUIDs from Postgres/JSON (case may vary). */
function uidKey(userId: string): string {
  return String(userId || '').toLowerCase();
}

export default function Overview() {
  const [range, setRange] = useState<RangeKey>('today');
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staffDashboardUserId, setStaffDashboardUserId] = useState<string | null>(null);

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [presence, setPresence] = useState<PresenceRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [apps, setApps] = useState<AppDailyRow[]>([]);
  const [projectsDaily, setProjectsDaily] = useState<ProjectDailyRow[]>([]);
  const [taskBlocksDaily, setTaskBlocksDaily] = useState<TaskBlockDailyRow[]>([]);
  const [currentStatus, setCurrentStatus] = useState<CurrentStatusRow[]>([]);

  const { today, startDay } = useMemo(() => {
    const now = new Date();
    return {
      today: format(now, 'yyyy-MM-dd'),
      startDay: rangeToStartDay(range, now),
    };
  }, [range, refreshKey]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setError('Supabase not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const { data: sessionData } = await client.auth.getSession();
        if (!sessionData.session) throw new Error('Not signed in');

        const [{ data: roleRows, error: roleErr }, { data: presenceRows, error: presErr }] = await Promise.all([
          client.from('user_roles').select('user_id, role'),
          client.from('user_presence').select('user_id, last_heartbeat_at, last_active_at'),
        ]);
        if (roleErr) throw roleErr;
        if (presErr) throw presErr;
        if (cancelled) return;

        const userIds = (roleRows ?? []).map((r: any) => String(r.user_id));
        setRoles((roleRows ?? []) as any);
        setPresence((presenceRows ?? []) as any);

        if (userIds.length > 0) {
          const { data: profRows } = await client
            .from('profiles')
            .select('user_id, full_name, avatar_url')
            .in('user_id', userIds);
          if (!cancelled) setProfiles((profRows ?? []) as any);
        } else {
          setProfiles([]);
        }

        // Stats + top apps for selected range
        const dailyQ = client.from('user_daily_stats').select('*');
        const appsQ = client.from('user_app_daily').select('*');
        const projQ = client.from('user_project_daily').select('*');
        const taskBlocksQ = client.from('user_task_block_daily').select('user_id, day, label, seconds');
        if (startDay) {
          dailyQ.gte('day', startDay).lte('day', today);
          appsQ.gte('day', startDay).lte('day', today);
          projQ.gte('day', startDay).lte('day', today);
          taskBlocksQ.gte('day', startDay).lte('day', today);
        }

        const [
          { data: dailyRows, error: dailyErr },
          { data: appRows, error: appErr },
          { data: projRows, error: projErr },
          { data: taskBlockRows, error: taskBlockErr },
          { data: statusRows, error: statusErr },
        ] = await Promise.all([
          dailyQ,
          appsQ,
          projQ,
          taskBlocksQ,
          client.from('user_current_status').select('user_id, tracking_status, current_app, current_project, current_task_label, last_sync_at'),
        ]);

        if (dailyErr) throw dailyErr;
        if (appErr) throw appErr;
        if (projErr) throw projErr;
        if (taskBlockErr) throw taskBlockErr;
        if (statusErr) throw statusErr;
        if (cancelled) return;

        setDaily((dailyRows ?? []) as any);
        setApps((appRows ?? []) as any);
        setProjectsDaily((projRows ?? []) as any);
        setTaskBlocksDaily((taskBlockRows ?? []) as any);
        setCurrentStatus((statusRows ?? []) as any);
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [range, startDay, today, refreshKey]);

  const profilesById = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);
  const presenceById = useMemo(() => new Map(presence.map((p) => [p.user_id, p])), [presence]);
  const statusById = useMemo(() => new Map(currentStatus.map((s) => [s.user_id, s])), [currentStatus]);

  const dayInSelectedRange = useMemo(() => {
    return (day: string) => {
      if (startDay == null) return true;
      const k = dayKeyFromRow(day);
      return k >= startDay && k <= today;
    };
  }, [startDay, today]);

  /**
   * Prefer `user_daily_stats` for the three headline metrics. If those rows are missing or all zero
   * (legacy data, failed sync slice, etc.) fall back to project rollups — treat **Browsing** as idle —
   * then to summed task-block seconds so the cards match Top blocks / Projects.
   */
  const staffSummaryTotalsByUser = useMemo(() => {
    type Totals = { total_seconds: number; productive_seconds: number; idle_seconds: number };
    const z = (): Totals => ({ total_seconds: 0, productive_seconds: 0, idle_seconds: 0 });

    const fromDaily = new Map<string, Totals>();
    for (const r of daily) {
      if (!dayInSelectedRange(r.day)) continue;
      const uid = uidKey(r.user_id);
      const cur = fromDaily.get(uid) ?? z();
      cur.total_seconds += safeNum(r.total_seconds);
      cur.productive_seconds += safeNum(r.productive_seconds);
      cur.idle_seconds += safeNum(r.idle_seconds);
      fromDaily.set(uid, cur);
    }

    const projTotalByUser = new Map<string, number>();
    const browsingByUser = new Map<string, number>();
    for (const r of projectsDaily) {
      if (!dayInSelectedRange(r.day)) continue;
      const uid = uidKey(r.user_id);
      const sec = safeNum(r.seconds);
      projTotalByUser.set(uid, (projTotalByUser.get(uid) ?? 0) + sec);
      if (String(r.project_name || '').trim().toLowerCase() === 'browsing') {
        browsingByUser.set(uid, (browsingByUser.get(uid) ?? 0) + sec);
      }
    }

    const blockSumByUser = new Map<string, number>();
    for (const r of taskBlocksDaily) {
      if (!dayInSelectedRange(r.day)) continue;
      const uid = uidKey(r.user_id);
      blockSumByUser.set(uid, (blockSumByUser.get(uid) ?? 0) + safeNum(r.seconds));
    }

    const allUids = new Set<string>([...fromDaily.keys(), ...projTotalByUser.keys(), ...blockSumByUser.keys()]);
    const out = new Map<string, Totals>();
    for (const uid of allUids) {
      const cur = fromDaily.get(uid) ?? z();
      const hasDaily =
        cur.total_seconds > 0 || cur.productive_seconds > 0 || cur.idle_seconds > 0;
      if (hasDaily) {
        out.set(uid, cur);
        continue;
      }
      const pt = projTotalByUser.get(uid) ?? 0;
      const br = browsingByUser.get(uid) ?? 0;
      if (pt > 0) {
        out.set(uid, {
          total_seconds: pt,
          productive_seconds: Math.max(0, pt - br),
          idle_seconds: br,
        });
        continue;
      }
      const bs = blockSumByUser.get(uid) ?? 0;
      if (bs > 0) {
        out.set(uid, {
          total_seconds: bs,
          productive_seconds: bs,
          idle_seconds: 0,
        });
        continue;
      }
      out.set(uid, cur);
    }
    return out;
  }, [daily, projectsDaily, taskBlocksDaily, dayInSelectedRange]);

  const topBlocksByUser = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of taskBlocksDaily) {
      if (!dayInSelectedRange(r.day)) continue;
      const uid = uidKey(r.user_id);
      const inner = m.get(uid) ?? new Map<string, number>();
      const k = r.label || 'Untagged task block';
      inner.set(k, (inner.get(k) ?? 0) + safeNum(r.seconds));
      m.set(uid, inner);
    }
    const out = new Map<string, Array<{ label: string; seconds: number }>>();
    for (const [uid, inner] of m) {
      const items = [...inner.entries()]
        .map(([label, seconds]) => ({ label, seconds }))
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 5);
      out.set(uid, items);
    }
    return out;
  }, [taskBlocksDaily, dayInSelectedRange]);

  const topProjectsByUser = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of projectsDaily) {
      if (!dayInSelectedRange(r.day)) continue;
      const uid = uidKey(r.user_id);
      const inner = m.get(uid) ?? new Map<string, number>();
      const k = r.project_name || 'Unknown';
      inner.set(k, (inner.get(k) ?? 0) + safeNum(r.seconds));
      m.set(uid, inner);
    }
    const out = new Map<string, Array<{ name: string; seconds: number }>>();
    for (const [uid, inner] of m) {
      const items = [...inner.entries()]
        .map(([name, seconds]) => ({ name, seconds }))
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 5);
      out.set(uid, items);
    }
    return out;
  }, [projectsDaily, dayInSelectedRange]);

  const overallSeries = useMemo(() => {
    const byDay = new Map<string, { day: string; hours: number }>();
    for (const r of daily) {
      const cur = byDay.get(r.day) ?? { day: r.day, hours: 0 };
      cur.hours += secondsToHours(safeNum(r.total_seconds) || safeNum((r as any).totalTime));
      byDay.set(r.day, cur);
    }
    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [daily]);

  const topAppsOverall = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of apps) {
      totals.set(r.app_name, (totals.get(r.app_name) ?? 0) + safeNum(r.seconds));
    }
    const items = [...totals.entries()]
      .map(([app, seconds]) => ({ app, hours: secondsToHours(seconds) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);
    return items;
  }, [apps]);

  const staffUsers = useMemo(() => roles.filter((r) => r.role === 'staff'), [roles]);
  const selectedProfile = useMemo(() => {
    if (!staffDashboardUserId) return undefined;
    return profilesById.get(staffDashboardUserId);
  }, [profilesById, staffDashboardUserId]);

  const closeModal = () => setStaffDashboardUserId(null);

  useEffect(() => {
    if (!staffDashboardUserId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [staffDashboardUserId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/50 text-sm">
        Loading analytics…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-2xl rounded-2xl border border-red-500/25 bg-red-500/5 p-5">
          <p className="text-red-300 font-semibold">Admin overview error</p>
          <p className="mt-2 text-red-200/70 text-sm">{error}</p>
          <p className="mt-3 text-white/35 text-xs">
            Make sure your Supabase schema is applied and you’re signed in with an admin user.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-white text-xl font-semibold">Overview</h2>
          <p className="text-white/35 text-xs mt-1">
            Staff analytics from Supabase · {range === 'today' ? 'Today' : range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : 'All time'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/[0.08] hover:text-white/80"
            title="Reload data from Supabase"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <div className="flex gap-1.5 rounded-2xl bg-white/[0.04] border border-white/[0.06] p-1">
            {([
              ['today', 'Today'],
              ['7d', '7D'],
              ['30d', '30D'],
              ['all', 'All'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setRange(k)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors',
                  range === k ? 'bg-violet-500/25 text-violet-200' : 'text-white/40 hover:text-white/70'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-5">
        <div className="rounded-2xl border border-white/[0.06] bg-[#111318] p-4">
          <p className="text-white/55 text-xs font-semibold uppercase tracking-wider">Total hours (all staff)</p>
          <div className="h-56 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overallSeries} margin={{ left: 6, right: 12, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="mvptimeHours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="rgba(139,92,246,0.55)" stopOpacity={1} />
                    <stop offset="95%" stopColor="rgba(139,92,246,0.06)" stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#0D0F14', border: '1px solid rgba(255,255,255,0.08)' }} />
                <Area type="monotone" dataKey="hours" stroke="rgba(139,92,246,0.9)" fill="url(#mvptimeHours)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-[#111318] p-4">
          <p className="text-white/55 text-xs font-semibold uppercase tracking-wider">Top apps (all staff)</p>
          <div className="h-56 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topAppsOverall} margin={{ left: 6, right: 12, top: 10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="app" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={52} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#0D0F14', border: '1px solid rgba(255,255,255,0.08)' }} />
                <Legend />
                <Bar dataKey="hours" name="Hours" fill="rgba(59,130,246,0.75)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/[0.06] bg-[#111318] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <p className="text-white/70 text-sm font-semibold">Staff</p>
          <p className="text-white/30 text-xs mt-0.5">
            Totals, top blocks, and projects use the selected range ({range === 'today' ? 'today' : range === 'all' ? 'all synced days' : `${range}`}). Presence and “last seen” are live.
          </p>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {staffUsers.length === 0 ? (
            <div className="p-5 text-white/40 text-sm">No staff users found in `user_roles`.</div>
          ) : (
            staffUsers.map((u) => {
              const p = profilesById.get(u.user_id);
              const pres = presenceById.get(u.user_id);
              const status = statusById.get(u.user_id);
              const online = pres?.last_heartbeat_at ? isOnline(pres.last_heartbeat_at) : false;
              const seen = pres?.last_heartbeat_at
                ? `${formatDistanceToNowStrict(new Date(pres.last_heartbeat_at))} ago`
                : 'never';
              const sid = uidKey(u.user_id);
              const d = staffSummaryTotalsByUser.get(sid);
              const totalFmt = formatHrMinFromSeconds(safeNum(d?.total_seconds ?? 0));
              const prodFmt = formatHrMinFromSeconds(safeNum(d?.productive_seconds ?? 0));
              const idleFmt = formatHrMinFromSeconds(safeNum(d?.idle_seconds ?? 0));

              const userTopBlocks = topBlocksByUser.get(sid) ?? [];

              const proj = topProjectsByUser.get(sid) ?? [];
              const taskLabel = status?.current_task_label ?? null;

              return (
                <div key={u.user_id} className="px-4 py-4">
                  <div className="flex flex-col gap-3 min-w-0">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={cn('mt-1 w-2.5 h-2.5 rounded-full shrink-0', online ? 'bg-emerald-400' : 'bg-white/20')} />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setStaffDashboardUserId(u.user_id)}
                          className="text-white/80 text-sm font-semibold truncate text-left hover:text-violet-200 transition-colors"
                          title="Open staff dashboard"
                        >
                          {p?.full_name?.trim() || `${u.user_id.slice(0, 8)}…`}
                        </button>
                        <p className="text-white/30 text-xs">
                          {online ? 'Online' : 'Offline'} · last seen {seen}
                        </p>
                        {taskLabel ? <p className="text-white/35 text-xs mt-1 truncate">Working on: {taskLabel}</p> : null}
                        {status?.current_project ? (
                          <p className="text-white/30 text-xs mt-0.5 truncate">Project: {status.current_project}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 min-w-0">
                      <Stat label={rangeTotalsStatLabel(range)} value={totalFmt} />
                      <Stat label="Productive" value={prodFmt} />
                      <Stat label="Idle/AFK" value={idleFmt} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 min-w-0">
                      <MiniList
                        title="Top blocks"
                        items={userTopBlocks.map((a) => ({
                          left: a.label,
                          right: formatHrMinFromSeconds(safeNum(a.seconds)),
                        }))}
                        empty="No block data in range"
                      />
                      <MiniList
                        title="Projects"
                        items={proj.map((x) => ({ left: x.name, right: formatHrMinFromSeconds(x.seconds) }))}
                        empty="No project time yet"
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {staffDashboardUserId ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={closeModal}
            aria-label="Close staff dashboard"
          />
          <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.10] bg-[#0D0F14] shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white/85 text-sm font-semibold truncate">
                  Staff dashboard{selectedProfile?.full_name?.trim() ? ` · ${selectedProfile.full_name.trim()}` : ''}
                </p>
                <p className="text-white/30 text-xs mt-0.5 truncate">
                  Click outside or press Esc to close
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-white/60 hover:text-white/85 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <StaffDashboardFromSupabase
                userId={staffDashboardUserId}
                displayName={selectedProfile?.full_name?.trim() || undefined}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
      <p className="text-white/25 text-[10px] font-semibold uppercase tracking-wider">{label}</p>
      <p className="text-white/80 text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function MiniList({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ left: string; right: string }>;
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
      <p className="text-white/25 text-[10px] font-semibold uppercase tracking-wider">{title}</p>
      {items.length === 0 ? (
        <p className="text-white/30 text-xs mt-1">{empty}</p>
      ) : (
        <div className="mt-1 space-y-1">
          {items.map((it) => (
            <div key={`${title}:${it.left}`} className="flex items-center justify-between gap-2">
              <span className="text-white/60 text-xs truncate">{it.left}</span>
              <span className="text-white/30 text-xs font-mono tabular-nums">{it.right}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

