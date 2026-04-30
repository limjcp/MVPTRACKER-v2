import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Zap,
  Target,
  Coffee,
  ChevronRight,
  Activity,
  Globe,
  Code2,
  MessageSquare,
  Palette,
  Calendar,
  CheckCircle2,
  Play,
  MoreHorizontal,
  ArrowUpRight,
  FileText,
  Wrench,
  Cpu,
  ListChecks,
  Music2,
  Clapperboard,
  BookOpen,
  Settings,
  Bug,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, subDays, parseISO } from 'date-fns';
import { useStore } from '../store/useStore';
import { cn, PROJECT_COLORS } from '../utils/cn';
import { formatDuration } from '../utils/format';
import { AppCategory, DailyStats } from '../types';
import { CATEGORY_HEX } from '../utils/appCategories';
import { unionAppSecondsForActivitiesOnDate } from '../utils/sidebarTotals';

const CATEGORY_ICONS: Record<AppCategory, React.ElementType> = {
  browser: Globe,
  office: FileText,
  tools: Wrench,
  graphics: Palette,
  ide: Cpu,
  editor: Code2,
  productivity: ListChecks,
  communication: MessageSquare,
  media: Music2,
  video: Clapperboard,
  reading: BookOpen,
  system: Settings,
  other: MoreHorizontal,
};

const CATEGORY_COLORS: Record<AppCategory, string> = CATEGORY_HEX;

export default function Dashboard() {
  const { dailyStats, projects, activities, calendarEvents, setView, recordCalendarEvent, settings, refreshDerivedTimeline } =
    useStore();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    refreshDerivedTimeline();
  }, [refreshDerivedTimeline]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
      refreshDerivedTimeline();
    }, 60000);
    return () => clearInterval(interval);
  }, [refreshDerivedTimeline]);

  const todayKey = format(now, 'yyyy-MM-dd');
  const emptyDay = (date: string): DailyStats => ({
    date,
    totalTime: 0,
    productiveTime: 0,
    unproductiveTime: 0,
    idleTime: 0,
    productivityScore: 0,
    projects: {},
  });
  const todayStats = dailyStats.find((s) => s.date === todayKey) ?? emptyDay(todayKey);
  const yesterdayKey = format(subDays(now, 1), 'yyyy-MM-dd');
  const yesterdayStats = dailyStats.find((s) => s.date === yesterdayKey);

  const todayActivities = activities.filter(
    (a) => format(parseISO(a.startTime), 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd')
  );

  // Weekly chart data
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(now, 6 - i);
    const stat = dailyStats.find((s) => s.date === format(date, 'yyyy-MM-dd'));
    return {
      day: format(date, 'EEE'),
      total: stat ? Math.round(stat.totalTime / 3600 * 10) / 10 : 0,
      productive: stat ? Math.round(stat.productiveTime / 3600 * 10) / 10 : 0,
      score: stat?.productivityScore || 0,
    };
  });

  // Top apps today
  const appTotals = unionAppSecondsForActivitiesOnDate(todayActivities, todayKey);
  const topApps = Object.entries(appTotals)
    .sort((a, b) => b[1].duration - a[1].duration)
    .slice(0, 5);

  // Unrecorded calendar events
  const unrecordedEvents = calendarEvents.filter((e) => !e.recorded);

  // Project totals today
  const projectTotals: Record<string, number> = {};
  todayActivities.forEach((a) => {
    if (a.projectId) {
      projectTotals[a.projectId] = (projectTotals[a.projectId] || 0) + a.duration;
    }
  });
  const topProjects = Object.entries(projectTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id, dur]) => ({ project: projects.find((p) => p.id === id), duration: dur }))
    .filter((x) => x.project);

  const totalChange =
    yesterdayStats && yesterdayStats.totalTime > 0
      ? ((todayStats.totalTime || 0) - yesterdayStats.totalTime) / yesterdayStats.totalTime * 100
      : 0;

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0F14] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-white text-2xl font-semibold">{format(now, 'EEEE, MMMM d')}</h2>
          <p className="text-white/40 text-sm mt-0.5">
            {format(now, 'h:mm a')} · {todayActivities.length} activities tracked today
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-xs font-medium">Auto-tracking</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <StatCard
          label="Today's Total"
          value={formatDuration(todayStats?.totalTime || 0)}
          subValue={`Union of overlaps · ${totalChange > 0 ? '+' : ''}${totalChange.toFixed(0)}% vs yesterday`}
          trend={totalChange > 0 ? 'up' : 'down'}
          icon={Clock}
          color="blue"
        />
        <StatCard
          label="Productive Time"
          value={formatDuration(todayStats?.productiveTime || 0)}
          subValue={`${todayStats?.productivityScore || 0}% productivity`}
          trend="up"
          icon={Zap}
          color="emerald"
        />
        <StatCard
          label="Idle / AFK"
          value={formatDuration(todayStats?.idleTime || 0)}
          subValue={`Gaps ≥ ${settings.idleThreshold} min between tracked apps`}
          trend="neutral"
          icon={Coffee}
          color="slate"
        />
        <StatCard
          label="Projects Active"
          value={String(topProjects.length)}
          subValue={`${projects.length} total projects`}
          trend="neutral"
          icon={Target}
          color="purple"
        />
        <StatCard
          label="Billable Hours"
          value={formatDuration(todayActivities.filter((a) => a.projectId).reduce((s, a) => s + a.duration, 0))}
          subValue={`$${(todayActivities.filter((a) => a.projectId).reduce((s, a) => s + a.duration, 0) / 3600 * 0).toFixed(0)} est.`}
          trend="up"
          icon={TrendingUp}
          color="amber"
        />
      </div>

      {todayStats.overlapDiagnostics && (
        <details className="group mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 text-left">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-amber-200/90 text-xs font-medium select-none [&::-webkit-details-marker]:hidden">
            <Bug className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Debug: overlap & raw vs union (today)</span>
            <span className="ml-auto text-amber-200/50 font-normal tabular-nums">
              raw {formatDuration(todayStats.overlapDiagnostics.sumRawClippedSeconds)} → union{' '}
              {formatDuration(todayStats.overlapDiagnostics.unionTotalSeconds)}
            </span>
          </summary>
          <div className="mt-3 space-y-3 text-[11px] text-white/50 border-t border-amber-500/10 pt-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-white/30 uppercase tracking-wider text-[9px] mb-0.5">Raw sum (clipped)</p>
                <p className="text-white/80 font-mono tabular-nums">
                  {formatDuration(todayStats.overlapDiagnostics.sumRawClippedSeconds)}
                </p>
              </div>
              <div>
                <p className="text-white/30 uppercase tracking-wider text-[9px] mb-0.5">Union total</p>
                <p className="text-white/80 font-mono tabular-nums">
                  {formatDuration(todayStats.overlapDiagnostics.unionTotalSeconds)}
                </p>
              </div>
              <div>
                <p className="text-white/30 uppercase tracking-wider text-[9px] mb-0.5">Double-counted</p>
                <p
                  className={cn(
                    'font-mono tabular-nums',
                    todayStats.overlapDiagnostics.doubleCountedSeconds > 0 ? 'text-amber-400' : 'text-white/40'
                  )}
                >
                  {formatDuration(todayStats.overlapDiagnostics.doubleCountedSeconds)}
                </p>
              </div>
              <div>
                <p className="text-white/30 uppercase tracking-wider text-[9px] mb-0.5">Overlapping pairs</p>
                <p className="text-white/80 font-mono tabular-nums">{todayStats.overlapDiagnostics.pairs.length}</p>
              </div>
            </div>
            <p className="text-white/35 leading-relaxed">
              Totals use a merged timeline so overlapping automatic + manual (or duplicate rows) are not summed twice.
              Productivity uses the same timeline: if any overlapping slice is a distraction, that second counts as
              unproductive.
            </p>
            {todayStats.overlapDiagnostics.pairs.length > 0 ? (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-white/[0.06] bg-[#0D0F14]/80">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-white/30 text-[10px] uppercase tracking-wider border-b border-white/[0.06]">
                      <th className="px-2 py-1.5 font-medium">Overlap</th>
                      <th className="px-2 py-1.5 font-medium">A</th>
                      <th className="px-2 py-1.5 font-medium">B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayStats.overlapDiagnostics.pairs.map((row, idx) => (
                      <tr key={`${row.aId}-${row.bId}-${idx}`} className="border-b border-white/[0.04] last:border-0">
                        <td className="px-2 py-1.5 text-amber-400/90 font-mono tabular-nums whitespace-nowrap">
                          {formatDuration(row.overlapSec)}
                        </td>
                        <td className="px-2 py-1.5 text-white/60 truncate max-w-[140px]" title={row.aLabel}>
                          {row.aLabel}
                        </td>
                        <td className="px-2 py-1.5 text-white/60 truncate max-w-[140px]" title={row.bLabel}>
                          {row.bLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-white/25 text-center py-2">No overlapping intervals for today (after clip to local day).</p>
            )}
          </div>
        </details>
      )}

      <div className="grid grid-cols-12 gap-4 mb-4">
        {/* Weekly Overview Chart */}
        <div className="col-span-8 bg-[#161920] rounded-2xl p-5 border border-white/[0.05]">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-white font-semibold text-[15px]">Weekly Overview</h3>
              <p className="text-white/40 text-xs mt-0.5">Tracked vs. Productive Hours</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-white/40">
                <span className="w-2.5 h-2.5 rounded-full bg-violet-500/40 inline-block" />Total
              </span>
              <span className="flex items-center gap-1.5 text-white/40">
                <span className="w-2.5 h-2.5 rounded-full bg-violet-500 inline-block" />Productive
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={weeklyData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="prodGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: '#ffffff40', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#ffffff40', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1E2029', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                formatter={(val) => [`${val}h`, '']}
              />
              <Area type="monotone" dataKey="total" stroke="#8B5CF640" strokeWidth={2} fill="url(#totalGrad)" />
              <Area type="monotone" dataKey="productive" stroke="#8B5CF6" strokeWidth={2} fill="url(#prodGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Productivity Score */}
        <div className="col-span-4 bg-[#161920] rounded-2xl p-5 border border-white/[0.05]">
          <h3 className="text-white font-semibold text-[15px] mb-1">Productivity</h3>
          <p className="text-white/40 text-xs mb-4">Today's score</p>
          <div className="flex items-center justify-center py-2">
            <div className="relative w-36 h-36">
              <svg className="w-36 h-36 -rotate-90" viewBox="0 0 144 144">
                <circle cx="72" cy="72" r="60" fill="none" stroke="#ffffff08" strokeWidth="12" />
                <circle
                  cx="72" cy="72" r="60" fill="none"
                  stroke="url(#scoreGrad)" strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 60}`}
                  strokeDashoffset={`${2 * Math.PI * 60 * (1 - (todayStats?.productivityScore || 0) / 100)}`}
                  className="transition-all duration-700"
                />
                <defs>
                  <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#8B5CF6" />
                    <stop offset="100%" stopColor="#3B82F6" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-white">{todayStats?.productivityScore || 0}</span>
                <span className="text-white/40 text-xs">/ 100</span>
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/40">7-day avg</span>
              <span className="text-white/60 font-medium">
                {Math.round(dailyStats.slice(0, 7).reduce((s, d) => s + d.productivityScore, 0) / 7)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/40">Best day</span>
              <span className="text-emerald-400 font-medium">
                {Math.max(...dailyStats.slice(0, 7).map((d) => d.productivityScore))}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* App Breakdown */}
        <div className="col-span-4 bg-[#161920] rounded-2xl p-5 border border-white/[0.05]">
          <h3 className="text-white font-semibold text-[15px] mb-4">Top Apps Today</h3>
          <div className="space-y-3">
            {topApps.map(([appName, { duration, category }]) => {
              const Icon = CATEGORY_ICONS[category] || Activity;
              const color = CATEGORY_COLORS[category] || '#6B7280';
              const pct = todayStats ? (duration / todayStats.totalTime) * 100 : 0;
              return (
                <div key={appName} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}20` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color }} />
                    </div>
                    <span className="text-white/70 text-xs flex-1 truncate">{appName}</span>
                    <span className="text-white/40 text-xs">{formatDuration(duration)}</span>
                  </div>
                  <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden ml-8">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Project Breakdown */}
        <div className="col-span-4 bg-[#161920] rounded-2xl p-5 border border-white/[0.05]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold text-[15px]">Projects Today</h3>
            <button onClick={() => setView('projects')} className="text-violet-400 text-xs hover:text-violet-300 flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {topProjects.map(({ project, duration }) => {
              if (!project) return null;
              const colors = PROJECT_COLORS[project.color];
              const pct = todayStats ? (duration / todayStats.totalTime) * 100 : 0;
              return (
                <div key={project.id} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{project.icon}</span>
                    <span className="text-white/70 text-xs flex-1 truncate">{project.name}</span>
                    <span className="text-white/40 text-xs">{formatDuration(duration)}</span>
                  </div>
                  <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden ml-6">
                    <div
                      className={cn('h-full rounded-full transition-all duration-700', colors.bg)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {topProjects.length === 0 && (
              <p className="text-white/20 text-xs text-center py-4">No project time logged today</p>
            )}
          </div>
        </div>

        {/* Calendar Events */}
        <div className="col-span-4 bg-[#161920] rounded-2xl p-5 border border-white/[0.05]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-semibold text-[15px]">Calendar Events</h3>
              {unrecordedEvents.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-400 text-[10px] font-semibold">
                  {unrecordedEvents.length} unlogged
                </span>
              )}
            </div>
            <Calendar className="w-4 h-4 text-white/20" />
          </div>
          <div className="space-y-2">
            {calendarEvents.slice(0, 4).map((event) => (
              <div
                key={event.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all',
                  event.recorded
                    ? 'bg-white/[0.02] border-white/[0.04] opacity-60'
                    : 'bg-white/[0.04] border-white/[0.06] hover:border-violet-500/30 cursor-pointer'
                )}
                onClick={() => !event.recorded && recordCalendarEvent(event.id, 'proj-1')}
              >
                <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: event.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-white/70 text-xs truncate">{event.title}</p>
                  <p className="text-white/30 text-[10px]">
                    {format(parseISO(event.startTime), 'h:mm a')} – {format(parseISO(event.endTime), 'h:mm a')}
                  </p>
                </div>
                {event.recorded ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="mt-4 bg-[#161920] rounded-2xl p-5 border border-white/[0.05]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-[15px]">Recent Activity</h3>
          <button onClick={() => setView('timeline')} className="text-violet-400 text-xs hover:text-violet-300 flex items-center gap-1">
            Open Timeline <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {todayActivities.slice(0, 6).map((activity) => {
            const project = projects.find((p) => p.id === activity.projectId);
            const Icon = CATEGORY_ICONS[activity.category] || Activity;
            const color = CATEGORY_COLORS[activity.category] || '#6B7280';
            return (
              <div key={activity.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.05] transition-colors cursor-pointer">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}20` }}>
                  <Icon className="w-3.5 h-3.5" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/70 text-xs font-medium truncate">{activity.appName}</p>
                  <p className="text-white/30 text-[10px] truncate">{activity.windowTitle}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-white/50 text-[10px]">{formatDuration(activity.duration)}</p>
                  {project && (
                    <p className={cn('text-[10px]', PROJECT_COLORS[project.color]?.text)}>{project.icon}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  subValue: string;
  trend: 'up' | 'down' | 'neutral';
  icon: React.ElementType;
  color: string;
}

function StatCard({ label, value, subValue, trend, icon: Icon, color }: StatCardProps) {
  const colorMap: Record<string, { bg: string; icon: string; trend: string }> = {
    blue: { bg: 'bg-blue-500/10', icon: 'text-blue-400', trend: 'text-blue-400' },
    emerald: { bg: 'bg-emerald-500/10', icon: 'text-emerald-400', trend: 'text-emerald-400' },
    purple: { bg: 'bg-purple-500/10', icon: 'text-purple-400', trend: 'text-purple-400' },
    amber: { bg: 'bg-amber-500/10', icon: 'text-amber-400', trend: 'text-amber-400' },
    slate: { bg: 'bg-slate-500/10', icon: 'text-slate-400', trend: 'text-slate-400' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className="bg-[#161920] rounded-2xl p-5 border border-white/[0.05] hover:border-white/[0.08] transition-colors">
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
      <div className="text-white text-2xl font-bold mb-1">{value}</div>
      <div className="text-white/30 text-[11px]">{label}</div>
      <div className="text-white/40 text-[10px] mt-1">{subValue}</div>
    </div>
  );
}

