import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Clock,
  BarChart3,
  FolderKanban,
  FileText,
  Zap,
  Cloud,
  CloudOff,
  RefreshCw,
  Timer,
  Square,
  Plus,
  Users,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn, PROJECT_COLORS } from '../utils/cn';
import { formatDurationLong } from '../utils/format';
import { ViewType } from '../types';
import {
  totalSecondsForDate,
  unassignedSecondsForDate,
  secondsForProjectOnDate,
} from '../utils/sidebarTotals';

const NAV_ITEMS: { id: ViewType; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'timeline', label: 'Timeline', icon: Clock },
  { id: 'review', label: 'Review', icon: BarChart3 },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'reports', label: 'Reports', icon: FileText },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const {
    currentView,
    setView,
    setReviewProjectFilter,
    activeTimers,
    stopTimer,
    startTimer,
    projects,
    activities,
    manualEntries,
    selectedDate,
    addProject,
    syncStatus,
    triggerSync,
    trackingStatus,
    currentApp,
  } = useStore();

  const privateProjects = projects.filter((p) => p.scope !== 'team');
  const teamProjects = projects.filter((p) => p.scope === 'team');

  const allDay = totalSecondsForDate(activities, manualEntries, selectedDate);
  const unassignedDay = unassignedSecondsForDate(activities, manualEntries, selectedDate);

  const addTeamProject = () => {
    const name = window.prompt('Team project name', 'Shared project');
    if (!name?.trim()) return;
    addProject({
      id: crypto.randomUUID(),
      name: name.trim(),
      color: 'purple',
      icon: '🤝',
      productivityScore: 75,
      totalTime: 0,
      createdAt: new Date().toISOString(),
      scope: 'team',
      teamLabel: name.trim(),
    });
    setView('projects');
  };

  return (
    <aside className="flex flex-col w-72 bg-[#111318] border-r border-white/[0.06] h-screen overflow-hidden flex-shrink-0">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[0.06] flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-900/40 flex-shrink-0">
          <Timer className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-white font-semibold text-[15px] leading-none">MVPTracker</h1>
          <p className="text-white/40 text-[11px] mt-0.5 truncate">Automatic Time Tracker</p>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white/[0.04]">
          <div
            className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              trackingStatus === 'active'
                ? 'bg-emerald-400 animate-pulse'
                : trackingStatus === 'idle'
                  ? 'bg-amber-400'
                  : 'bg-red-400'
            )}
          />
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-[11px] font-medium">
              {trackingStatus === 'active'
                ? 'Tracking Active'
                : trackingStatus === 'idle'
                  ? 'You appear idle'
                  : 'Away from Mac'}
            </p>
            <p className="text-white/30 text-[10px] truncate">{currentApp || 'No foreground app'}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <nav className="px-2 py-2 space-y-0.5 border-b border-white/[0.06] flex-shrink-0">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setView(item.id);
                  if (item.id === 'review') setReviewProjectFilter('all');
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150',
                  active
                    ? 'bg-violet-500/20 text-violet-300'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.05]'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
                {item.id === 'timeline' && (
                  <span className="ml-auto text-[10px] bg-white/10 rounded-md px-1.5 py-0.5 text-white/40">
                    Today
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-4">
          <div>
            <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-white/25 mb-2">Private</p>
            <button
              type="button"
              onClick={() => {
                setReviewProjectFilter('all');
                setView('review');
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-white/[0.05] text-left"
            >
              <span className="text-white/70 text-xs">All activities</span>
              <span className="text-white/40 text-[11px] font-mono tabular-nums">{formatDurationLong(allDay)}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setReviewProjectFilter('unassigned');
                setView('review');
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-white/[0.05] text-left"
            >
              <span className="text-white/70 text-xs">Unassigned</span>
              <span className="text-white/40 text-[11px] font-mono tabular-nums">
                {formatDurationLong(unassignedDay)}
              </span>
            </button>
            <p className="px-2 mt-2 mb-1 text-[10px] text-white/20">Private projects</p>
            <div className="space-y-0.5">
              {privateProjects.length === 0 ? (
                <p className="px-2 text-[11px] text-white/25">No private projects yet</p>
              ) : (
                privateProjects.map((p) => {
                  const colors = PROJECT_COLORS[p.color];
                  const secs = secondsForProjectOnDate(activities, manualEntries, p.id, selectedDate);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => {
                        setReviewProjectFilter(p.id);
                        setView('review');
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.05] text-left"
                    >
                      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', colors.bg)} />
                      <span className="text-white/60 text-xs truncate flex-1 min-w-0">
                        {p.icon} {p.name}
                      </span>
                      <span className="text-white/35 text-[10px] font-mono tabular-nums flex-shrink-0">
                        {formatDurationLong(secs)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25 flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                Teams
              </p>
              <button
                type="button"
                onClick={addTeamProject}
                className="w-6 h-6 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/50"
                title="New team project"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="px-2 mb-1 text-[10px] text-white/20">Team projects · sync coming</p>
            <div className="space-y-0.5">
              {teamProjects.length === 0 ? (
                <p className="px-2 text-[11px] text-white/25">No team projects yet</p>
              ) : (
                teamProjects.map((p) => {
                  const colors = PROJECT_COLORS[p.color];
                  const secs = secondsForProjectOnDate(activities, manualEntries, p.id, selectedDate);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => {
                        setReviewProjectFilter(p.id);
                        setView('review');
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.05] text-left"
                    >
                      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', colors.bg)} />
                      <span className="text-white/60 text-xs truncate flex-1 min-w-0">
                        {p.icon} {p.name}
                      </span>
                      <span className="text-white/35 text-[10px] font-mono tabular-nums flex-shrink-0">
                        {formatDurationLong(secs)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 pb-2 border-t border-white/[0.06] pt-3 flex-shrink-0">
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-white/30 text-[11px] font-semibold uppercase tracking-wider">Manual Timers</span>
          <button
            type="button"
            onClick={() => {
              const project = projects[0];
              if (project) startTimer(project.id, 'New Task');
            }}
            className="w-5 h-5 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <Plus className="w-3 h-3 text-white/60" />
          </button>
        </div>

        {activeTimers.length === 0 ? (
          <div className="text-white/20 text-[11px] text-center py-2">No active timers</div>
        ) : (
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {activeTimers.map((timer) => {
              const project = projects.find((p) => p.id === timer.projectId);
              const colors = project ? PROJECT_COLORS[project.color] : PROJECT_COLORS.blue;
              return (
                <div key={timer.id} className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white/[0.04] group">
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0 animate-pulse', colors.bg)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white/70 text-[11px] truncate">{timer.title || project?.name}</p>
                    <p className={cn('text-[11px] font-mono font-medium', colors.text)}>
                      {formatDurationLong(timer.elapsed)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => stopTimer(timer.id)}
                    className="w-5 h-5 rounded-md bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Square className="w-2.5 h-2.5 text-red-400 fill-red-400" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-3 pb-4 border-t border-white/[0.06] pt-3 flex-shrink-0">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full mb-2 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/50 hover:text-white/70 text-[11px] font-medium transition-colors"
        >
          Switch portal
        </button>
        <button
          type="button"
          onClick={triggerSync}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
        >
          {syncStatus === 'syncing' ? (
            <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
          ) : syncStatus === 'synced' ? (
            <Cloud className="w-3.5 h-3.5 text-emerald-400" />
          ) : syncStatus === 'error' ? (
            <CloudOff className="w-3.5 h-3.5 text-red-400" />
          ) : (
            <CloudOff className="w-3.5 h-3.5 text-white/30" />
          )}
          <span className="text-[11px] text-white/40">
            {syncStatus === 'syncing'
              ? 'Syncing…'
              : syncStatus === 'synced'
                ? 'Synced with Supabase'
                : syncStatus === 'error'
                  ? 'Sync error'
                  : 'Offline'}
          </span>
          <Zap className="w-3 h-3 text-white/20 ml-auto" />
        </button>

        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-[10px] text-white/20">Tauri v2 · Rust · SQLite</span>
          <span className="text-[10px] text-white/20">v2.0.0</span>
        </div>
      </div>
    </aside>
  );
}
