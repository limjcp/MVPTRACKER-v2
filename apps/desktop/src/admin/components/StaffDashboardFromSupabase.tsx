import { useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Activity, ArrowUpRight, Clock, Coffee, Cpu, FileText, Globe, ListChecks, MessageSquare, MoreHorizontal, Music2, Palette, Settings, Target, TrendingDown, TrendingUp, Wrench, Clapperboard, BookOpen, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../utils/cn';

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
type CurrentStatusRow = {
  user_id: string;
  tracking_status: 'active' | 'idle' | 'away';
  current_app: string | null;
  current_project: string | null;
  current_task_label: string | null;
  last_sync_at: string | null;
};

type AppCategory =
  | 'browser'
  | 'office'
  | 'tools'
  | 'graphics'
  | 'ide'
  | 'editor'
  | 'productivity'
  | 'communication'
  | 'media'
  | 'video'
  | 'reading'
  | 'system'
  | 'other';

const CATEGORY_ICONS: Record<AppCategory, any> = {
  browser: Globe,
  office: FileText,
  tools: Wrench,
  graphics: Palette,
  ide: Cpu,
  editor: Cpu,
  productivity: ListChecks,
  communication: MessageSquare,
  media: Music2,
  video: Clapperboard,
  reading: BookOpen,
  system: Settings,
  other: MoreHorizontal,
};

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function dayKey(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

export default function StaffDashboardFromSupabase({
  userId,
  displayName,
}: {
  userId: string;
  displayName?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [apps, setApps] = useState<AppDailyRow[]>([]);
  const [projects, setProjects] = useState<ProjectDailyRow[]>([]);
  const [status, setStatus] = useState<CurrentStatusRow | null>(null);

  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(subDays(now, 1));

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setError('Supabase not configured.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const startDay = dayKey(subDays(now, 29));
        const [dRes, aRes, pRes, sRes] = await Promise.all([
          client
            .from('user_daily_stats')
            .select('user_id, day, total_seconds, productive_seconds, unproductive_seconds, idle_seconds, productivity_score')
            .eq('user_id', userId)
            .gte('day', startDay)
            .lte('day', today),
          client
            .from('user_app_daily')
            .select('user_id, day, app_name, seconds')
            .eq('user_id', userId)
            .gte('day', startDay)
            .lte('day', today),
          client
            .from('user_project_daily')
            .select('user_id, day, project_name, seconds')
            .eq('user_id', userId)
            .gte('day', startDay)
            .lte('day', today),
          client
            .from('user_current_status')
            .select('user_id, tracking_status, current_app, current_project, current_task_label, last_sync_at')
            .eq('user_id', userId)
            .maybeSingle(),
        ]);
        if (dRes.error) throw dRes.error;
        if (aRes.error) throw aRes.error;
        if (pRes.error) throw pRes.error;
        if (sRes.error) throw sRes.error;
        if (cancelled) return;
        setDaily((dRes.data ?? []) as any);
        setApps((aRes.data ?? []) as any);
        setProjects((pRes.data ?? []) as any);
        setStatus((sRes.data ?? null) as any);
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const todayRow = daily.find((r) => r.day === today);
  const yesterdayRow = daily.find((r) => r.day === yesterday);

  const totalChange =
    yesterdayRow && (yesterdayRow.total_seconds ?? 0) > 0
      ? ((todayRow?.total_seconds ?? 0) - (yesterdayRow.total_seconds ?? 0)) / (yesterdayRow.total_seconds ?? 1) * 100
      : 0;

  const weeklyData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = subDays(now, 6 - i);
      const k = dayKey(d);
      const row = daily.find((x) => x.day === k);
      return {
        day: format(d, 'EEE'),
        total: row ? Math.round((row.total_seconds / 3600) * 10) / 10 : 0,
        productive: row ? Math.round((row.productive_seconds / 3600) * 10) / 10 : 0,
        score: row?.productivity_score ?? 0,
      };
    });
  }, [daily]);

  const topApps = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of apps) {
      if (r.day !== today) continue;
      m.set(r.app_name || 'Unknown', (m.get(r.app_name || 'Unknown') ?? 0) + Number(r.seconds ?? 0));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [apps, today]);

  const topProjects = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of projects) {
      if (r.day !== today) continue;
      m.set(r.project_name || 'Unknown', (m.get(r.project_name || 'Unknown') ?? 0) + Number(r.seconds ?? 0));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [projects, today]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-[#111318] p-5 text-white/40 text-sm">
        Loading selected staff dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/25 bg-red-500/5 p-5">
        <p className="text-red-300 font-semibold">Selected staff dashboard error</p>
        <p className="mt-2 text-red-200/70 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#111318] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white/70 text-sm font-semibold truncate">
            Staff dashboard{displayName ? ` · ${displayName}` : ''}
          </p>
          <p className="text-white/30 text-xs mt-0.5 truncate">
            Supabase aggregates · user_id {userId.slice(0, 8)}…
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/35">
          <span className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1">
            <ArrowUpRight className="w-3.5 h-3.5 text-white/35" />
            {status?.tracking_status ?? '—'}
          </span>
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-5">
          <StatCard
            label="Today's Total"
            value={formatDuration(todayRow?.total_seconds ?? 0)}
            subValue={`${totalChange > 0 ? '+' : ''}${totalChange.toFixed(0)}% vs yesterday`}
            trend={totalChange > 0 ? 'up' : 'down'}
            icon={Clock}
            color="blue"
          />
          <StatCard
            label="Productive Time"
            value={formatDuration(todayRow?.productive_seconds ?? 0)}
            subValue={`${todayRow?.productivity_score ?? 0}% productivity`}
            trend="up"
            icon={Zap}
            color="emerald"
          />
          <StatCard
            label="Idle / AFK"
            value={formatDuration(todayRow?.idle_seconds ?? 0)}
            subValue="Based on staff client idle threshold"
            trend="neutral"
            icon={Coffee}
            color="slate"
          />
          <StatCard
            label="Projects Active"
            value={String(topProjects.length)}
            subValue="Today (from aggregates)"
            trend="neutral"
            icon={Target}
            color="purple"
          />
          <StatCard
            label="Current app"
            value={status?.current_app ?? '—'}
            subValue={status?.current_task_label ?? '—'}
            trend="neutral"
            icon={Activity}
            color="amber"
          />
        </div>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-8 bg-[#0D0F14] rounded-2xl p-5 border border-white/[0.05]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-white font-semibold text-[15px]">Weekly Overview</h3>
                <p className="text-white/40 text-xs mt-0.5">Tracked vs. Productive Hours (7d)</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={weeklyData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="totalGradAdmin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="prodGradAdmin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: '#ffffff40', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#ffffff40', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: '#0D0F14',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                  formatter={(val) => [`${val}h`, '']}
                />
                <Area type="monotone" dataKey="total" stroke="#8B5CF640" strokeWidth={2} fill="url(#totalGradAdmin)" />
                <Area type="monotone" dataKey="productive" stroke="#8B5CF6" strokeWidth={2} fill="url(#prodGradAdmin)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="col-span-4 bg-[#0D0F14] rounded-2xl p-5 border border-white/[0.05]">
            <h3 className="text-white font-semibold text-[15px] mb-1">Top Apps Today</h3>
            <p className="text-white/40 text-xs mb-4">From `user_app_daily`</p>
            <div className="space-y-3">
              {topApps.length === 0 ? (
                <p className="text-white/25 text-xs">No app data today.</p>
              ) : (
                topApps.map(([app, sec]) => {
                  const Icon = CATEGORY_ICONS.other || Activity;
                  const pct = (todayRow?.total_seconds ?? 0) > 0 ? (sec / (todayRow?.total_seconds ?? 1)) * 100 : 0;
                  return (
                    <div key={app} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/[0.06]">
                          <Icon className="w-3.5 h-3.5 text-white/55" />
                        </div>
                        <span className="text-white/70 text-xs flex-1 truncate">{app}</span>
                        <span className="text-white/40 text-xs">{formatDuration(sec)}</span>
                      </div>
                      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden ml-8">
                        <div
                          className="h-full rounded-full transition-all duration-700 bg-violet-500/70"
                          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4 mt-4">
          <div className="col-span-12 bg-[#0D0F14] rounded-2xl p-5 border border-white/[0.05]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-[15px]">Projects Today</h3>
              <span className="text-white/30 text-xs">From `user_project_daily`</span>
            </div>
            {topProjects.length === 0 ? (
              <p className="text-white/20 text-xs text-center py-4">No project time logged today</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {topProjects.map(([name, sec]) => (
                  <div key={name} className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2.5">
                    <p className="text-white/70 text-xs truncate">{name}</p>
                    <p className={cn('text-white/45 text-[11px] mt-0.5 font-mono tabular-nums')}>
                      {formatDuration(sec)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subValue,
  trend,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  subValue: string;
  trend: 'up' | 'down' | 'neutral';
  icon: any;
  color: string;
}) {
  const colorMap: Record<string, { bg: string; icon: string }> = {
    blue: { bg: 'bg-blue-500/10', icon: 'text-blue-400' },
    emerald: { bg: 'bg-emerald-500/10', icon: 'text-emerald-400' },
    purple: { bg: 'bg-purple-500/10', icon: 'text-purple-400' },
    amber: { bg: 'bg-amber-500/10', icon: 'text-amber-400' },
    slate: { bg: 'bg-slate-500/10', icon: 'text-slate-400' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className="bg-[#0D0F14] rounded-2xl p-5 border border-white/[0.05] hover:border-white/[0.08] transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', c.bg)}>
          <Icon className={cn('w-4 h-4', c.icon)} />
        </div>
        {trend === 'up' ? (
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
        ) : trend === 'down' ? (
          <TrendingDown className="w-3.5 h-3.5 text-red-400" />
        ) : null}
      </div>
      <div className="text-white text-2xl font-bold mb-1 truncate">{value}</div>
      <div className="text-white/30 text-[11px]">{label}</div>
      <div className="text-white/40 text-[10px] mt-1 truncate">{subValue}</div>
    </div>
  );
}

