import { useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAdminSettingsStore } from '../store/useAdminSettingsStore';
import ReportsPanel from '../../staff/components/ReportsPanel';
import type { ActivityEntry, AppSettings, DailyStats, ManualEntry, Project, ProjectColor } from '../../staff/types';

type RoleRow = { user_id: string; role: 'admin' | 'staff' };
type BillableCurrency = 'USD' | 'CAD' | 'PHP';
type ProfileRow = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  hourly_rate: number | null;
  currency: BillableCurrency | null;
};

type DailyRow = {
  day: string;
  total_seconds: number;
  productive_seconds: number;
  unproductive_seconds: number;
  idle_seconds: number;
  productivity_score: number;
};
type ProjectDailyRow = { day: string; project_name: string; seconds: number };
type AppDailyRow = { day: string; app_name: string; seconds: number };
type TaskBlockDailyRow = { day: string; seconds: number };

function dayKeyFromRow(day: string): string {
  return String(day || '').split('T')[0] ?? '';
}

function safeNum(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function rollupProjectId(name: string): string {
  return `rollup:${encodeURIComponent(name)}`;
}

const PROJECT_COLOR_CYCLE: ProjectColor[] = [
  'purple',
  'blue',
  'green',
  'orange',
  'teal',
  'pink',
  'indigo',
  'cyan',
  'yellow',
  'red',
];
const ICON_CYCLE = ['📊', '📁', '🗂️', '📌', '⏱️', '📝', '🎯', '💼'];

function sumsByDay(rows: Array<{ day: string; seconds: unknown }>): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const d = dayKeyFromRow(r.day);
    m.set(d, (m.get(d) ?? 0) + safeNum(r.seconds));
  }
  return m;
}

function sumProjectMap(pmap: Map<string, number>): number {
  let s = 0;
  for (const v of pmap.values()) s += safeNum(v);
  return s;
}

/** Treat “Browsing” project seconds as idle-style time (matches Admin Overview fallback). */
function browsingSecondsFromMap(pmap: Map<string, number> | undefined): number {
  if (!pmap) return 0;
  let b = 0;
  for (const [name, sec] of pmap) {
    if (String(name).trim().toLowerCase() === 'browsing') b += safeNum(sec);
  }
  return b;
}

function dailyRowHasNonZeroTotals(dr: DailyRow | undefined): boolean {
  if (!dr) return false;
  return (
    safeNum(dr.total_seconds) > 0 ||
    safeNum(dr.productive_seconds) > 0 ||
    safeNum(dr.idle_seconds) > 0 ||
    safeNum(dr.unproductive_seconds) > 0
  );
}

/**
 * Build `DailyStats` for Reports. Prefer `user_daily_stats`; when missing or all-zero (legacy / failed sync),
 * infer day totals from project rollups (same rules as Overview), then apps, then task blocks.
 */
function buildFromRollups(
  dailyRows: DailyRow[],
  projectRows: ProjectDailyRow[],
  appRows: AppDailyRow[],
  taskBlockRows: TaskBlockDailyRow[]
): { dailyStats: DailyStats[]; projects: Project[] } {
  const appsByDay = sumsByDay(appRows);
  const blocksByDay = sumsByDay(taskBlockRows);

  const daySet = new Set<string>();
  for (const r of dailyRows) daySet.add(dayKeyFromRow(r.day));
  for (const r of projectRows) daySet.add(dayKeyFromRow(r.day));
  for (const r of appRows) daySet.add(dayKeyFromRow(r.day));
  for (const r of taskBlockRows) daySet.add(dayKeyFromRow(r.day));
  const sortedDays = [...daySet].sort();

  const projectByDay = new Map<string, Map<string, number>>();
  for (const r of projectRows) {
    const d = dayKeyFromRow(r.day);
    const name = String(r.project_name ?? '').trim() || 'Unnamed';
    if (!projectByDay.has(d)) projectByDay.set(d, new Map());
    const m = projectByDay.get(d)!;
    m.set(name, (m.get(name) ?? 0) + safeNum(r.seconds));
  }

  const uniqueNames = [...new Set(projectRows.map((r) => String(r.project_name ?? '').trim() || 'Unnamed'))].sort(
    (a, b) => a.localeCompare(b)
  );

  const projects: Project[] = uniqueNames.map((name, i) => ({
    id: rollupProjectId(name),
    name,
    color: PROJECT_COLOR_CYCLE[i % PROJECT_COLOR_CYCLE.length]!,
    icon: ICON_CYCLE[i % ICON_CYCLE.length]!,
    productivityScore: 75,
    totalTime: 0,
    createdAt: new Date().toISOString(),
    scope: 'private',
  }));

  const dailyByDay = new Map(dailyRows.map((r) => [dayKeyFromRow(r.day), r]));

  const dailyStats: DailyStats[] = sortedDays.map((d) => {
    const dr = dailyByDay.get(d);
    const pmap = projectByDay.get(d);
    const projectsRec: Record<string, number> = {};
    if (pmap) {
      for (const [pname, secs] of pmap) {
        projectsRec[rollupProjectId(pname)] = safeNum(secs);
      }
    }

    const projSum = sumProjectMap(pmap ?? new Map());
    const browseSec = browsingSecondsFromMap(pmap);
    const appSum = appsByDay.get(d) ?? 0;
    const blockSum = blocksByDay.get(d) ?? 0;

    let totalTime: number;
    let productiveTime: number;
    let unproductiveTime: number;
    let idleTime: number;
    let productivityScore: number;

    if (dailyRowHasNonZeroTotals(dr)) {
      totalTime = safeNum(dr!.total_seconds);
      productiveTime = safeNum(dr!.productive_seconds);
      unproductiveTime = safeNum(dr!.unproductive_seconds);
      idleTime = safeNum(dr!.idle_seconds);
      productivityScore = safeNum(dr!.productivity_score);
    } else if (projSum > 0) {
      totalTime = projSum;
      idleTime = browseSec;
      productiveTime = Math.max(0, projSum - browseSec);
      unproductiveTime = 0;
      productivityScore =
        projSum > 0 ? Math.min(100, Math.round((productiveTime / projSum) * 100)) : 0;
    } else if (appSum > 0) {
      totalTime = appSum;
      productiveTime = appSum;
      unproductiveTime = 0;
      idleTime = 0;
      productivityScore = 0;
    } else if (blockSum > 0) {
      totalTime = blockSum;
      productiveTime = blockSum;
      unproductiveTime = 0;
      idleTime = 0;
      productivityScore = 0;
    } else {
      totalTime = safeNum(dr?.total_seconds);
      productiveTime = safeNum(dr?.productive_seconds);
      unproductiveTime = safeNum(dr?.unproductive_seconds);
      idleTime = safeNum(dr?.idle_seconds);
      productivityScore = safeNum(dr?.productivity_score);
    }

    return {
      date: d,
      totalTime,
      productiveTime,
      unproductiveTime,
      idleTime,
      productivityScore,
      projects: projectsRec,
    };
  });

  return { dailyStats, projects };
}

const emptyActs: ActivityEntry[] = [];
const emptyManuals: ManualEntry[] = [];

export default function AdminReports() {
  const settings = useAdminSettingsStore((s) => s.settings);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersWarning, setUsersWarning] = useState<string | null>(null);
  const [staffUsers, setStaffUsers] = useState<Array<{ user_id: string; label: string }>>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataWarning, setDataWarning] = useState<string | null>(null);
  const [dailyStatsOldestFirst, setDailyStatsOldestFirst] = useState<DailyStats[]>([]);
  const [rollupProjects, setRollupProjects] = useState<Project[]>([]);
  const [billableRate, setBillableRate] = useState<number | null>(null);
  const [billableCurrency, setBillableCurrency] = useState<BillableCurrency | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setUsersError('Supabase not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
      setUsersLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      setUsersLoading(true);
      setUsersError(null);
      try {
        const { data: sessionData } = await client.auth.getSession();
        if (!sessionData.session) throw new Error('Not signed in');

        const { data: roleRows, error: roleErr } = await client.from('user_roles').select('user_id, role');
        if (roleErr) throw roleErr;
        const userIds = (roleRows ?? []).map((r: RoleRow) => String(r.user_id));

        let profiles: ProfileRow[] = [];
        if (userIds.length > 0) {
          const { data: profRows } = await client
            .from('profiles')
            .select('user_id, full_name, avatar_url, hourly_rate, currency')
            .in('user_id', userIds);
          profiles = (profRows ?? []) as ProfileRow[];
        }
        const profileById = new Map(profiles.map((p) => [p.user_id, p]));
        const list = ((roleRows ?? []) as RoleRow[]).map((r) => {
          const p = profileById.get(r.user_id);
          const label = `${p?.full_name?.trim() || r.user_id}${r.role ? ` · ${r.role}` : ''}`;
          return { user_id: r.user_id, label };
        });
        list.sort((a, b) => a.label.localeCompare(b.label));

        if (!cancelled) {
          setStaffUsers(list);
          setUsersWarning(
            list.length === 0
              ? 'No users found in user_roles. Users without role rows will not appear in this picker.'
              : null
          );
          setSelectedUserId((cur) => (cur && list.some((x) => x.user_id === cur) ? cur : ''));
        }
      } catch (e: unknown) {
        if (!cancelled) setUsersError(String((e as Error)?.message ?? e));
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client || !selectedUserId) {
      setDailyStatsOldestFirst([]);
      setRollupProjects([]);
      setBillableRate(null);
      setBillableCurrency(null);
      setDataLoading(false);
      setDataError(null);
      return;
    }

    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    const startDay = format(subDays(now, 29), 'yyyy-MM-dd');

    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    setDataWarning(null);

    void (async () => {
      try {
        const [dRes, pRes, aRes, tbRes, profRes] = await Promise.all([
          client
            .from('user_daily_stats')
            .select('day, total_seconds, productive_seconds, unproductive_seconds, idle_seconds, productivity_score')
            .eq('user_id', selectedUserId)
            .gte('day', startDay)
            .lte('day', today)
            .order('day', { ascending: true }),
          client
            .from('user_project_daily')
            .select('day, project_name, seconds')
            .eq('user_id', selectedUserId)
            .gte('day', startDay)
            .lte('day', today)
            .order('day', { ascending: true }),
          client
            .from('user_app_daily')
            .select('day, app_name, seconds')
            .eq('user_id', selectedUserId)
            .gte('day', startDay)
            .lte('day', today)
            .order('day', { ascending: true }),
          client
            .from('user_task_block_daily')
            .select('day, seconds')
            .eq('user_id', selectedUserId)
            .gte('day', startDay)
            .lte('day', today)
            .order('day', { ascending: true }),
          client
            .from('profiles')
            .select('hourly_rate, currency')
            .eq('user_id', selectedUserId)
            .maybeSingle(),
        ]);
        if (dRes.error) throw dRes.error;
        if (pRes.error) throw pRes.error;
        if (aRes.error) throw aRes.error;
        if (tbRes.error) {
          if (!cancelled) {
            setDataWarning(
              'Task-block rollups are temporarily unavailable. Totals still render from daily/project/app rollups.'
            );
          }
          console.warn('admin reports: user_task_block_daily query failed', tbRes.error);
        }
        if (profRes.error) throw profRes.error;
        if (cancelled) return;

        const mapped = buildFromRollups(
          (dRes.data ?? []) as DailyRow[],
          (pRes.data ?? []) as ProjectDailyRow[],
          (aRes.data ?? []) as AppDailyRow[],
          (tbRes.error ? [] : tbRes.data ?? []) as TaskBlockDailyRow[]
        );
        setDailyStatsOldestFirst(mapped.dailyStats);
        setRollupProjects(mapped.projects);
        const profileRate = Number((profRes.data as any)?.hourly_rate);
        setBillableRate(Number.isFinite(profileRate) ? profileRate : null);
        const c = String((profRes.data as any)?.currency ?? '').toUpperCase();
        setBillableCurrency(c === 'USD' || c === 'CAD' || c === 'PHP' ? (c as BillableCurrency) : null);
      } catch (e: unknown) {
        if (!cancelled) setDataError(String((e as Error)?.message ?? e));
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedUserId]);

  const subtitle = selectedUserId
    ? `Synced rollups from Supabase (last up to 30 days). Charts use the selected range below.`
    : 'Pick a team member to view rollup-based totals and exports.';

  const picker = useMemo(() => {
    if (usersLoading) {
      return <p className="text-white/40 text-xs">Loading users…</p>;
    }
    if (usersError) {
      return <p className="text-red-400/90 text-xs">{usersError}</p>;
    }
    return (
      <div className="flex flex-col gap-1 max-w-md">
        <label className="flex flex-col gap-1">
          <span className="text-white/40 text-[11px] uppercase tracking-wider">Report for user</span>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="rounded-xl border border-white/[0.08] bg-[#161920] text-white text-sm px-3 py-2 outline-none focus:border-violet-500/40"
          >
            <option value="">Choose a user…</option>
            {staffUsers.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        {usersWarning ? <p className="text-amber-300/80 text-[11px]">{usersWarning}</p> : null}
      </div>
    );
  }, [usersLoading, usersError, usersWarning, staffUsers, selectedUserId]);

  if (!supabase && !usersLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-[#0D0F14]">
        <p className="text-white/50 text-sm">{usersError ?? 'Supabase not configured.'}</p>
      </div>
    );
  }

  if (!selectedUserId) {
    return (
      <ReportsPanel
        dailyStatsOldestFirst={[]}
        projects={[]}
        activities={emptyActs}
        manualEntries={emptyManuals}
        settings={settings as AppSettings}
        subtitle={usersWarning ? `${subtitle} ${usersWarning}` : subtitle}
        headerExtra={picker}
      />
    );
  }

  if (dataLoading) {
    return (
      <div className="flex-1 overflow-y-auto bg-[#0D0F14] p-6">
        <div className="mb-6">{picker}</div>
        <p className="text-white/50 text-sm">Loading report data…</p>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-[#0D0F14]">
        <p className="text-red-400/90 text-sm mb-4">{dataError}</p>
        <div>{picker}</div>
      </div>
    );
  }

  const selectedLabel = staffUsers.find((u) => u.user_id === selectedUserId)?.label ?? selectedUserId;

  const saveBillable = async (next: { rate?: number | null; currency?: BillableCurrency | null }) => {
    if (!supabase || !selectedUserId) return;
    const nextRate = next.rate ?? billableRate;
    const nextCurrency = next.currency ?? billableCurrency;
    const payload: Record<string, any> = { user_id: selectedUserId };
    if (nextRate != null && Number.isFinite(nextRate)) payload.hourly_rate = nextRate;
    if (nextCurrency === 'USD' || nextCurrency === 'CAD' || nextCurrency === 'PHP') payload.currency = nextCurrency;
    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
    if (error) throw error;
  };

  return (
    <ReportsPanel
      dailyStatsOldestFirst={dailyStatsOldestFirst}
      projects={rollupProjects}
      activities={emptyActs}
      manualEntries={emptyManuals}
      settings={settings as AppSettings}
      subtitle={`${selectedLabel}. ${subtitle}${dataWarning ? ` ${dataWarning}` : ''}`}
      headerExtra={picker}
      billableRateOverride={billableRate}
      billableCurrencyOverride={billableCurrency}
      onBillableRateChange={async (nextRate) => {
        setBillableRate(nextRate);
        await saveBillable({ rate: nextRate });
      }}
      onBillableCurrencyChange={async (nextCurrency) => {
        setBillableCurrency(nextCurrency);
        await saveBillable({ currency: nextCurrency });
      }}
    />
  );
}
