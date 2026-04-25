import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Tag,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { format, parseISO, addDays, subDays, differenceInMinutes, differenceInSeconds } from 'date-fns';
import { useStore } from '../store/useStore';
import { cn, PROJECT_COLORS } from '../utils/cn';
import { formatDuration } from '../utils/format';
import type { ActivityEntry, ManualEntry, TimelineBlock } from '../types';
import { CATEGORY_HEX } from '../utils/appCategories';
import {
  OTHER_TASK_LABEL,
  OTHER_TASK_SLUG,
  TASK_TYPES,
  formatTaskType,
  getTaskTypeOption,
} from '../utils/taskTypes';
import AllActivitiesPanel from './AllActivitiesPanel';

function primaryActivityIds(block: TimelineBlock): string[] {
  if (block.type !== 'activity') return [];
  if (block.sourceIds?.length) return block.sourceIds;
  if (block.id.startsWith('act-')) return [block.id.slice(4)];
  return [];
}

function blockMatchesActivityId(block: TimelineBlock, activityId: string): boolean {
  if (block.id === `act-${activityId}`) return true;
  return Boolean(block.sourceIds?.includes(activityId));
}

function isAggregatedActivityBlock(block: TimelineBlock): boolean {
  return block.type === 'activity' && block.id.startsWith('agg-');
}

function isBucketBlock(block: TimelineBlock): boolean {
  return block.type === 'activity' && block.id.startsWith('bkt-');
}

function primaryManualIds(block: TimelineBlock): string[] {
  if (block.type !== 'manual' && block.type !== 'calendar') return [];
  if (block.sourceIds?.length) return block.sourceIds;
  if (block.id.startsWith('man-')) return [block.id.slice(4)];
  return [];
}

function activityColorWithoutProject(first: ActivityEntry | undefined): string {
  return CATEGORY_HEX[first?.category ?? 'other'] ?? '#6B7280';
}

function rescaleActivityTimes(
  ids: string[],
  activities: ActivityEntry[],
  timeStartDraft: string,
  timeEndDraft: string,
  updateActivity: (id: string, u: Partial<ActivityEntry>) => void
) {
  const startMs = new Date(timeStartDraft).getTime();
  const endMs = new Date(timeEndDraft).getTime();
  if (!(endMs > startMs)) return;
  const rows = ids
    .map((id) => activities.find((a) => a.id === id))
    .filter((a): a is ActivityEntry => Boolean(a))
    .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());
  if (rows.length === 0) return;

  if (rows.length === 1) {
    const a = rows[0]!;
    const duration = Math.max(0, differenceInSeconds(new Date(endMs), new Date(startMs)));
    updateActivity(a.id, {
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      duration,
    });
    return;
  }

  const oldMin = Math.min(...rows.map((r) => parseISO(r.startTime).getTime()));
  const oldMax = Math.max(...rows.map((r) => parseISO(r.endTime).getTime()));
  const oldSpan = Math.max(1, oldMax - oldMin);
  const newSpan = endMs - startMs;

  for (const r of rows) {
    const s = parseISO(r.startTime).getTime();
    const e = parseISO(r.endTime).getTime();
    const ns = startMs + ((s - oldMin) / oldSpan) * newSpan;
    const ne = startMs + ((e - oldMin) / oldSpan) * newSpan;
    updateActivity(r.id, {
      startTime: new Date(ns).toISOString(),
      endTime: new Date(ne).toISOString(),
      duration: Math.max(0, Math.round((ne - ns) / 1000)),
    });
  }
}

function rescaleManualTimes(
  ids: string[],
  manualEntries: ManualEntry[],
  timeStartDraft: string,
  timeEndDraft: string,
  updateManualEntry: (id: string, u: Partial<ManualEntry>) => void
) {
  const startMs = new Date(timeStartDraft).getTime();
  const endMs = new Date(timeEndDraft).getTime();
  if (!(endMs > startMs)) return;
  const rows = ids
    .map((id) => manualEntries.find((m) => m.id === id))
    .filter((m): m is ManualEntry => Boolean(m))
    .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());
  if (rows.length === 0) return;

  if (rows.length === 1) {
    const m = rows[0]!;
    const duration = Math.max(0, differenceInSeconds(new Date(endMs), new Date(startMs)));
    updateManualEntry(m.id, {
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      duration,
    });
    return;
  }

  const oldMin = Math.min(...rows.map((r) => parseISO(r.startTime).getTime()));
  const oldMax = Math.max(...rows.map((r) => parseISO(r.endTime).getTime()));
  const oldSpan = Math.max(1, oldMax - oldMin);
  const newSpan = endMs - startMs;

  for (const r of rows) {
    const s = parseISO(r.startTime).getTime();
    const e = parseISO(r.endTime).getTime();
    const ns = startMs + ((s - oldMin) / oldSpan) * newSpan;
    const ne = startMs + ((e - oldMin) / oldSpan) * newSpan;
    updateManualEntry(r.id, {
      startTime: new Date(ns).toISOString(),
      endTime: new Date(ne).toISOString(),
      duration: Math.max(0, Math.round((ne - ns) / 1000)),
    });
  }
}

const BASE_HOUR_HEIGHT = 56;
const TIMELINE_ZOOM_MIN = 0.5;
const TIMELINE_ZOOM_MAX = 2.5;
const TIMELINE_ZOOM_STEP = 0.125;
const DAY_START = 0;
const DAY_END = 24;
const TOTAL_HOURS = DAY_END - DAY_START;

export default function Timeline() {
  const {
    selectedDate,
    setSelectedDate,
    timelineBlocks,
    activities,
    manualEntries,
    projects,
    calendarEvents,
    corporations,
    addCorporation,
    setBlockTag,
    clearBlockTag,
    selectedActivityId,
    setSelectedActivity,
    assignActivityToProject,
    updateActivity,
    updateManualEntry,
    deleteActivities,
    deleteManualEntries,
  } = useStore();
  const [selectedBlock, setSelectedBlock] = useState<TimelineBlock | null>(null);
  const [displayLabelDraft, setDisplayLabelDraft] = useState('');
  const [manualTitleDraft, setManualTitleDraft] = useState('');
  const [timeStartDraft, setTimeStartDraft] = useState('');
  const [timeEndDraft, setTimeEndDraft] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const timelineRef = useRef<HTMLDivElement>(null);
  const hourHeightRef = useRef(BASE_HOUR_HEIGHT);
  const now = new Date();

  const hourHeight = Math.round(BASE_HOUR_HEIGHT * timelineZoom);
  hourHeightRef.current = hourHeight;

  const dateObj = new Date(selectedDate + 'T00:00:00');

  const goToPrev = () => setSelectedDate(format(subDays(dateObj, 1), 'yyyy-MM-dd'));
  const goToNext = () => setSelectedDate(format(addDays(dateObj, 1), 'yyyy-MM-dd'));
  const goToToday = () => setSelectedDate(format(now, 'yyyy-MM-dd'));

  const isToday = selectedDate === format(now, 'yyyy-MM-dd');

  useEffect(() => {
    if (isToday && timelineRef.current) {
      const mins = now.getHours() * 60 + now.getMinutes();
      const h = hourHeightRef.current;
      const scrollTo = (mins / 60) * h - 120;
      timelineRef.current.scrollTop = Math.max(0, scrollTo);
    }
  }, [isToday, selectedDate]);

  const getBlockStyle = (block: TimelineBlock) => {
    const startDate = parseISO(block.startTime);
    const endDate = parseISO(block.endTime);
    const startMinutes = (startDate.getHours() - DAY_START) * 60 + startDate.getMinutes();
    const durationMinutes = Math.max(1, differenceInMinutes(endDate, startDate));
    const top = (startMinutes / 60) * hourHeight;
    const height = Math.max((durationMinutes / 60) * hourHeight, 16);
    return { top, height };
  };

  const currentTimePosition = () => {
    const mins = (now.getHours() - DAY_START) * 60 + now.getMinutes();
    return (mins / 60) * hourHeight;
  };

  const zoomIn = () =>
    setTimelineZoom((z) => Math.min(TIMELINE_ZOOM_MAX, Math.round((z + TIMELINE_ZOOM_STEP) * 1000) / 1000));
  const zoomOut = () =>
    setTimelineZoom((z) => Math.max(TIMELINE_ZOOM_MIN, Math.round((z - TIMELINE_ZOOM_STEP) * 1000) / 1000));
  const zoomReset = () => setTimelineZoom(1);

  const handleTimelineWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -TIMELINE_ZOOM_STEP : TIMELINE_ZOOM_STEP;
    setTimelineZoom((z) => {
      const next = Math.round((z + delta) * 1000) / 1000;
      return Math.min(TIMELINE_ZOOM_MAX, Math.max(TIMELINE_ZOOM_MIN, next));
    });
  };

  const todayCalendarEvents = calendarEvents.filter((e) => {
    const eventDate = format(parseISO(e.startTime), 'yyyy-MM-dd');
    return eventDate === selectedDate;
  });

  const handleSelectActivityFromPanel = (id: string | null) => {
    setSelectedActivity(id);
    if (id) {
      const b = timelineBlocks.find((x) => blockMatchesActivityId(x, id));
      setSelectedBlock(b ?? null);
    } else {
      setSelectedBlock(null);
    }
  };

  useEffect(() => {
    setDeleteConfirm(false);
    if (!selectedBlock) {
      setDisplayLabelDraft('');
      setManualTitleDraft('');
      setTimeStartDraft('');
      setTimeEndDraft('');
      return;
    }
    setTimeStartDraft(format(parseISO(selectedBlock.startTime), "yyyy-MM-dd'T'HH:mm"));
    setTimeEndDraft(format(parseISO(selectedBlock.endTime), "yyyy-MM-dd'T'HH:mm"));

    const mids = primaryManualIds(selectedBlock);
    if (mids.length > 0) {
      const titles = mids.map((id) => manualEntries.find((m) => m.id === id)?.title ?? '');
      const unifiedTitle =
        titles.length && new Set(titles).size === 1 ? titles[0] ?? '' : titles[0] ?? '';
      setManualTitleDraft(unifiedTitle);
      setDisplayLabelDraft('');
      return;
    }

    const ids = primaryActivityIds(selectedBlock);
    if (ids.length === 0) {
      setDisplayLabelDraft('');
      setManualTitleDraft('');
      return;
    }
    const labels = ids
      .map((id) => activities.find((x) => x.id === id)?.displayLabel)
      .filter((x): x is string => Boolean(x && x.trim()));
    const unified =
      labels.length && new Set(labels.map((l) => l.trim())).size === 1 ? labels[0]!.trim() : '';
    setDisplayLabelDraft(
      unified || (activities.find((x) => x.id === ids[0])?.displayLabel?.trim() ?? '')
    );
    setManualTitleDraft('');
  }, [selectedBlock, activities, manualEntries]);

  const handleBlockClick = (block: TimelineBlock) => {
    const next = selectedBlock?.id === block.id ? null : block;
    setSelectedBlock(next);
    const aids = next ? primaryActivityIds(next) : [];
    setSelectedActivity(aids[0] ?? null);
  };

  const timelineHeight = TOTAL_HOURS * hourHeight + 40;

  return (
    <div className="flex-1 flex flex-col bg-[#0D0F14] overflow-hidden min-h-0">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToPrev}
            className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-white/60" />
          </button>
          <button
            type="button"
            onClick={goToToday}
            className={cn(
              'px-3 h-8 rounded-lg text-xs font-medium transition-colors',
              isToday
                ? 'bg-violet-500/20 text-violet-300'
                : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]'
            )}
          >
            Today
          </button>
          <button
            type="button"
            onClick={goToNext}
            className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-white/60" />
          </button>
        </div>

        <h2 className="text-white font-semibold text-[15px]">
          {format(dateObj, 'EEEE, MMMM d, yyyy')}
        </h2>

        <div className="ml-auto flex items-center gap-3">
          <div
            className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.04] p-0.5"
            title="Zoom timeline (Ctrl or ⌘ + scroll on the timeline)"
          >
            <button
              type="button"
              onClick={zoomOut}
              disabled={timelineZoom <= TIMELINE_ZOOM_MIN}
              className="w-7 h-7 rounded-md flex items-center justify-center text-white/60 hover:bg-white/[0.08] hover:text-white/90 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              aria-label="Zoom out timeline"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={zoomReset}
              className="min-w-[2.75rem] px-1 h-7 rounded-md text-[10px] font-medium tabular-nums text-white/45 hover:bg-white/[0.08] hover:text-white/80 transition-colors"
              title="Reset zoom"
            >
              {Math.round(timelineZoom * 100)}%
            </button>
            <button
              type="button"
              onClick={zoomIn}
              disabled={timelineZoom >= TIMELINE_ZOOM_MAX}
              className="w-7 h-7 rounded-md flex items-center justify-center text-white/60 hover:bg-white/[0.08] hover:text-white/90 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              aria-label="Zoom in timeline"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-4 text-xs text-white/30">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-violet-500 inline-block" />Auto
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" />Manual
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block" />Calendar
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-white/20 inline-block" />Idle
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 h-8 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 text-xs font-medium transition-colors border border-violet-500/30"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Entry
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AllActivitiesPanel
          selectedDate={selectedDate}
          activities={activities}
          selectedActivityId={selectedActivityId}
          onSelectActivity={handleSelectActivityFromPanel}
        />

        <div className="w-[40%] shrink-0 flex min-w-0 min-h-0 relative">
          <div className="flex-1 flex overflow-hidden min-h-0">
            <div
              ref={timelineRef}
              onWheel={handleTimelineWheel}
              className="flex-1 overflow-y-auto overflow-x-hidden relative bg-[#0D0F14]"
            >
              <div className="relative" style={{ height: timelineHeight, minWidth: 280 }}>
                {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
                  const hour = DAY_START + i;
                  const label =
                    hour >= 24 ? '24:00' : `${String(hour).padStart(2, '0')}:00`;
                  return (
                    <div key={i} className="absolute left-0 right-0 flex items-start" style={{ top: i * hourHeight }}>
                      <span className="w-12 text-right pr-2 text-white/25 text-[10px] -translate-y-2 flex-shrink-0 tabular-nums">
                        {label}
                      </span>
                      <div className="flex-1 border-t border-white/[0.06]" />
                    </div>
                  );
                })}

                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <div
                    key={`half-${i}`}
                    className="absolute left-12 right-0 border-t border-white/[0.03]"
                    style={{ top: i * hourHeight + hourHeight / 2 }}
                  />
                ))}

                {isToday && (
                  <div
                    className="absolute left-12 right-0 z-20 flex items-center pointer-events-none"
                    style={{ top: currentTimePosition() }}
                  >
                    <div className="w-2 h-2 rounded-full bg-red-400 -ml-1 flex-shrink-0" />
                    <div className="flex-1 h-px bg-red-400/60" />
                    <span className="text-red-400 text-[10px] ml-2 flex-shrink-0 tabular-nums">
                      {format(now, 'HH:mm')}
                    </span>
                  </div>
                )}

                <div className="absolute left-12 right-2 top-0">
                  {timelineBlocks.map((block) => {
                    const style = getBlockStyle(block);
                    if (style.top < 0 || style.top > TOTAL_HOURS * hourHeight) return null;
                    const project = projects.find((p) => p.id === block.projectId);
                    const isSelected = selectedBlock?.id === block.id;
                    const isIdle = block.type === 'idle';
                    const isBucket = isBucketBlock(block);
                    const corp = block.corporationId
                      ? corporations.find((c) => c.id === block.corporationId)
                      : undefined;
                    const taskLabel = isBucket
                      ? formatTaskType(block.taskType, block.taskTypeDetail)
                      : '';
                    const tagged = isBucket && (Boolean(corp) || Boolean(block.taskType));
                    const bucketHeadline = isBucket
                      ? corp?.name ||
                        taskLabel ||
                        block.displayLabel ||
                        `${format(parseISO(block.startTime), 'HH:mm')}–${format(parseISO(block.endTime), 'HH:mm')}`
                      : '';

                    return (
                      <button
                        type="button"
                        key={block.id}
                        className={cn(
                          'absolute left-0 right-0 rounded-lg cursor-pointer transition-all duration-150 group overflow-hidden text-left',
                          isSelected
                            ? 'ring-2 ring-white/40 z-10'
                            : tagged
                              ? 'ring-1 ring-emerald-400/40 hover:z-10'
                              : 'hover:z-10 hover:ring-1 hover:ring-white/20'
                        )}
                        style={{
                          top: style.top,
                          height: style.height,
                          background: isIdle ? 'rgba(255,255,255,0.04)' : `${block.color}25`,
                          borderLeft: `3px solid ${isIdle ? '#374151' : block.color}`,
                        }}
                        onClick={() => handleBlockClick(block)}
                      >
                        <div className="px-2 py-1 h-full flex flex-col justify-center">
                          {style.height > 24 && (
                            <p className="text-[11px] font-medium text-white/80 truncate leading-tight">
                              {isIdle
                                ? 'Idle / Away'
                                : isBucket
                                  ? bucketHeadline
                                  : (block.displayLabel || block.appName)}
                            </p>
                          )}
                          {style.height > 40 && (
                            <p className="text-[10px] text-white/40 truncate leading-tight mt-0.5">
                              {isBucket
                                ? taskLabel ||
                                  `${block.bucketActivities?.length ?? 0} activities`
                                : block.windowTitle}
                            </p>
                          )}
                          {style.height > 54 && !isBucket && project && (
                            <span className={cn('text-[9px] mt-1 font-medium', PROJECT_COLORS[project.color]?.text)}>
                              {project.icon} {project.name}
                            </span>
                          )}
                        </div>

                        <div className="absolute top-1 right-1 flex gap-1 pointer-events-none">
                          {tagged ? (
                            <span
                              className="px-1.5 h-5 rounded bg-emerald-500/30 text-emerald-100 text-[9px] font-semibold flex items-center"
                              title={`${corp?.name ?? 'Untagged corporation'}${
                                taskLabel ? ` · ${taskLabel}` : ''
                              }`}
                            >
                              {(corp?.name?.[0] ?? '?').toUpperCase()}
                            </span>
                          ) : (
                            <span className="w-5 h-5 rounded bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Tag className="w-2.5 h-2.5 text-white/60" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {todayCalendarEvents.map((event) => {
                    const start = parseISO(event.startTime);
                    const end = parseISO(event.endTime);
                    const startMinutes = (start.getHours() - DAY_START) * 60 + start.getMinutes();
                    const durationMinutes = Math.max(1, differenceInMinutes(end, start));
                    const top = (startMinutes / 60) * hourHeight;
                    const height = Math.max((durationMinutes / 60) * hourHeight, 20);

                    return (
                      <div
                        key={event.id}
                        className="absolute left-[15%] right-0 rounded-lg opacity-80 pointer-events-none"
                        style={{
                          top,
                          height,
                          background: `${event.color}15`,
                          border: `1px dashed ${event.color}60`,
                        }}
                      >
                        <div className="px-2 py-1">
                          <p className="text-[10px] font-medium truncate" style={{ color: event.color }}>
                            {event.title}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {selectedBlock && (
              <div className="w-64 min-w-[16rem] border-l border-white/[0.06] bg-[#111318] flex flex-col flex-shrink-0 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.06]">
                  <h3 className="text-white font-semibold text-xs">Detail</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBlock(null);
                      setSelectedActivity(null);
                    }}
                    className="w-6 h-6 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5 text-white/60" />
                  </button>
                </div>
                <div className="p-3 space-y-3 overflow-y-auto flex-1 min-w-0">
                  <div
                    className="h-1.5 rounded-full"
                    style={{ background: selectedBlock.type === 'idle' ? '#374151' : selectedBlock.color }}
                  />

                  <div>
                    <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">
                      {primaryManualIds(selectedBlock).length > 0
                        ? 'Entry type'
                        : isBucketBlock(selectedBlock)
                          ? '15-min block'
                          : isAggregatedActivityBlock(selectedBlock)
                            ? 'Session'
                            : 'Application'}
                    </p>
                    <p className="text-white text-xs font-medium">
                      {primaryManualIds(selectedBlock).length > 0
                        ? selectedBlock.type === 'calendar'
                          ? 'Calendar entry'
                          : 'Manual entry'
                        : isBucketBlock(selectedBlock)
                          ? `${format(parseISO(selectedBlock.startTime), 'HH:mm')} – ${format(parseISO(selectedBlock.endTime), 'HH:mm')}`
                          : isAggregatedActivityBlock(selectedBlock)
                            ? 'Automatic tracking (merged)'
                            : selectedBlock.appName || 'Activity'}
                    </p>
                  </div>

                  {isBucketBlock(selectedBlock) && (
                    <BucketDetailSection
                      block={selectedBlock}
                      activities={activities}
                      corporations={corporations}
                      addCorporation={addCorporation}
                      setBlockTag={setBlockTag}
                      clearBlockTag={clearBlockTag}
                    />
                  )}

                  {primaryActivityIds(selectedBlock).length > 0 && !isBucketBlock(selectedBlock) && (
                    <div>
                      <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Name</p>
                      <input
                        type="text"
                        value={displayLabelDraft}
                        onChange={(e) => setDisplayLabelDraft(e.target.value)}
                        onBlur={() => {
                          const ids = primaryActivityIds(selectedBlock);
                          if (ids.length === 0) return;
                          const nextLabel = displayLabelDraft.trim() || undefined;
                          for (const id of ids) {
                            const cur = activities.find((a) => a.id === id)?.displayLabel;
                            const curNorm = cur?.trim() || undefined;
                            if (nextLabel === curNorm) continue;
                            updateActivity(id, { displayLabel: nextLabel });
                          }
                        }}
                        placeholder="Label for this block"
                        className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-xs placeholder-white/25 focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                  )}

                  {primaryManualIds(selectedBlock).length > 0 && (
                    <div>
                      <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Name</p>
                      <input
                        type="text"
                        value={manualTitleDraft}
                        onChange={(e) => setManualTitleDraft(e.target.value)}
                        onBlur={() => {
                          const ids = primaryManualIds(selectedBlock);
                          if (ids.length === 0) return;
                          const nextTitle = manualTitleDraft.trim();
                          for (const id of ids) {
                            const cur = manualEntries.find((m) => m.id === id)?.title ?? '';
                            if (nextTitle === cur) continue;
                            updateManualEntry(id, { title: nextTitle });
                          }
                        }}
                        placeholder="Entry title"
                        className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-xs placeholder-white/25 focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                  )}

                  {selectedBlock.windowTitle &&
                    primaryManualIds(selectedBlock).length === 0 &&
                    !isBucketBlock(selectedBlock) && (
                    <div>
                      <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Window / Document</p>
                      <p className="text-white/70 text-[11px] break-words">{selectedBlock.windowTitle}</p>
                    </div>
                  )}

                  {(primaryActivityIds(selectedBlock).length > 0 ||
                    primaryManualIds(selectedBlock).length > 0) &&
                    !isBucketBlock(selectedBlock) && (
                    <div className="space-y-2">
                      <p className="text-white/40 text-[10px] uppercase tracking-wider">Time</p>
                      <input
                        type="datetime-local"
                        value={timeStartDraft}
                        onChange={(e) => setTimeStartDraft(e.target.value)}
                        className="w-full min-w-0 bg-white/[0.06] border border-white/[0.08] rounded-xl px-2 py-1.5 text-white text-[11px] focus:outline-none focus:border-violet-500/50"
                      />
                      <input
                        type="datetime-local"
                        value={timeEndDraft}
                        onChange={(e) => setTimeEndDraft(e.target.value)}
                        className="w-full min-w-0 bg-white/[0.06] border border-white/[0.08] rounded-xl px-2 py-1.5 text-white text-[11px] focus:outline-none focus:border-violet-500/50"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const aids = primaryActivityIds(selectedBlock);
                          const mids = primaryManualIds(selectedBlock);
                          const sm = new Date(timeStartDraft).getTime();
                          const em = new Date(timeEndDraft).getTime();
                          if (!(em > sm)) return;
                          if (aids.length) {
                            rescaleActivityTimes(
                              aids,
                              activities,
                              timeStartDraft,
                              timeEndDraft,
                              updateActivity
                            );
                          } else if (mids.length) {
                            rescaleManualTimes(
                              mids,
                              manualEntries,
                              timeStartDraft,
                              timeEndDraft,
                              updateManualEntry
                            );
                          }
                          const ns = new Date(timeStartDraft).toISOString();
                          const ne = new Date(timeEndDraft).toISOString();
                          const dur = Math.max(0, differenceInSeconds(parseISO(ne), parseISO(ns)));
                          setSelectedBlock((prev) =>
                            prev ? { ...prev, startTime: ns, endTime: ne, duration: dur } : null
                          );
                        }}
                        className="w-full py-1.5 rounded-lg text-xs font-medium bg-violet-500/20 text-violet-200 border border-violet-500/30 hover:bg-violet-500/30"
                      >
                        Apply time
                      </button>
                    </div>
                  )}

                  <div>
                    <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Duration</p>
                    <p className="text-white font-semibold text-sm">{formatDuration(selectedBlock.duration)}</p>
                  </div>

                  {(primaryActivityIds(selectedBlock).length > 0 ||
                    primaryManualIds(selectedBlock).length > 0) &&
                    !isBucketBlock(selectedBlock) && (
                    <div>
                      <p className="text-white/40 text-[10px] uppercase tracking-wider mb-2">Assign to Project</p>
                      {selectedBlock.projectId && (
                        <button
                          type="button"
                          onClick={() => {
                            const aids = primaryActivityIds(selectedBlock);
                            const mids = primaryManualIds(selectedBlock);
                            if (aids.length) {
                              aids.forEach((id) => assignActivityToProject(id, undefined));
                              const first = activities.find((a) => a.id === aids[0]);
                              setSelectedBlock((b) =>
                                b ? { ...b, projectId: undefined, color: activityColorWithoutProject(first) } : null
                              );
                            } else if (mids.length) {
                              mids.forEach((id) => updateManualEntry(id, { projectId: undefined }));
                              setSelectedBlock((b) =>
                                b ? { ...b, projectId: undefined, color: '#8B5CF6' } : null
                              );
                            }
                          }}
                          className="w-full mb-2 py-1.5 rounded-lg text-[11px] text-white/50 border border-white/[0.08] hover:bg-white/[0.06] hover:text-white/70"
                        >
                          Unassign from project
                        </button>
                      )}
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {projects.map((p) => {
                          const colors = PROJECT_COLORS[p.color];
                          const isAssigned = selectedBlock.projectId === p.id;
                          return (
                            <button
                              type="button"
                              key={p.id}
                              onClick={() => {
                                const aids = primaryActivityIds(selectedBlock);
                                const mids = primaryManualIds(selectedBlock);
                                aids.forEach((aid) => assignActivityToProject(aid, p.id));
                                mids.forEach((mid) => updateManualEntry(mid, { projectId: p.id }));
                                setSelectedBlock({ ...selectedBlock, projectId: p.id, color: colors.dot });
                              }}
                              className={cn(
                                'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-all',
                                isAssigned
                                  ? `${colors.light} border ${colors.border} border-opacity-50 ${colors.text}`
                                  : 'bg-white/[0.04] border border-white/[0.06] text-white/50 hover:text-white/70 hover:bg-white/[0.07]'
                              )}
                            >
                              <span>{p.icon}</span>
                              <span className="flex-1 text-left truncate">{p.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(primaryActivityIds(selectedBlock).length > 0 ||
                    primaryManualIds(selectedBlock).length > 0) &&
                    !isBucketBlock(selectedBlock) && (
                    <div className="pt-2 border-t border-white/[0.06]">
                      {!deleteConfirm ? (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(true)}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs text-red-400/90 border border-red-500/25 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete entry
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-white/40 text-[10px] text-center">Remove from your log?</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const aids = primaryActivityIds(selectedBlock);
                                const mids = primaryManualIds(selectedBlock);
                                if (aids.length) deleteActivities(aids);
                                if (mids.length) deleteManualEntries(mids);
                                setSelectedBlock(null);
                                setSelectedActivity(null);
                                setDeleteConfirm(false);
                              }}
                              className="flex-1 py-2 rounded-lg text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm(false)}
                              className="flex-1 py-2 rounded-lg text-xs text-white/50 border border-white/[0.08] hover:bg-white/[0.06]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddModal && <AddManualEntryModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}

function AddManualEntryModal({ onClose }: { onClose: () => void }) {
  const { projects, addManualEntry } = useStore();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [startTime, setStartTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [endTime, setEndTime] = useState(format(addDays(new Date(), 0), "yyyy-MM-dd'T'HH:mm"));
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    addManualEntry({
      id: crypto.randomUUID(),
      title,
      projectId: projectId || undefined,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      duration,
      notes,
      type: 'manual',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[420px] bg-[#161920] rounded-2xl border border-white/[0.08] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-white font-semibold">Add Manual Entry</h3>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-white/40 text-[11px] uppercase tracking-wider mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What did you work on?"
              className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-violet-500/50"
              required
            />
          </div>
          <div>
            <label className="block text-white/40 text-[11px] uppercase tracking-wider mb-1.5">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="app-select-dark w-full rounded-xl border border-white/[0.12] bg-[#0D0F14] px-3 py-2.5 text-sm text-zinc-100 shadow-inner shadow-black/20 focus:border-violet-500/50 focus:outline-none"
            >
              <option value="" className="bg-[#0D0F14] text-zinc-200">
                No project
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0D0F14] text-zinc-100">
                  {p.icon} {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-white/40 text-[11px] uppercase tracking-wider mb-1.5">Start</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className="block text-white/40 text-[11px] uppercase tracking-wider mb-1.5">End</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>
          <div>
            <label className="block text-white/40 text-[11px] uppercase tracking-wider mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              rows={2}
              className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-violet-500/50 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.06] text-white/60 text-sm hover:bg-white/[0.1] transition-colors">
              Cancel
            </button>
            <button type="submit" className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors">
              Add Entry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type BucketDetailProps = {
  block: TimelineBlock;
  activities: ActivityEntry[];
  corporations: ReturnType<typeof useStore.getState>['corporations'];
  addCorporation: ReturnType<typeof useStore.getState>['addCorporation'];
  setBlockTag: ReturnType<typeof useStore.getState>['setBlockTag'];
  clearBlockTag: ReturnType<typeof useStore.getState>['clearBlockTag'];
};

function BucketDetailSection({
  block,
  activities,
  corporations,
  addCorporation,
  setBlockTag,
  clearBlockTag,
}: BucketDetailProps) {
  const [newCorpDraft, setNewCorpDraft] = useState('');
  const [showAddCorp, setShowAddCorp] = useState(false);
  const [otherDraft, setOtherDraft] = useState('');
  const [detailDraft, setDetailDraft] = useState('');

  useEffect(() => {
    setShowAddCorp(false);
    setNewCorpDraft('');
    setOtherDraft(block.taskType === OTHER_TASK_SLUG ? (block.taskTypeDetail ?? '') : '');
    const opt = getTaskTypeOption(block.taskType);
    setDetailDraft(opt?.requiresDetail ? (block.taskTypeDetail ?? '') : '');
  }, [block.id, block.taskType, block.taskTypeDetail]);

  const bucketDate = useMemo(
    () => format(parseISO(block.startTime), 'yyyy-MM-dd'),
    [block.startTime]
  );
  const tagBucketRef = useMemo(
    () => ({
      id: `${block.startTime}|${block.endTime}`,
      bucketDate,
      bucketStart: block.startTime,
      bucketEnd: block.endTime,
    }),
    [bucketDate, block.startTime, block.endTime]
  );

  const contributions = useMemo(() => {
    const list = block.bucketActivities ?? [];
    return list
      .map((c) => {
        const a = activities.find((x) => x.id === c.activityId);
        return a ? { activity: a, secs: c.durationInBucket } : undefined;
      })
      .filter((x): x is { activity: ActivityEntry; secs: number } => Boolean(x))
      .sort((a, b) => b.secs - a.secs);
  }, [block.bucketActivities, activities]);

  const selectedTaskOpt = getTaskTypeOption(block.taskType);
  const isOther = block.taskType === OTHER_TASK_SLUG;

  const handleSelectCorp = (id: string | undefined) => {
    setBlockTag(tagBucketRef, { corporationId: id });
  };

  const handleAddCorp = () => {
    const name = newCorpDraft.trim();
    if (!name) return;
    const corp = addCorporation(name);
    setNewCorpDraft('');
    setShowAddCorp(false);
    setBlockTag(tagBucketRef, { corporationId: corp.id });
  };

  const handleSelectTask = (slug: string) => {
    if (slug === '') {
      setBlockTag(tagBucketRef, { taskType: undefined, taskTypeDetail: undefined });
      setOtherDraft('');
      setDetailDraft('');
      return;
    }
    if (slug === OTHER_TASK_SLUG) {
      setBlockTag(tagBucketRef, { taskType: OTHER_TASK_SLUG, taskTypeDetail: otherDraft.trim() || undefined });
      return;
    }
    const opt = getTaskTypeOption(slug);
    setBlockTag(tagBucketRef, {
      taskType: slug,
      taskTypeDetail: opt?.requiresDetail ? (detailDraft.trim() || undefined) : undefined,
    });
  };

  const isFullyTagged = Boolean(block.corporationId) && Boolean(block.taskType);

  return (
    <>
      <div>
        <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">
          Activities in this 15 min ({contributions.length})
        </p>
        {contributions.length === 0 ? (
          <p className="text-white/40 text-[11px]">No tracked activities.</p>
        ) : (
          <ul className="space-y-1 max-h-44 overflow-y-auto pr-1">
            {contributions.map(({ activity, secs }) => (
              <li
                key={activity.id}
                className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white/85 text-[11px] font-medium truncate">
                    {activity.appName}
                  </span>
                  <span className="text-white/40 text-[10px] tabular-nums shrink-0">
                    {formatDuration(secs)}
                  </span>
                </div>
                <p className="text-white/45 text-[10px] truncate" title={activity.windowTitle}>
                  {activity.windowTitle || activity.url || activity.filePath || '—'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-white/40 text-[10px] uppercase tracking-wider">Corporation</p>
          {block.corporationId && (
            <button
              type="button"
              onClick={() => handleSelectCorp(undefined)}
              className="text-[10px] text-white/40 hover:text-white/70"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* <Building2 className="w-3.5 h-3.5 text-white/40 shrink-0" /> */}
          <select
            value={block.corporationId ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__add__') {
                setShowAddCorp(true);
                return;
              }
              handleSelectCorp(v || undefined);
            }}
            className="app-select-dark flex-1 min-w-0 rounded-xl border border-white/[0.12] bg-[#0D0F14] px-2 py-1.5 text-[11px] text-zinc-100 shadow-inner shadow-black/20 focus:border-violet-500/50 focus:outline-none"
          >
            <option value="" className="bg-[#0D0F14] text-zinc-200">
              — Pick corporation —
            </option>
            {corporations.map((c) => (
              <option key={c.id} value={c.id} className="bg-[#0D0F14] text-zinc-100">
                {c.name}
              </option>
            ))}
            <option value="__add__" className="bg-[#0D0F14] text-zinc-200">
              + Add new corporation…
            </option>
          </select>
        </div>
        {showAddCorp && (
          <div className="mt-2 flex gap-1">
            <input
              type="text"
              autoFocus
              value={newCorpDraft}
              onChange={(e) => setNewCorpDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCorp();
                } else if (e.key === 'Escape') {
                  setShowAddCorp(false);
                  setNewCorpDraft('');
                }
              }}
              placeholder="New corporation name"
              className="flex-1 min-w-0 rounded-xl border border-white/[0.12] bg-[#0D0F14] px-2 py-1.5 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddCorp}
              disabled={!newCorpDraft.trim()}
              className="px-2 py-1.5 rounded-lg text-[11px] font-medium bg-violet-500/25 text-violet-200 border border-violet-500/30 hover:bg-violet-500/35 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-white/40 text-[10px] uppercase tracking-wider">Task type</p>
          {block.taskType && (
            <button
              type="button"
              onClick={() => handleSelectTask('')}
              className="text-[10px] text-white/40 hover:text-white/70"
            >
              Clear
            </button>
          )}
        </div>
        <select
          value={block.taskType ?? ''}
          onChange={(e) => handleSelectTask(e.target.value)}
          className="app-select-dark w-full min-w-0 rounded-xl border border-white/[0.12] bg-[#0D0F14] px-2 py-1.5 text-[11px] text-zinc-100 shadow-inner shadow-black/20 focus:border-violet-500/50 focus:outline-none"
        >
          <option value="" className="bg-[#0D0F14] text-zinc-200">
            — Pick task type —
          </option>
          {TASK_TYPES.map((t) => (
            <option key={t.slug} value={t.slug} className="bg-[#0D0F14] text-zinc-100">
              {t.label}
            </option>
          ))}
          <option value={OTHER_TASK_SLUG} className="bg-[#0D0F14] text-zinc-200">
            {OTHER_TASK_LABEL}
          </option>
        </select>

        {selectedTaskOpt?.requiresDetail && (
          <input
            type="text"
            value={detailDraft}
            onChange={(e) => setDetailDraft(e.target.value)}
            onBlur={() =>
              setBlockTag(tagBucketRef, {
                taskType: block.taskType,
                taskTypeDetail: detailDraft.trim() || undefined,
              })
            }
            placeholder={selectedTaskOpt.requiresDetail}
            className="mt-2 w-full rounded-xl border border-white/[0.12] bg-[#0D0F14] px-2 py-1.5 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/50 focus:outline-none"
          />
        )}

        {isOther && (
          <input
            type="text"
            value={otherDraft}
            onChange={(e) => setOtherDraft(e.target.value)}
            onBlur={() =>
              setBlockTag(tagBucketRef, {
                taskType: OTHER_TASK_SLUG,
                taskTypeDetail: otherDraft.trim() || undefined,
              })
            }
            placeholder="Describe what you were doing…"
            className="mt-2 w-full rounded-xl border border-white/[0.12] bg-[#0D0F14] px-2 py-1.5 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/50 focus:outline-none"
          />
        )}
      </div>

      {(block.corporationId || block.taskType) && (
        <button
          type="button"
          onClick={() => clearBlockTag(tagBucketRef.id)}
          className="w-full py-1.5 rounded-lg text-[11px] text-white/50 border border-white/[0.08] hover:bg-white/[0.06] hover:text-white/70"
        >
          Remove tags from this block
        </button>
      )}

      {!isFullyTagged && (
        <p className="text-white/30 text-[10px] leading-snug">
          Pick a corporation and a task type to mark this 15-minute slot as logged.
        </p>
      )}
    </>
  );
}
