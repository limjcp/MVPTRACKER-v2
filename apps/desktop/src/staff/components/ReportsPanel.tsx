import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileText,
  Table,
  Code,
  BarChart2,
  Printer,
  ExternalLink,
  Filter,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { format, parseISO, subDays } from 'date-fns';
import type { ActivityEntry, AppSettings, DailyStats, ManualEntry, Project } from '../types';
import { cn, PROJECT_COLORS } from '../utils/cn';
import { formatDuration } from '../utils/format';
import {
  buildTimesheetPrintHtml,
  exportReportCsv,
  exportReportHtml,
  exportReportPdf,
  exportReportXlsx,
  getReportWindow,
  printHtmlInHiddenFrame,
  type ReportFormat,
} from '../utils/reportExport';

export type ReportPanelRange = 'today' | '7d' | '14d' | '30d';

export interface ReportsPanelProps {
  dailyStatsOldestFirst: DailyStats[];
  projects: Project[];
  activities: ActivityEntry[];
  manualEntries: ManualEntry[];
  settings: AppSettings;
  /** Replaces default subtext under “Reports”; defaults to staff copy. */
  subtitle?: string;
  /** Eg. admin user picker, rendered beside the title block area (wraps flex). */
  headerExtra?: React.ReactNode;
  billableRateOverride?: number | null;
  billableCurrencyOverride?: 'USD' | 'CAD' | 'PHP' | null;
  onBillableRateChange?: (nextRate: number) => Promise<void> | void;
  onBillableCurrencyChange?: (nextCurrency: 'USD' | 'CAD' | 'PHP') => Promise<void> | void;
}

const DEFAULT_SUBTITLE = 'Detailed timesheets and productivity analysis';

function dayKeyFromStatsDate(statsDate: string): string {
  return String(statsDate || '').split('T')[0] ?? '';
}

export default function ReportsPanel({
  dailyStatsOldestFirst,
  projects,
  activities,
  manualEntries,
  settings,
  subtitle = DEFAULT_SUBTITLE,
  headerExtra,
  billableRateOverride,
  billableCurrencyOverride,
  onBillableRateChange,
  onBillableCurrencyChange,
}: ReportsPanelProps) {
  const [rangeMode, setRangeMode] = useState<'preset' | 'custom'>('preset');
  const [range, setRange] = useState<ReportPanelRange>('7d');
  const [exporting, setExporting] = useState<ReportFormat | null>(null);

  const [filterOpen, setFilterOpen] = useState(false);
  const filterWrapRef = useRef<HTMLDivElement>(null);

  const [customFrom, setCustomFrom] = useState(() => format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [draftFrom, setDraftFrom] = useState(customFrom);
  const [draftTo, setDraftTo] = useState(customTo);
  const [billableEditOpen, setBillableEditOpen] = useState(false);
  const [billableSaving, setBillableSaving] = useState(false);
  const [billableRateDraft, setBillableRateDraft] = useState('');
  const [billableCurrencyDraft, setBillableCurrencyDraft] = useState<'USD' | 'CAD' | 'PHP'>('USD');

  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterWrapRef.current && !filterWrapRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [filterOpen]);

  /** `dailyStatsOldestFirst` is oldest-first; presets slice from the end when history is contiguous. */
  const periodDays = range === 'today' ? 1 : range === '7d' ? 7 : range === '14d' ? 14 : 30;

  const filteredStats = useMemo(() => {
    if (rangeMode === 'preset') {
      return dailyStatsOldestFirst.slice(-periodDays);
    }
    const fromK = customFrom <= customTo ? customFrom : customTo;
    const toK = customFrom <= customTo ? customTo : customFrom;
    return dailyStatsOldestFirst.filter((s) => {
      const k = dayKeyFromStatsDate(s.date);
      return k >= fromK && k <= toK;
    });
  }, [rangeMode, range, periodDays, dailyStatsOldestFirst, customFrom, customTo]);

  const rangeSummarySub = useMemo(() => {
    if (rangeMode === 'custom') {
      const a = customFrom <= customTo ? customFrom : customTo;
      const b = customFrom <= customTo ? customTo : customFrom;
      try {
        return `${format(parseISO(a), 'MMM d')} – ${format(parseISO(b), 'MMM d, yyyy')}`;
      } catch {
        return `${a} → ${b}`;
      }
    }
    if (range === 'today') return 'Today';
    return `${periodDays}-day period ending today`;
  }, [rangeMode, range, periodDays, customFrom, customTo]);

  const openFilterPanel = () => {
    setFilterOpen((wasOpen) => {
      if (!wasOpen) {
        if (rangeMode === 'custom') {
          setDraftFrom(customFrom);
          setDraftTo(customTo);
        } else {
          const to = format(new Date(), 'yyyy-MM-dd');
          const back =
            range === 'today' ? 0 : range === '7d' ? 6 : range === '14d' ? 13 : 29;
          setDraftFrom(format(subDays(new Date(), back), 'yyyy-MM-dd'));
          setDraftTo(to);
        }
      }
      return !wasOpen;
    });
  };

  const applyCustomRange = () => {
    let a = draftFrom.trim();
    let b = draftTo.trim();
    if (!a || !b) {
      window.alert('Choose both a start and end date.');
      return;
    }
    if (a > b) {
      const t = a;
      a = b;
      b = t;
    }
    setCustomFrom(a);
    setCustomTo(b);
    setRangeMode('custom');
    setFilterOpen(false);
  };

  const chartData = filteredStats.map((s) => ({
    date: format(parseISO(s.date), 'MMM d'),
    total: parseFloat((s.totalTime / 3600).toFixed(2)),
    productive: parseFloat((s.productiveTime / 3600).toFixed(2)),
    score: s.productivityScore,
    ...Object.fromEntries(
      projects.map((p) => [p.name.split(' ')[0], parseFloat(((s.projects[p.id] || 0) / 3600).toFixed(2))])
    ),
  }));

  const totalTime = filteredStats.reduce((s, d) => s + d.totalTime, 0);
  const totalProductive = filteredStats.reduce((s, d) => s + d.productiveTime, 0);
  const avgScore =
    filteredStats.length > 0
      ? Math.round(filteredStats.reduce((s, d) => s + d.productivityScore, 0) / filteredStats.length)
      : 0;

  const projectTotals: Record<string, number> = {};
  filteredStats.forEach((s) => {
    Object.entries(s.projects).forEach(([pid, dur]) => {
      projectTotals[pid] = (projectTotals[pid] || 0) + dur;
    });
  });
  const sortedProjects = Object.entries(projectTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([id, dur]) => ({ project: projects.find((p) => p.id === id), duration: dur }))
    .filter((x) => x.project);

  const defaultRate = billableRateOverride ?? settings.defaultHourlyRate ?? 150;
  const currency = billableCurrencyOverride ?? ((settings.currency as any) ?? 'USD');
  const billableEstimate = (totalTime / 3600) * defaultRate;
  const billableEditable = Boolean(onBillableRateChange || onBillableCurrencyChange);

  useEffect(() => {
    setBillableRateDraft(String(Number.isFinite(defaultRate) ? defaultRate : settings.defaultHourlyRate ?? 150));
    const c = String(currency ?? 'USD').toUpperCase();
    setBillableCurrencyDraft(c === 'CAD' || c === 'PHP' ? c : 'USD');
  }, [defaultRate, currency, settings.defaultHourlyRate]);

  const handleExport = async (fmt: ReportFormat) => {
    const win = getReportWindow(filteredStats);
    if (!win) {
      window.alert('No data in the selected range.');
      return;
    }
    setExporting(fmt);
    try {
      switch (fmt) {
        case 'csv':
          await exportReportCsv(filteredStats, activities, manualEntries, projects, win);
          break;
        case 'html':
          await exportReportHtml(filteredStats, activities, manualEntries, projects, settings, win, {
            billableRateOverride: defaultRate,
            billableCurrencyOverride: billableCurrencyDraft,
          });
          break;
        case 'xlsx':
          await exportReportXlsx(filteredStats, activities, manualEntries, projects, win);
          break;
        case 'pdf':
          await exportReportPdf(filteredStats, activities, manualEntries, projects, settings, win, {
            billableRateOverride: defaultRate,
            billableCurrencyOverride: billableCurrencyDraft,
          });
          break;
        default:
          break;
      }
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Save cancelled')) return;
      window.alert('Export failed. Check the console for details.');
    } finally {
      setExporting(null);
    }
  };

  const handlePrintTimesheet = () => {
    const win = getReportWindow(filteredStats);
    if (!win) {
      window.alert('No data in the selected range.');
      return;
    }
    const html = buildTimesheetPrintHtml(
      filteredStats,
      activities,
      manualEntries,
      projects,
      settings,
      win,
      {
        billableRateOverride: defaultRate,
        billableCurrencyOverride: billableCurrencyDraft,
      }
    );
    printHtmlInHiddenFrame(html);
  };

  const saveBillableEdits = async () => {
    const n = Number(billableRateDraft);
    if (!Number.isFinite(n) || n < 0) {
      window.alert('Rate must be a valid number (0 or greater).');
      return;
    }
    setBillableSaving(true);
    try {
      if (onBillableRateChange) await onBillableRateChange(n);
      if (onBillableCurrencyChange) await onBillableCurrencyChange(billableCurrencyDraft);
      setBillableEditOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(`Failed to save billable settings: ${msg}`);
    } finally {
      setBillableSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0F14] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div className="min-w-[200px]">
          <h2 className="text-white text-2xl font-semibold">Reports</h2>
          <p className="text-white/40 text-sm mt-0.5">{subtitle}</p>
          {headerExtra ? <div className="mt-3">{headerExtra}</div> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-[#161920] border border-white/[0.06] rounded-xl p-1 flex-wrap">
            {(['today', '7d', '14d', '30d'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRangeMode('preset');
                  setRange(r);
                }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  rangeMode === 'preset' && range === r
                    ? 'bg-violet-500/20 text-violet-300'
                    : 'text-white/40 hover:text-white/70'
                )}
              >
                {r === 'today'
                  ? 'Today'
                  : r === '7d'
                    ? 'Last 7 days'
                    : r === '14d'
                      ? 'Last 14 days'
                      : 'Last 30 days'}
              </button>
            ))}
          </div>
          <div className="relative" ref={filterWrapRef}>
            <button
              type="button"
              onClick={openFilterPanel}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl bg-[#161920] border text-sm transition-colors',
                filterOpen || rangeMode === 'custom'
                  ? 'border-violet-500/35 text-violet-200'
                  : 'border-white/[0.06] text-white/60 hover:text-white hover:border-white/[0.1]'
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
            </button>
            {filterOpen ? (
              <div
                className="absolute right-0 top-full mt-2 w-[min(calc(100vw-3rem),288px)] rounded-xl border border-white/[0.08] bg-[#1a1d26] shadow-xl shadow-black/40 p-4 z-50"
                role="dialog"
                aria-label="Custom date range"
              >
                <p className="text-white/45 text-[11px] font-semibold uppercase tracking-wider mb-3">Date range</p>
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-white/40 text-xs mb-1 block">From</span>
                    <input
                      type="date"
                      value={draftFrom}
                      onChange={(e) => setDraftFrom(e.target.value)}
                      className="w-full rounded-lg border border-white/[0.08] bg-[#0D0F14] text-white text-sm px-2 py-2 outline-none focus:border-violet-500/35 [color-scheme:dark]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-white/40 text-xs mb-1 block">To</span>
                    <input
                      type="date"
                      value={draftTo}
                      onChange={(e) => setDraftTo(e.target.value)}
                      className="w-full rounded-lg border border-white/[0.08] bg-[#0D0F14] text-white text-sm px-2 py-2 outline-none focus:border-violet-500/35 [color-scheme:dark]"
                    />
                  </label>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyCustomRange}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/20 text-violet-200 border border-violet-500/25 hover:bg-violet-500/30 transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Total Tracked',
            value: formatDuration(totalTime),
            sub: rangeSummarySub,
            color: 'violet',
          },
          {
            label: 'Productive Time',
            value: formatDuration(totalProductive),
            sub: `${totalTime > 0 ? Math.round((totalProductive / totalTime) * 100) : 0}% of total`,
            color: 'emerald',
          },
          { label: 'Avg Productivity', value: `${avgScore}%`, sub: 'Daily average score', color: 'blue' },
        ].map((card) => (
          <div key={card.label} className="bg-[#161920] rounded-2xl p-5 border border-white/[0.05]">
            <p className="text-white/30 text-xs mb-2">{card.label}</p>
            <p className="text-white text-2xl font-bold mb-1">{card.value}</p>
            <p className="text-white/30 text-[11px]">{card.sub}</p>
          </div>
        ))}
        <div className="bg-[#161920] rounded-2xl p-5 border border-white/[0.05]">
          <p className="text-white/30 text-xs mb-2">Billable Estimate</p>
          <p className="text-white text-2xl font-bold mb-1">{currency} {billableEstimate.toFixed(0)}</p>
          <p className="text-white/30 text-[11px]">At {currency} {defaultRate}/hr</p>
          {billableEditable ? (
            <div className="mt-3">
              {!billableEditOpen ? (
                <button
                  type="button"
                  onClick={() => setBillableEditOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/60 hover:text-white text-[11px] transition-colors"
                >
                  Edit rate & currency
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={billableRateDraft}
                      onChange={(e) => setBillableRateDraft(e.target.value)}
                      className="w-24 rounded-lg border border-white/[0.08] bg-[#0D0F14] text-white text-xs px-2 py-1.5 outline-none focus:border-violet-500/35"
                    />
                    <select
                      value={billableCurrencyDraft}
                      onChange={(e) => setBillableCurrencyDraft(e.target.value as 'USD' | 'CAD' | 'PHP')}
                      className="rounded-lg border border-white/[0.08] bg-[#0D0F14] text-white text-xs px-2 py-1.5 outline-none focus:border-violet-500/35"
                    >
                      <option value="USD">USD</option>
                      <option value="CAD">CAD</option>
                      <option value="PHP">PHP</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void saveBillableEdits()}
                      disabled={billableSaving}
                      className="px-2.5 py-1 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-200 text-[11px] hover:bg-violet-500/30 disabled:opacity-50"
                    >
                      {billableSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBillableEditOpen(false);
                        setBillableRateDraft(String(defaultRate));
                        const c = String(currency ?? 'USD').toUpperCase();
                        setBillableCurrencyDraft(c === 'CAD' || c === 'PHP' ? c : 'USD');
                      }}
                      disabled={billableSaving}
                      className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/60 text-[11px] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 mb-4">
        <div className="col-span-8 bg-[#161920] rounded-2xl p-5 border border-white/[0.05]">
          <h3 className="text-white font-semibold text-[15px] mb-1">Daily Hours</h3>
          <p className="text-white/30 text-xs mb-5">Total vs. productive hours per day</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barGap={2}>
              <XAxis dataKey="date" tick={{ fill: '#ffffff40', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#ffffff40', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: '#1E2029',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="total" name="Total" fill="#8B5CF620" radius={[4, 4, 0, 0]} />
              <Bar dataKey="productive" name="Productive" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="col-span-4 bg-[#161920] rounded-2xl p-5 border border-white/[0.05]">
          <h3 className="text-white font-semibold text-[15px] mb-1">Score Trend</h3>
          <p className="text-white/30 text-xs mb-5">Productivity score over time</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fill: '#ffffff40', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#ffffff40', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: '#1E2029',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
              <Line type="monotone" dataKey="score" name="Score" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 mb-4">
        <div className="col-span-5 bg-[#161920] rounded-2xl p-5 border border-white/[0.05]">
          <h3 className="text-white font-semibold text-[15px] mb-4">Project Breakdown</h3>
          <div className="space-y-4">
            {sortedProjects.slice(0, 6).map(({ project, duration }) => {
              if (!project) return null;
              const colors = PROJECT_COLORS[project.color];
              const pct = totalTime > 0 ? (duration / totalTime) * 100 : 0;
              const billable = project.hourlyRate ? (duration / 3600) * project.hourlyRate : null;
              return (
                <div key={project.id}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm">{project.icon}</span>
                    <span className="text-white/70 text-xs flex-1">{project.name}</span>
                    <span className="text-white/50 text-xs font-mono">{formatDuration(duration)}</span>
                    {billable !== null && (
                      <span className="text-white/30 text-[10px]">${billable.toFixed(0)}</span>
                    )}
                  </div>
                  <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-700', colors.bg)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="col-span-7 bg-[#161920] rounded-2xl border border-white/[0.05] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <h3 className="text-white font-semibold text-[15px]">Daily Timesheet</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintTimesheet}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/50 text-xs transition-colors hover:text-white/70"
              >
                <Printer className="w-3 h-3" />
                Print
              </button>
            </div>
          </div>
          <div className="overflow-y-auto max-h-64">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  {['Date', 'Total', 'Productive', 'Score'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-2.5 text-white/30 text-[10px] font-medium uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStats.slice().reverse().map((stat) => (
                  <tr key={stat.date} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-2.5 text-white/60 text-xs">{format(parseISO(stat.date), 'EEE, MMM d')}</td>
                    <td className="px-5 py-2.5 text-white/70 text-xs font-mono">{formatDuration(stat.totalTime)}</td>
                    <td className="px-5 py-2.5 text-white/70 text-xs font-mono">{formatDuration(stat.productiveTime)}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${stat.productivityScore}%` }}
                          />
                        </div>
                        <span className="text-white/50 text-xs">{stat.productivityScore}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-[#161920] rounded-2xl p-5 border border-white/[0.05]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold text-[15px]">Export Report</h3>
            <p className="text-white/30 text-xs mt-0.5">
              {exporting
                ? `Preparing ${exporting.toUpperCase()}…`
                : 'Generate a timesheet or invoice-ready report'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {(
            [
              {
                format: 'pdf' as const,
                label: 'PDF Report',
                desc: 'Professional timesheet',
                icon: FileText,
                color: 'text-red-400 bg-red-500/10',
              },
              {
                format: 'xlsx' as const,
                label: 'Excel / XLSX',
                desc: 'Spreadsheet with pivot tables',
                icon: Table,
                color: 'text-emerald-400 bg-emerald-500/10',
              },
              {
                format: 'csv' as const,
                label: 'CSV Export',
                desc: 'Raw data for processing',
                icon: Code,
                color: 'text-blue-400 bg-blue-500/10',
              },
              {
                format: 'html' as const,
                label: 'HTML Invoice',
                desc: 'Shareable web report',
                icon: ExternalLink,
                color: 'text-amber-400 bg-amber-500/10',
              },
            ] as const
          ).map(({ format: fmt, label, desc, icon: Icon, color }) => (
            <button
              key={fmt}
              type="button"
              disabled={Boolean(exporting)}
              onClick={() => void handleExport(fmt)}
              className={cn(
                'flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all group',
                exporting === fmt
                  ? 'bg-violet-500/15 border-violet-500/30'
                  : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1]',
                exporting && exporting !== fmt && 'opacity-40 pointer-events-none'
              )}
            >
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-white/70 text-xs font-medium">{exporting === fmt ? 'Exporting…' : label}</p>
                <p className="text-white/30 text-[10px] mt-0.5">{desc}</p>
              </div>
              <div className="flex items-center gap-1 text-white/20 group-hover:text-white/50 text-[10px] transition-colors mt-auto">
                <Download className="w-3 h-3" />
                Download
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-white/30 text-xs">
            <BarChart2 className="w-3.5 h-3.5" />
            <span>API available — connect to GrandTotal, FreshBooks, or QuickBooks</span>
          </div>
          <button className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs hover:bg-violet-500/20 transition-colors">
            <ExternalLink className="w-3 h-3" />
            Web API Docs
          </button>
        </div>
      </div>
    </div>
  );
}
