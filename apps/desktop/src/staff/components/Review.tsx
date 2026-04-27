import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Code2,
  MessageSquare,
  Palette,
  Activity,
  MoreHorizontal,
  Tag,
  ArrowRight,
  Zap,
  Clock,
  FileText,
  Wrench,
  Cpu,
  ListChecks,
  Music2,
  Clapperboard,
  BookOpen,
  Settings,
} from 'lucide-react';
import { format, parseISO, subDays, addDays } from 'date-fns';
import { useStore } from '../store/useStore';
import { cn, PROJECT_COLORS } from '../utils/cn';
import { formatDuration } from '../utils/format';
import { AppCategory, ActivityEntry } from '../types';
import {
  APP_CATEGORY_ORDER,
  CATEGORY_HEX,
  CATEGORY_LABELS,
  effectiveActivityProductivity,
} from '../utils/appCategories';

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

const PRODUCTIVITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Productive', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  0: { label: 'Neutral', color: 'text-white/40 bg-white/[0.05] border-white/[0.08]' },
  [-1]: { label: 'Distraction', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
};

export default function Review() {
  const {
    selectedDate,
    setSelectedDate,
    activities,
    projects,
    assignActivityToProject,
    reviewProjectFilter,
    setReviewProjectFilter,
  } = useStore();
  const [selectedActivity, setSelectedActivity] = useState<ActivityEntry | null>(null);
  const [filterCategory, setFilterCategory] = useState<AppCategory | 'all'>('all');

  const dateObj = new Date(selectedDate + 'T00:00:00');
  const now = new Date();
  const isToday = selectedDate === format(now, 'yyyy-MM-dd');

  const goToPrev = () => setSelectedDate(format(subDays(dateObj, 1), 'yyyy-MM-dd'));
  const goToNext = () => setSelectedDate(format(addDays(dateObj, 1), 'yyyy-MM-dd'));

  const dayActivities = activities.filter(
    (a) => format(parseISO(a.startTime), 'yyyy-MM-dd') === selectedDate
  );

  const filtered = dayActivities.filter((a) => {
    if (filterCategory !== 'all' && a.category !== filterCategory) return false;
    const fp = reviewProjectFilter;
    if (fp === 'all') return true;
    if (fp === 'unassigned') return !a.projectId;
    return a.projectId === fp;
  });

  const totalTime = filtered.reduce((s, a) => s + a.duration, 0);
  const productiveTime = filtered
    .filter((a) => effectiveActivityProductivity(a) > 0)
    .reduce((s, a) => s + a.duration, 0);
  const unassignedCount = dayActivities.filter((a) => !a.projectId).length;

  // Group by hour
  const byHour: Record<number, ActivityEntry[]> = {};
  filtered.forEach((a) => {
    const hour = parseISO(a.startTime).getHours();
    if (!byHour[hour]) byHour[hour] = [];
    byHour[hour].push(a);
  });

  const categories = APP_CATEGORY_ORDER.filter((c) => dayActivities.some((a) => a.category === c));

  return (
    <div className="flex-1 flex flex-col bg-[#0D0F14] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={goToPrev} className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center transition-colors">
            <ChevronLeft className="w-4 h-4 text-white/60" />
          </button>
          <button
            onClick={() => setSelectedDate(format(now, 'yyyy-MM-dd'))}
            className={cn(
              'px-3 h-8 rounded-lg text-xs font-medium transition-colors',
              isToday ? 'bg-violet-500/20 text-violet-300' : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]'
            )}
          >
            Today
          </button>
          <button onClick={goToNext} className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center transition-colors">
            <ChevronRight className="w-4 h-4 text-white/60" />
          </button>
        </div>
        <h2 className="text-white font-semibold text-[15px]">{format(dateObj, 'EEEE, MMMM d, yyyy')}</h2>

        <div className="ml-auto flex items-center gap-2">
          {unassignedCount > 0 && (
            <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-medium">
              {unassignedCount} unassigned
            </span>
          )}
          {/* Category Filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as AppCategory | 'all')}
            className="bg-[#161920] border border-white/[0.06] rounded-xl px-3 py-1.5 text-white/60 text-xs focus:outline-none focus:border-violet-500/50"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            value={reviewProjectFilter}
            onChange={(e) => setReviewProjectFilter(e.target.value)}
            className="bg-[#161920] border border-white/[0.06] rounded-xl px-3 py-1.5 text-white/60 text-xs focus:outline-none focus:border-violet-500/50"
          >
            <option value="all">All Projects</option>
            <option value="unassigned">Unassigned</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Activity List */}
        <div className="flex-1 overflow-y-auto">
          {/* Day Summary Bar */}
          <div className="flex items-center gap-4 px-6 py-3 border-b border-white/[0.04] bg-[#111318]/50">
            <div className="flex items-center gap-1.5 text-white/60 text-xs">
              <Clock className="w-3.5 h-3.5" />
              <span className="font-medium">{formatDuration(totalTime)}</span>
              <span className="text-white/30">total</span>
            </div>
            <div className="flex items-center gap-1.5 text-white/60 text-xs">
              <Zap className="w-3.5 h-3.5 text-violet-400" />
              <span className="font-medium text-violet-400">{formatDuration(productiveTime)}</span>
              <span className="text-white/30">productive</span>
            </div>
            {totalTime > 0 && (
              <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden ml-2">
                <div
                  className="h-full bg-violet-500 rounded-full"
                  style={{ width: `${(productiveTime / totalTime) * 100}%` }}
                />
              </div>
            )}
            <span className="text-white/30 text-xs ml-2">{filtered.length} entries</span>
          </div>

          {/* Activities grouped by hour */}
          <div className="px-6 py-4 space-y-6">
            {Object.keys(byHour).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-white/20">
                <Clock className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-sm">No activities tracked for this day</p>
              </div>
            ) : (
              Object.entries(byHour)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([hour, hourActivities]) => {
                  const h = Number(hour);
                  const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
                  const hourTotal = hourActivities.reduce((s, a) => s + a.duration, 0);

                  return (
                    <div key={hour}>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-white/30 text-xs font-medium w-12">{label}</span>
                        <div className="flex-1 h-px bg-white/[0.04]" />
                        <span className="text-white/20 text-xs">{formatDuration(hourTotal)}</span>
                      </div>
                      <div className="space-y-1.5 ml-16">
                        {hourActivities.map((activity) => {
                          const Icon = CATEGORY_ICONS[activity.category] || Activity;
                          const color = CATEGORY_COLORS[activity.category] || '#6B7280';
                          const project = projects.find((p) => p.id === activity.projectId);
                          const productivity =
                            PRODUCTIVITY_LABELS[effectiveActivityProductivity(activity)];
                          const isSelected = selectedActivity?.id === activity.id;

                          return (
                            <div
                              key={activity.id}
                              className={cn(
                                'flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all',
                                isSelected
                                  ? 'bg-violet-500/10 border-violet-500/30'
                                  : 'bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.07]'
                              )}
                              onClick={() => setSelectedActivity(isSelected ? null : activity)}
                            >
                              <div
                                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{ background: `${color}20` }}
                              >
                                <Icon className="w-4 h-4" style={{ color }} />
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-white/80 text-sm font-medium">{activity.appName}</p>
                                  {productivity && (
                                    <span className={cn('px-1.5 py-0.5 rounded-md border text-[9px] font-semibold', productivity.color)}>
                                      {productivity.label}
                                    </span>
                                  )}
                                </div>
                                <p className="text-white/30 text-xs truncate">{activity.windowTitle}</p>
                                {activity.url && (
                                  <p className="text-blue-400/50 text-[10px] truncate">{activity.url}</p>
                                )}
                              </div>

                              <div className="flex items-center gap-3 flex-shrink-0">
                                {project ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm">{project.icon}</span>
                                    <span className={cn('text-[10px]', PROJECT_COLORS[project.color]?.text)}>{project.name}</span>
                                  </div>
                                ) : (
                                  <button
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-white/[0.1] hover:border-violet-500/30 text-white/20 hover:text-violet-400 text-[10px] transition-colors"
                                    onClick={(e) => { e.stopPropagation(); setSelectedActivity(activity); }}
                                  >
                                    <Tag className="w-2.5 h-2.5" />
                                    Assign
                                  </button>
                                )}
                                <div className="text-right">
                                  <p className="text-white/50 text-xs font-mono">{formatDuration(activity.duration)}</p>
                                  <p className="text-white/20 text-[10px]">
                                    {format(parseISO(activity.startTime), 'h:mm')}–{format(parseISO(activity.endTime), 'h:mm a')}
                                  </p>
                                </div>
                                <ArrowRight className={cn('w-3.5 h-3.5 transition-opacity', isSelected ? 'text-violet-400' : 'text-white/10')} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedActivity && (
          <div className="w-72 border-l border-white/[0.06] bg-[#111318] flex flex-col flex-shrink-0">
            <div className="px-4 py-4 border-b border-white/[0.06]">
              <h3 className="text-white font-semibold text-sm">Assign to Project</h3>
              <p className="text-white/30 text-[11px] mt-0.5">{selectedActivity.appName} · {formatDuration(selectedActivity.duration)}</p>
            </div>
            <div className="p-3 space-y-1.5 overflow-y-auto flex-1">
              {projects.map((p) => {
                const colors = PROJECT_COLORS[p.color];
                const isAssigned = selectedActivity.projectId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      const nextProjectId = selectedActivity.projectId === p.id ? undefined : p.id;
                      assignActivityToProject(selectedActivity.id, nextProjectId);
                      setSelectedActivity((prev) =>
                        prev && prev.id === selectedActivity.id ? { ...prev, projectId: nextProjectId } : prev
                      );
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs transition-all',
                      isAssigned
                        ? `${colors.light} ${colors.border} border-opacity-50 ${colors.text}`
                        : 'bg-white/[0.03] border-white/[0.05] text-white/50 hover:text-white/80 hover:bg-white/[0.06]'
                    )}
                  >
                    <span className="text-base leading-none">{p.icon}</span>
                    <div className="flex-1 text-left">
                      <p className="font-medium">{p.name}</p>
                      {p.client && <p className="text-white/30 text-[10px]">{p.client}</p>}
                    </div>
                    {isAssigned && <div className={cn('w-2 h-2 rounded-full', colors.bg)} />}
                  </button>
                );
              })}
            </div>

            {/* Activity path info */}
            {selectedActivity.filePath && (
              <div className="p-4 border-t border-white/[0.06]">
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">File Path</p>
                <p className="text-white/40 text-[10px] break-all font-mono">{selectedActivity.filePath}</p>
              </div>
            )}
            {selectedActivity.url && (
              <div className="p-4 border-t border-white/[0.06]">
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">URL</p>
                <p className="text-blue-400/60 text-[10px] break-all">{selectedActivity.url}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

