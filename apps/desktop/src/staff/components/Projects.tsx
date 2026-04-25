import React, { useState, useEffect } from 'react';
import {
  Plus,
  MoreHorizontal,
  Edit3,
  Trash2,
  Clock,
  DollarSign,
  TrendingUp,
  Users,
  ChevronRight,
  X,
  Check,
  Zap,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn, PROJECT_COLORS } from '../utils/cn';
import { formatDuration } from '../utils/format';
import { Project, ProjectColor, ProjectScope } from '../types';
import { format } from 'date-fns';

const COLOR_OPTIONS: ProjectColor[] = ['blue', 'purple', 'green', 'orange', 'red', 'pink', 'teal', 'yellow', 'indigo', 'cyan'];
const ICONS = ['🎨', '📱', '📊', '🔌', '🌐', '✅', '🚀', '💡', '🔥', '⚡', '🎯', '🛠️', '📝', '🔍', '💼'];

export default function Projects() {
  const { projects, activities, addProject, updateProject, deleteProject } = useStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const getProjectStats = (projectId: string) => {
    const projectActivities = activities.filter((a) => a.projectId === projectId);
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayTime = projectActivities
      .filter((a) => a.startTime.startsWith(today))
      .reduce((s, a) => s + a.duration, 0);
    const weekTime = projectActivities.reduce((s, a) => s + a.duration, 0);
    return { todayTime, weekTime };
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0F14] p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-white text-2xl font-semibold">Projects</h2>
          <p className="text-white/40 text-sm mt-0.5">{projects.length} projects · Drag activities to assign</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors shadow-lg shadow-violet-900/30"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {projects.map((project) => {
          const colors = PROJECT_COLORS[project.color];
          const stats = getProjectStats(project.id);
          const menuOpen = activeMenuId === project.id;

          return (
            <div
              key={project.id}
              className="bg-[#161920] rounded-2xl border border-white/[0.05] hover:border-white/[0.08] transition-all group overflow-hidden"
            >
              {/* Color bar */}
              <div className={cn('h-1 w-full', colors.bg)} />

              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl leading-none">{project.icon}</span>
                    <div>
                      <h3 className="text-white font-semibold text-[15px] leading-tight">{project.name}</h3>
                      {project.client && (
                        <p className="text-white/40 text-xs mt-0.5 flex items-center gap-1">
                          <Users className="w-2.5 h-2.5" />{project.client}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <button
                      onClick={() => setActiveMenuId(menuOpen ? null : project.id)}
                      className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <MoreHorizontal className="w-4 h-4 text-white/50" />
                    </button>
                    {menuOpen && (
                      <div className="absolute right-0 top-8 w-44 bg-[#1E2029] border border-white/[0.08] rounded-xl shadow-xl z-20 overflow-hidden">
                        <button
                          onClick={() => { setEditingProject(project); setActiveMenuId(null); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-white/60 hover:text-white hover:bg-white/[0.05] text-xs transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />Edit Project
                        </button>
                        <button
                          onClick={() => { deleteProject(project.id); setActiveMenuId(null); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-red-400 hover:bg-red-500/10 text-xs transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className={cn('px-3 py-2.5 rounded-xl', colors.light)}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock className={cn('w-3 h-3', colors.text)} />
                      <span className="text-white/40 text-[10px]">Today</span>
                    </div>
                    <p className={cn('text-[15px] font-bold', colors.text)}>{formatDuration(stats.todayTime)}</p>
                  </div>
                  <div className="px-3 py-2.5 rounded-xl bg-white/[0.04]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <TrendingUp className="w-3 h-3 text-white/30" />
                      <span className="text-white/40 text-[10px]">This week</span>
                    </div>
                    <p className="text-[15px] font-bold text-white/60">{formatDuration(stats.weekTime)}</p>
                  </div>
                </div>

                {/* Productivity Score */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-white/40 text-[10px] flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5" />Productivity Score
                    </span>
                    <span className={cn('text-[11px] font-semibold', colors.text)}>{project.productivityScore}%</span>
                  </div>
                  <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-700', colors.bg)}
                      style={{ width: `${project.productivityScore}%` }}
                    />
                  </div>
                </div>

                {/* Billing */}
                {project.hourlyRate && (
                  <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                    <div className="flex items-center gap-1.5 text-white/30 text-[10px]">
                      <DollarSign className="w-3 h-3" />
                      ${project.hourlyRate}/hr
                    </div>
                    <div className="text-white/30 text-[10px]">
                      Est. ${((stats.weekTime / 3600) * project.hourlyRate).toFixed(0)} this week
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Add Project Card */}
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-[#161920] rounded-2xl border border-dashed border-white/[0.1] hover:border-white/[0.2] transition-all p-5 flex flex-col items-center justify-center gap-3 group min-h-[200px]"
        >
          <div className="w-10 h-10 rounded-xl bg-white/[0.04] group-hover:bg-white/[0.08] flex items-center justify-center transition-colors">
            <Plus className="w-5 h-5 text-white/30 group-hover:text-white/60" />
          </div>
          <span className="text-white/30 group-hover:text-white/50 text-sm transition-colors">New Project</span>
        </button>
      </div>

      {/* Projects Detail Table */}
      <div className="bg-[#161920] rounded-2xl border border-white/[0.05] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-white font-semibold text-sm">All Projects — Time Breakdown</h3>
          <button className="text-violet-400 text-xs hover:text-violet-300 flex items-center gap-1">
            Export CSV <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.04]">
              {['Project', 'Client', 'Total Time', 'Today', 'Rate', 'Score', 'Billable'].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-white/30 text-[10px] font-medium uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const colors = PROJECT_COLORS[project.color];
              const stats = getProjectStats(project.id);
              const billable = project.hourlyRate
                ? ((project.totalTime / 3600) * project.hourlyRate).toFixed(0)
                : '—';
              return (
                <tr key={project.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={cn('w-2 h-2 rounded-full flex-shrink-0', colors.bg)} />
                      <span className="text-white text-sm">{project.icon} {project.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-white/40 text-xs">{project.client || '—'}</td>
                  <td className="px-5 py-3 text-white/70 text-xs font-mono">{formatDuration(project.totalTime)}</td>
                  <td className="px-5 py-3 text-white/70 text-xs font-mono">{formatDuration(stats.todayTime)}</td>
                  <td className="px-5 py-3 text-white/40 text-xs">{project.hourlyRate ? `$${project.hourlyRate}/h` : '—'}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', colors.bg)} style={{ width: `${project.productivityScore}%` }} />
                      </div>
                      <span className={cn('text-xs font-medium', colors.text)}>{project.productivityScore}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-white/50 text-xs font-mono">{project.hourlyRate ? `$${billable}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(showAddModal || editingProject) && (
        <ProjectModal
          project={editingProject}
          onClose={() => { setShowAddModal(false); setEditingProject(null); }}
          onSave={(data) => {
            if (editingProject) {
              updateProject(editingProject.id, data);
            } else {
              addProject({
                id: crypto.randomUUID(),
                totalTime: 0,
                createdAt: new Date().toISOString(),
                scope: 'private',
                ...data,
              } as Project);
            }
            setShowAddModal(false);
            setEditingProject(null);
          }}
        />
      )}
    </div>
  );
}

interface ProjectModalProps {
  project: Project | null;
  onClose: () => void;
  onSave: (data: Partial<Project>) => void;
}

function ProjectModal({ project, onClose, onSave }: ProjectModalProps) {
  const [name, setName] = useState(project?.name || '');
  const [client, setClient] = useState(project?.client || '');
  const [color, setColor] = useState<ProjectColor>(project?.color || 'blue');
  const [icon, setIcon] = useState(project?.icon || '🎨');
  const [hourlyRate, setHourlyRate] = useState(String(project?.hourlyRate || ''));
  const [productivityScore, setProductivityScore] = useState(project?.productivityScore || 80);
  const [description, setDescription] = useState(project?.description || '');
  const [scope, setScope] = useState<ProjectScope>(project?.scope ?? 'private');
  const [teamLabel, setTeamLabel] = useState(project?.teamLabel || '');

  useEffect(() => {
    setName(project?.name || '');
    setClient(project?.client || '');
    setColor(project?.color || 'blue');
    setIcon(project?.icon || '🎨');
    setHourlyRate(String(project?.hourlyRate || ''));
    setProductivityScore(project?.productivityScore ?? 80);
    setDescription(project?.description || '');
    setScope(project?.scope ?? 'private');
    setTeamLabel(project?.teamLabel || '');
  }, [project]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      client,
      color,
      icon,
      hourlyRate: Number(hourlyRate) || undefined,
      productivityScore,
      description,
      scope,
      teamLabel: scope === 'team' ? (teamLabel.trim() || name.trim()) : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[480px] bg-[#161920] rounded-2xl border border-white/[0.08] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-white font-semibold">{project ? 'Edit Project' : 'New Project'}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-white/40 text-[11px] uppercase tracking-wider mb-1.5">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Client Website Redesign"
              className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-violet-500/50"
              required
            />
          </div>

          <div>
            <label className="block text-white/40 text-[11px] uppercase tracking-wider mb-2">Scope</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-white/60 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="proj-scope"
                  checked={scope === 'private'}
                  onChange={() => setScope('private')}
                  className="accent-violet-500"
                />
                Private
              </label>
              <label className="flex items-center gap-2 text-white/60 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="proj-scope"
                  checked={scope === 'team'}
                  onChange={() => setScope('team')}
                  className="accent-violet-500"
                />
                Team
              </label>
            </div>
            {scope === 'team' && (
              <div className="mt-2">
                <label className="block text-white/40 text-[11px] uppercase tracking-wider mb-1.5">Team label</label>
                <input
                  type="text"
                  value={teamLabel}
                  onChange={(e) => setTeamLabel(e.target.value)}
                  placeholder="e.g. Acme Team"
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-violet-500/50"
                />
                <p className="text-white/25 text-[10px] mt-1">Collaboration sync is not wired yet — this is local grouping.</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-white/40 text-[11px] uppercase tracking-wider mb-1.5">Client</label>
              <input
                type="text"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="Client name"
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className="block text-white/40 text-[11px] uppercase tracking-wider mb-1.5">Hourly Rate ($)</label>
              <input
                type="number"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="150"
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-white/40 text-[11px] uppercase tracking-wider mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map((c) => {
                const colors = PROJECT_COLORS[c];
                return (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setColor(c)}
                    className={cn('w-7 h-7 rounded-lg flex items-center justify-center transition-all', colors.bg, color === c ? 'ring-2 ring-white/50 ring-offset-1 ring-offset-[#161920]' : 'opacity-60 hover:opacity-80')}
                  >
                    {color === c && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Icon */}
          <div>
            <label className="block text-white/40 text-[11px] uppercase tracking-wider mb-2">Icon</label>
            <div className="flex gap-2 flex-wrap">
              {ICONS.map((i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setIcon(i)}
                  className={cn(
                    'w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all',
                    icon === i ? 'bg-white/20 ring-1 ring-white/40' : 'bg-white/[0.04] hover:bg-white/[0.08]'
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Productivity Score */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-white/40 text-[11px] uppercase tracking-wider">Productivity Score</label>
              <span className="text-white/60 text-xs">{productivityScore}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={productivityScore}
              onChange={(e) => setProductivityScore(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
          </div>

          <div>
            <label className="block text-white/40 text-[11px] uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={2}
              className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-violet-500/50 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.06] text-white/60 text-sm hover:bg-white/[0.1] transition-colors">
              Cancel
            </button>
            <button type="submit" className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors">
              {project ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

