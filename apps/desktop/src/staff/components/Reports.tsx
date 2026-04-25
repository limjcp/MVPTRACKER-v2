import React, { useState } from 'react';
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
import { format, parseISO } from 'date-fns';
import { useStore } from '../store/useStore';
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

type ReportRange = 'today' | '7d' | '14d' | '30d' | 'month' | 'custom';

export default function Reports() {
  const { dailyStats, projects, activities, manualEntries, settings } = useStore();
  const [range, setRange] = useState<ReportRange>('7d');
  const [exporting, setExporting] = useState<ReportFormat | null>(null);
  /** `dailyStats` is oldest-first; last entries end on the anchor (today). */
  const periodDays = range === 'today' ? 1 : range === '7d' ? 7 : range === '14d' ? 14 : 30;
  const filteredStats = dailyStats.slice(-periodDays);

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

  // Project breakdown for the period
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

  const defaultRate = settings.defaultHourlyRate ?? 150;
  const currency = settings.currency ?? 'USD';
  const billableEstimate = (totalTime / 3600) * defaultRate;

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
          await exportReportHtml(filteredStats, activities, manualEntries, projects, settings, win);
          break;
        case 'xlsx':
          await exportReportXlsx(filteredStats, activities, manualEntries, projects, win);
          break;
        case 'pdf':
          await exportReportPdf(filteredStats, activities, manualEntries, projects, settings, win);
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
      win
    );
    printHtmlInHiddenFrame(html);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0F14] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-white text-2xl font-semibold">Reports</h2>
          <p className="text-white/40 text-sm mt-0.5">Detailed timesheets and productivity analysis</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Range Selector */}
          <div className="flex items-center gap-1 bg-[#161920] border border-white/[0.06] rounded-xl p-1 flex-wrap">
            {(['today', '7d', '14d', '30d'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  range === r
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
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#161920] border border-white/[0.06] text-white/60 text-sm hover:text-white hover:border-white/[0.1] transition-colors">
            <Filter className="w-3.5 h-3.5" />
            Filter
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Total Tracked',
            value: formatDuration(totalTime),
            sub: range === 'today' ? 'Today' : `${periodDays}-day period ending today`,
            color: 'violet',
          },
          {
            label: 'Productive Time',
            value: formatDuration(totalProductive),
            sub: `${totalTime > 0 ? Math.round((totalProductive / totalTime) * 100) : 0}% of total`,
            color: 'emerald',
          },
          { label: 'Avg Productivity', value: `${avgScore}%`, sub: 'Daily average score', color: 'blue' },
          {
            label: 'Billable Estimate',
            value: `${currency} ${billableEstimate.toFixed(0)}`,
            sub: `At ${currency} ${defaultRate}/hr (settings)`,
            color: 'amber',
          },
        ].map((card) => (
          <div key={card.label} className="bg-[#161920] rounded-2xl p-5 border border-white/[0.05]">
            <p className="text-white/30 text-xs mb-2">{card.label}</p>
            <p className="text-white text-2xl font-bold mb-1">{card.value}</p>
            <p className="text-white/30 text-[11px]">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4 mb-4">
        {/* Hours Chart */}
        <div className="col-span-8 bg-[#161920] rounded-2xl p-5 border border-white/[0.05]">
          <h3 className="text-white font-semibold text-[15px] mb-1">Daily Hours</h3>
          <p className="text-white/30 text-xs mb-5">Total vs. productive hours per day</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barGap={2}>
              <XAxis dataKey="date" tick={{ fill: '#ffffff40', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#ffffff40', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1E2029', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
              />
              <Bar dataKey="total" name="Total" fill="#8B5CF620" radius={[4, 4, 0, 0]} />
              <Bar dataKey="productive" name="Productive" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Score Chart */}
        <div className="col-span-4 bg-[#161920] rounded-2xl p-5 border border-white/[0.05]">
          <h3 className="text-white font-semibold text-[15px] mb-1">Score Trend</h3>
          <p className="text-white/30 text-xs mb-5">Productivity score over time</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fill: '#ffffff40', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#ffffff40', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1E2029', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
              />
              <Line type="monotone" dataKey="score" name="Score" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Project Breakdown + Timesheet */}
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
                    <div
                      className={cn('h-full rounded-full transition-all duration-700', colors.bg)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timesheet */}
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
                    <th key={h} className="text-left px-5 py-2.5 text-white/30 text-[10px] font-medium uppercase tracking-wider">{h}</th>
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

      {/* Export Panel */}
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
              { format: 'pdf' as const, label: 'PDF Report', desc: 'Professional timesheet', icon: FileText, color: 'text-red-400 bg-red-500/10' },
              { format: 'xlsx' as const, label: 'Excel / XLSX', desc: 'Spreadsheet with pivot tables', icon: Table, color: 'text-emerald-400 bg-emerald-500/10' },
              { format: 'csv' as const, label: 'CSV Export', desc: 'Raw data for processing', icon: Code, color: 'text-blue-400 bg-blue-500/10' },
              { format: 'html' as const, label: 'HTML Invoice', desc: 'Shareable web report', icon: ExternalLink, color: 'text-amber-400 bg-amber-500/10' },
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
                <p className="text-white/70 text-xs font-medium">
                  {exporting === fmt ? 'Exporting…' : label}
                </p>
                <p className="text-white/30 text-[10px] mt-0.5">{desc}</p>
              </div>
              <div className="flex items-center gap-1 text-white/20 group-hover:text-white/50 text-[10px] transition-colors mt-auto">
                <Download className="w-3 h-3" />
                Download
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center gap-4">
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

