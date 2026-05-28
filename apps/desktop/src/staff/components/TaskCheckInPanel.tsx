import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { prepareTaskCheckInWindow } from '../useTaskCheckInScheduler';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { parseISO } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { blockSegmentTagId } from '../store/derive';
import { LS_TASK_CHECKIN_SNOOZE_UNTIL } from '../useTaskCheckInScheduler';
import {
  OTHER_TASK_LABEL,
  OTHER_TASK_SLUG,
  TASK_TYPES,
  formatTaskType,
  getTaskTypeOption,
} from '../utils/taskTypes';

type Step = 'ask' | 'newTask';

type TaskSegmentRow = {
  id: string;
  startTime: string;
  endTime: string | null;
  title?: string;
};

type BlockTagRow = {
  id: string;
  segmentId?: string;
  corporationId?: string;
  taskType?: string;
  taskTypeDetail?: string;
};

type CorporationRow = { id: string; name: string };

function readDefaultNo(): boolean {
  try {
    const v = new URLSearchParams(window.location.search).get('default');
    return v === 'no';
  } catch {
    return false;
  }
}

function fromSegmentRow(r: Record<string, unknown>): TaskSegmentRow {
  return {
    id: String(r.id),
    startTime: String(r.start_time ?? r.startTime),
    endTime: (r.end_time ?? r.endTime) != null ? String(r.end_time ?? r.endTime) : null,
    title: r.title != null ? String(r.title) : undefined,
  };
}

function fromTagRow(r: Record<string, unknown>): BlockTagRow {
  const seg = r.segment_id ?? r.segmentId;
  const corp = r.corporation_id ?? r.corporationId;
  const tt = r.task_type ?? r.taskType;
  const ttd = r.task_type_detail ?? r.taskTypeDetail;
  return {
    id: String(r.id),
    segmentId: seg != null && String(seg) !== '' ? String(seg) : undefined,
    corporationId: corp != null && String(corp) !== '' ? String(corp) : undefined,
    taskType: tt != null && String(tt) !== '' ? String(tt) : undefined,
    taskTypeDetail: ttd != null && String(ttd) !== '' ? String(ttd) : undefined,
  };
}

function fromCorpRow(r: Record<string, unknown>): CorporationRow {
  return {
    id: String(r.id),
    name: String(r.name),
  };
}

function findOpenSegment(segments: TaskSegmentRow[]): TaskSegmentRow | undefined {
  const open = segments.filter((s) => !s.endTime);
  if (open.length === 0) return undefined;
  return [...open].sort((a, b) => parseISO(b.startTime).getTime() - parseISO(a.startTime).getTime())[0];
}

function findTagForSegment(tags: BlockTagRow[], segmentId: string): BlockTagRow | undefined {
  return tags.find((t) => t.segmentId === segmentId || t.id === blockSegmentTagId(segmentId));
}

/** Most recently ended segment that has corp/task tags (for defaults after downtime split). */
function findLastClosedSegmentTag(
  segments: TaskSegmentRow[],
  tags: BlockTagRow[]
): BlockTagRow | undefined {
  const closed = segments
    .filter((s) => s.endTime)
    .sort((a, b) => parseISO(b.endTime!).getTime() - parseISO(a.endTime!).getTime());
  for (const s of closed) {
    const tag = findTagForSegment(tags, s.id);
    if (
      tag &&
      (tag.corporationId ||
        (tag.taskType != null && String(tag.taskType).trim() !== '') ||
        (tag.taskTypeDetail != null && String(tag.taskTypeDetail).trim() !== ''))
    ) {
      return tag;
    }
  }
  return undefined;
}

function buildStillOnLines(
  open: TaskSegmentRow | undefined,
  tag: BlockTagRow | undefined,
  corpsById: Map<string, string>
): { headline: string; detail?: string } {
  if (!open) {
    return { headline: 'Still on this task?', detail: undefined };
  }

  const corpName = tag?.corporationId ? corpsById.get(tag.corporationId) : undefined;
  const typeStr = tag?.taskType
    ? formatTaskType(tag.taskType, tag.taskTypeDetail)
    : '';
  const titleStr = open.title?.trim() ?? '';

  let subject = typeStr || titleStr;
  if (!subject) {
    subject = corpName ? `work for ${corpName}` : 'this task';
  }

  const headline = `Still on “${subject}”?`;

  const detail =
    corpName && (typeStr || titleStr) ? `Corporation: ${corpName}` : undefined;

  return { headline, detail };
}

function safeGetCurrentWindow() {
  try {
    return getCurrentWebviewWindow();
  } catch {
    return null;
  }
}

const HEALTH_TIPS = [
  'Stand up for 30 seconds.',
  'Take one deep breath.',
  'Relax your shoulders.',
  'Stretch your neck gently.',
  'Blink and look far away for 20 seconds.',
  'Sip some water.',
  'Unclench your jaw.',
  'Do a quick wrist stretch.',
];

export default function TaskCheckInPanel() {
  const defaultNo = useMemo(() => readDefaultNo(), []);
  const [step, setStep] = useState<Step>(() => (defaultNo ? 'newTask' : 'ask'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didInitDbRef = useRef(false);

  const [segments, setSegments] = useState<TaskSegmentRow[]>([]);
  const [tags, setTags] = useState<BlockTagRow[]>([]);
  const [corporations, setCorporations] = useState<CorporationRow[]>([]);

  const [newCorpDraft, setNewCorpDraft] = useState('');
  const [showAddCorp, setShowAddCorp] = useState(false);
  const [corpId, setCorpId] = useState<string>('');
  const [taskSlug, setTaskSlug] = useState<string>('');
  const [detailDraft, setDetailDraft] = useState('');
  const [otherDraft, setOtherDraft] = useState('');

  const refreshContext = useCallback(async () => {
    if (!isTauri()) return;
    if (!didInitDbRef.current) {
      await invoke('db_init');
      didInitDbRef.current = true;
    }
    const [segRows, tagRows, corpRows] = await Promise.all([
      invoke<Record<string, unknown>[]>('db_list_task_segments'),
      invoke<Record<string, unknown>[]>('db_list_block_tags'),
      invoke<Record<string, unknown>[]>('db_list_corporations'),
    ]);
    setSegments(segRows.map(fromSegmentRow));
    setTags(tagRows.map(fromTagRow));
    setCorporations(corpRows.map(fromCorpRow));
  }, []);

  useEffect(() => {
    void refreshContext();
  }, [refreshContext]);

  useEffect(() => {
    if (!isTauri()) return;
    const tryPrepare = async () => {
      const w = safeGetCurrentWindow();
      if (!w) return;
      await prepareTaskCheckInWindow(w);
    };
    void tryPrepare().catch(() => {
      window.setTimeout(() => {
        void tryPrepare().catch(() => { });
      }, 250);
    });
  }, []);

  const corpsById = useMemo(
    () => new Map(corporations.map((c) => [c.id, c.name] as const)),
    [corporations]
  );

  const openSegment = useMemo(() => findOpenSegment(segments), [segments]);
  const openTag = useMemo(
    () => (openSegment ? findTagForSegment(tags, openSegment.id) : undefined),
    [tags, openSegment]
  );
  const defaultTagForForm = useMemo(
    () => openTag ?? findLastClosedSegmentTag(segments, tags),
    [openTag, segments, tags]
  );

  const didInitDefaultNo = useRef(false);
  const healthTip = useMemo(
    () => HEALTH_TIPS[Math.floor(Math.random() * HEALTH_TIPS.length)] ?? 'Stand up and stretch.',
    []
  );
  const { headline, detail } = useMemo(
    () => buildStillOnLines(openSegment, openTag, corpsById),
    [openSegment, openTag, corpsById]
  );

  const selectedTaskOpt = getTaskTypeOption(taskSlug || undefined);
  const isOther = taskSlug === OTHER_TASK_SLUG || taskSlug.startsWith('custom__');

  const canStartNewBlock = useMemo(() => {
    const corpOk = corpId.trim() !== '' || newCorpDraft.trim() !== '';
    const taskOk = taskSlug.trim() !== '';
    const detailOk = !selectedTaskOpt?.requiresDetail || detailDraft.trim() !== '';
    const otherOk = !isOther || otherDraft.trim() !== '';
    return corpOk && taskOk && detailOk && otherOk && !busy;
  }, [corpId, newCorpDraft, taskSlug, selectedTaskOpt?.requiresDetail, detailDraft, isOther, otherDraft, busy]);

  const [customTasks, setCustomTasks] = useState<string[]>([]);
  useEffect(() => {
    try {
      const v = localStorage.getItem('mvptime:customTasks');
      if (v) setCustomTasks(JSON.parse(v));
    } catch {
      // ignore
    }
  }, []);

  const closeWindow = async () => {
    if (!isTauri()) return;
    const w = safeGetCurrentWindow();
    if (!w) return;
    try {
      await w.close();
    } catch {
      try {
        await w.destroy();
      } catch {
        // ignore
      }
    }
  };

  const notifyMain = async () => {
    if (!isTauri()) return;
    try {
      await emit('task-checkin-answered', {});
    } catch {
      // ignore
    }
  };

  const onYes = async () => {
    if (!isTauri()) return;
    setBusy(true);
    setError(null);
    try {
      await invoke('db_task_checkin_yes', { nowIso: new Date().toISOString() });
      await notifyMain();
      await closeWindow();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSnooze30 = async () => {
    if (!isTauri()) return;
    setBusy(true);
    setError(null);
    try {
      try {
        localStorage.setItem(
          LS_TASK_CHECKIN_SNOOZE_UNTIL,
          String(Date.now() + 30 * 60 * 1000)
        );
      } catch {
        // ignore
      }
      await invoke('db_task_checkin_yes', { nowIso: new Date().toISOString() });
      await notifyMain();
      await closeWindow();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const goToNewTask = () => {
    setError(null);
    const tag = defaultTagForForm;
    setCorpId(tag?.corporationId ?? '');
    const prevSlug = tag?.taskType ?? '';
    setTaskSlug(prevSlug);
    if (prevSlug === OTHER_TASK_SLUG) {
      const detail = tag?.taskTypeDetail ?? '';
      setOtherDraft(detail);
      setDetailDraft('');
      if (detail) {
        setTaskSlug('custom__' + detail);
      } else {
        setTaskSlug(OTHER_TASK_SLUG);
      }
    } else {
      const opt = getTaskTypeOption(prevSlug);
      setDetailDraft(opt?.requiresDetail ? (tag?.taskTypeDetail ?? '') : '');
      setOtherDraft('');
    }
    setShowAddCorp(false);
    setNewCorpDraft('');
    setStep('newTask');
  };

  useEffect(() => {
    if (!defaultNo) return;
    if (step !== 'newTask') return;
    if (segments.length === 0) return;
    if (didInitDefaultNo.current) return;
    didInitDefaultNo.current = true;
    goToNewTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultNo, step, segments.length, defaultTagForForm]);

  const handleAddCorp = async () => {
    const name = newCorpDraft.trim();
    if (!name || !isTauri()) return;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await invoke('db_upsert_corporation', {
      corporation: { id, name, created_at: now },
    });
    setCorpId(id);
    setNewCorpDraft('');
    setShowAddCorp(false);
    await refreshContext();
  };

  const onConfirmNewTask = async () => {
    if (!isTauri()) return;
    if (!canStartNewBlock) {
      setError('Pick a corporation and task type to start a new block.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const nowIso = new Date().toISOString();
      const newSegmentId = crypto.randomUUID();

      let taskType: string | undefined = taskSlug || undefined;
      let taskTypeDetail: string | undefined;
      if (taskSlug === OTHER_TASK_SLUG || taskSlug.startsWith('custom__')) {
        taskType = OTHER_TASK_SLUG;
        taskTypeDetail = otherDraft.trim() || undefined;
        if (taskTypeDetail) {
          try {
            const existingRaw = localStorage.getItem('mvptime:customTasks');
            const existing = existingRaw ? JSON.parse(existingRaw) : [];
            if (!existing.includes(taskTypeDetail)) {
              const next = [...existing, taskTypeDetail];
              localStorage.setItem('mvptime:customTasks', JSON.stringify(next));
              setCustomTasks(next);
            }
          } catch {
            // ignore
          }
        }
      } else if (taskSlug) {
        const opt = getTaskTypeOption(taskSlug);
        taskTypeDetail = opt?.requiresDetail ? detailDraft.trim() || undefined : undefined;
      }

      let corpTrim = corpId.trim();
      const draftCorpName = newCorpDraft.trim();
      if (!corpTrim && draftCorpName) {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await invoke('db_upsert_corporation', {
          corporation: { id, name: draftCorpName, created_at: now },
        });
        corpTrim = id;
        setCorpId(id);
        setNewCorpDraft('');
        setShowAddCorp(false);
        await refreshContext();
      }
      await invoke('db_task_checkin_no', {
        newSegmentId,
        newTitle: null,
        nowIso,
        tagCorporationId: corpTrim ? corpTrim : null,
        tagTaskType: taskType ?? null,
        tagTaskTypeDetail: taskTypeDetail ?? null,
      });

      await notifyMain();
      await closeWindow();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-dvh max-h-dvh w-full overflow-hidden bg-[#0D0F14] text-white flex flex-col p-2">
      <div className="flex flex-col flex-1 min-h-0 w-full max-w-full rounded-xl border border-white/[0.08] bg-[#111318] p-3 shadow-xl">
        {step === 'ask' ? (
          <div className="flex flex-col flex-1 min-h-0 justify-center gap-3">
            <h1 className="text-[13px] font-semibold text-white leading-snug">{headline}</h1>
            {detail ? <p className="text-[10px] text-white/40 leading-snug">{detail}</p> : null}
            <p className="text-[10px] text-white/35 leading-snug">{healthTip}</p>
            <p className="text-[11px] text-white/45 leading-snug">
              <span className="text-white/65">Yes</span> — same block.{' '}
              <span className="text-white/65">No</span> — new block + tags.
            </p>
            {error ? <p className="text-[11px] text-red-400/90">{error}</p> : null}
            <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-row-reverse sm:justify-stretch pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onYes()}
                className="flex-1 rounded-lg bg-violet-500/90 py-2 text-[12px] font-medium text-white hover:bg-violet-500 disabled:opacity-40"
              >
                Yes, same task
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSnooze30()}
                className="flex-1 rounded-lg border border-white/[0.12] bg-white/[0.03] py-2 text-[12px] font-medium text-white/80 hover:bg-white/[0.06] disabled:opacity-40"
              >
                Snooze for 30mins
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={goToNewTask}
                className="flex-1 rounded-lg border border-white/[0.12] py-2 text-[12px] font-medium text-white/80 hover:bg-white/[0.06] disabled:opacity-40"
              >
                No, new task
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 gap-2">
            <div className="shrink-0 flex flex-col gap-0.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (defaultNo) {
                    void onYes();
                    return;
                  }
                  setError(null);
                  setStep('ask');
                }}
                className="self-start flex items-center gap-1 text-[10px] text-white/40 hover:text-white/65 disabled:opacity-40 -ml-0.5"
              >
                <ArrowLeft className="w-3 h-3" />
                {defaultNo ? 'Same task' : 'Back'}
              </button>
              <h1 className="text-[10px] font-semibold text-white">New task block</h1>
              {/* <p className="text-[10px] text-white/42 leading-snug">
                Corp + task type (bar label from task type).
              </p> */}
            </div>

            <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
              <div className="min-h-0 flex flex-col gap-1">
                <p className="text-[9px] text-white/38 uppercase tracking-wide shrink-0">Corporation</p>
                <select
                  value={corpId}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__add__') {
                      setShowAddCorp(true);
                      return;
                    }
                    setCorpId(v);
                  }}
                  disabled={busy}
                  className="app-select-dark w-full min-w-0 rounded-lg border border-white/[0.12] bg-[#0D0F14] px-1.5 py-1.5 text-[11px] text-zinc-100 focus:border-violet-500/50 focus:outline-none disabled:opacity-50 shrink-0"
                >
                  <option value="">— Corporation —</option>
                  {corporations.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__add__">+ Add…</option>
                </select>
                {showAddCorp ? (
                  <div className="flex gap-1 mt-1 shrink-0">
                    <input
                      type="text"
                      value={newCorpDraft}
                      onChange={(e) => setNewCorpDraft(e.target.value)}
                      placeholder="Name"
                      disabled={busy}
                      className="flex-1 min-w-0 rounded-lg border border-white/[0.12] bg-[#0D0F14] px-1.5 py-1 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/50 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={busy || !newCorpDraft.trim()}
                      onClick={() => void handleAddCorp()}
                      className="shrink-0 rounded-md bg-violet-500/25 px-2 py-1 text-[10px] font-medium text-violet-200 border border-violet-500/35 hover:bg-violet-500/35 disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex flex-col gap-1 flex-1">
                <p className="text-[9px] text-white/38 uppercase tracking-wide shrink-0">Task type</p>
                <select
                  value={taskSlug}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith('custom__')) {
                      setTaskSlug(v);
                      setOtherDraft(v.slice('custom__'.length));
                      setDetailDraft('');
                    } else {
                      setTaskSlug(v);
                      setDetailDraft('');
                      setOtherDraft('');
                    }
                  }}
                  disabled={busy}
                  className="app-select-dark w-full min-w-0 rounded-lg border border-white/[0.12] bg-[#0D0F14] px-1.5 py-1.5 text-[11px] text-zinc-100 focus:border-violet-500/50 focus:outline-none disabled:opacity-50 shrink-0"
                >
                  <option value="">— Task type —</option>
                  {customTasks.length > 0 && (
                    <optgroup label="Custom Tasks">
                      {customTasks.map((ct) => (
                        <option key={`ct-${ct}`} value={`custom__${ct}`}>
                          {ct}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {TASK_TYPES.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.label}
                    </option>
                  ))}
                  <option value={OTHER_TASK_SLUG}>{OTHER_TASK_LABEL}</option>
                </select>
                {selectedTaskOpt?.requiresDetail ? (
                  <input
                    type="text"
                    value={detailDraft}
                    onChange={(e) => setDetailDraft(e.target.value)}
                    disabled={busy}
                    placeholder={selectedTaskOpt.requiresDetail}
                    className="mt-1 w-full rounded-lg border border-white/[0.12] bg-[#0D0F14] px-1.5 py-1 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/50 focus:outline-none shrink-0"
                  />
                ) : null}
                {isOther ? (
                  <input
                    type="text"
                    value={otherDraft}
                    onChange={(e) => setOtherDraft(e.target.value)}
                    disabled={busy}
                    placeholder="Describe…"
                    className="mt-1 w-full rounded-lg border border-white/[0.12] bg-[#0D0F14] px-1.5 py-1 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/50 focus:outline-none shrink-0"
                  />
                ) : null}
              </div>
            </div>

            {error ? <p className="shrink-0 text-[10px] text-red-400/90">{error}</p> : null}

            <div className="shrink-0 pt-1">
              <button
                type="button"
                disabled={!canStartNewBlock}
                onClick={() => void onConfirmNewTask()}
                className="w-full rounded-lg bg-violet-500/90 py-2 text-[12px] font-medium text-white hover:bg-violet-500 disabled:opacity-40"
              >
                Start new block
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
