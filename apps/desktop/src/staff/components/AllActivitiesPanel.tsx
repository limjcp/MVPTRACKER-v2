import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { ActivityEntry, AppCategory } from '../types';
import { mergeAllAutomaticBySameWindowTitle } from '../utils/activityMerge';
import { APP_CATEGORY_ORDER, CATEGORY_HEX, CATEGORY_LABELS } from '../utils/appCategories';
import { cn } from '../utils/cn';
import { formatDuration } from '../utils/format';

type ViewMode = 'unified' | 'category' | 'chronological';

function detailLine(a: ActivityEntry): string {
  return a.filePath || a.url || a.windowTitle || '—';
}

export default function AllActivitiesPanel({
  selectedDate,
  activities,
  selectedActivityId,
  onSelectActivity,
}: {
  selectedDate: string;
  activities: ActivityEntry[];
  selectedActivityId: string | null;
  onSelectActivity: (id: string | null) => void;
}) {
  const [mode, setMode] = useState<ViewMode>('unified');
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [openApps, setOpenApps] = useState<Record<string, boolean>>({});

  const dayActivities = useMemo(
    () => activities.filter((a) => format(parseISO(a.startTime), 'yyyy-MM-dd') === selectedDate),
    [activities, selectedDate]
  );

  const displayActivities = useMemo(
    () => mergeAllAutomaticBySameWindowTitle(dayActivities),
    [dayActivities]
  );

  const totalSeconds = useMemo(
    () => displayActivities.reduce((s, a) => s + a.duration, 0),
    [displayActivities]
  );

  const tree = useMemo(() => {
    const byCat: Record<string, Record<string, ActivityEntry[]>> = {};
    for (const a of displayActivities) {
      const c = a.category;
      if (!byCat[c]) byCat[c] = {};
      if (!byCat[c][a.appName]) byCat[c][a.appName] = [];
      byCat[c][a.appName].push(a);
    }
    return byCat;
  }, [displayActivities]);

  const chronological = useMemo(
    () =>
      [...displayActivities].sort(
        (a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime()
      ),
    [displayActivities]
  );

  const toggleCat = (key: string) =>
    setOpenCategories((o) => ({ ...o, [key]: !o[key] }));
  const toggleApp = (key: string) =>
    setOpenApps((o) => ({ ...o, [key]: !o[key] }));

  return (
    <div className="flex flex-col h-full min-h-0 border-r border-white/[0.06] bg-[#0D0F14] w-[60%] shrink-0">
      <div className="px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-white font-semibold text-sm">All Activities</h2>
          <span className="text-white/40 text-xs tabular-nums">{formatDuration(totalSeconds)}</span>
        </div>
        <p className="text-white/25 text-[10px] mt-0.5">{format(parseISO(selectedDate + 'T12:00:00'), 'EEEE, MMM d')}</p>
        <div className="flex gap-1 mt-3 p-0.5 rounded-lg bg-white/[0.04]">
          {(['unified', 'category', 'chronological'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'flex-1 py-1.5 rounded-md text-[10px] font-medium transition-colors capitalize',
                mode === m ? 'bg-violet-500/25 text-violet-200' : 'text-white/35 hover:text-white/55'
              )}
            >
              {m === 'unified' ? 'Unified' : m === 'category' ? 'By category' : 'Chronological'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {displayActivities.length === 0 ? (
          <p className="text-white/30 text-xs px-4 py-6 text-center">No activities for this day. Tracking logs will appear here.</p>
        ) : mode === 'chronological' ? (
          <ul className="divide-y divide-white/[0.04]">
            {chronological.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onSelectActivity(selectedActivityId === a.id ? null : a.id)}
                  className={cn(
                    'w-full text-left px-4 py-2.5 hover:bg-white/[0.03] transition-colors',
                    selectedActivityId === a.id && 'bg-violet-500/10'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/50 text-[10px] font-mono tabular-nums">
                      {format(parseISO(a.startTime), 'HH:mm')}–{format(parseISO(a.endTime), 'HH:mm')}
                    </span>
                    <span className="text-white/35 text-[10px]">{formatDuration(a.duration)}</span>
                  </div>
                  <p className="text-white/80 text-xs font-medium truncate mt-0.5">{a.appName}</p>
                  <p className="text-white/35 text-[10px] truncate">{detailLine(a)}</p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="px-2 py-2 space-y-0.5">
            {APP_CATEGORY_ORDER.map((cat) => {
              const apps = tree[cat];
              if (!apps) return null;
              const catKey = cat;
              const catOpen = mode === 'unified' ? true : (openCategories[catKey] ?? true);
              const catLabel = CATEGORY_LABELS[cat as AppCategory] || cat;
              const dot = CATEGORY_HEX[cat as AppCategory] || '#9CA3AF';
              const catDur = Object.values(apps).flat().reduce((s, a) => s + a.duration, 0);
              return (
                <li key={catKey} className="rounded-lg border border-white/[0.04] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleCat(catKey)}
                    className="w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-white/[0.03]"
                  >
                    {catOpen ? <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />}
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />
                    <span className="flex-1 text-white/80 text-xs font-medium truncate">{catLabel}</span>
                    <span className="text-white/35 text-[10px] tabular-nums">{formatDuration(catDur)}</span>
                  </button>
                  {catOpen && (
                    <ul className="border-t border-white/[0.04] bg-black/20">
                      {Object.entries(apps).map(([appName, rows]) => {
                        const appKey = `${catKey}::${appName}`;
                        const appOpen = mode === 'unified' ? true : (openApps[appKey] ?? false);
                        const appDur = rows.reduce((s, a) => s + a.duration, 0);
                        return (
                          <li key={appKey}>
                            <button
                              type="button"
                              onClick={() => toggleApp(appKey)}
                              className="w-full flex items-center gap-2 pl-7 pr-2 py-1.5 text-left hover:bg-white/[0.03]"
                            >
                              {appOpen ? <ChevronDown className="w-3 h-3 text-white/25 shrink-0" /> : <ChevronRight className="w-3 h-3 text-white/25 shrink-0" />}
                              <span className="flex-1 text-white/60 text-[11px] truncate">{appName}</span>
                              <span className="text-white/30 text-[10px] tabular-nums">{formatDuration(appDur)}</span>
                            </button>
                            {appOpen && (
                              <ul className="border-t border-white/[0.03]">
                                {rows.map((a) => (
                                  <li key={a.id}>
                                    <button
                                      type="button"
                                      onClick={() => onSelectActivity(selectedActivityId === a.id ? null : a.id)}
                                      className={cn(
                                        'w-full text-left pl-11 pr-2 py-1.5 hover:bg-white/[0.04]',
                                        selectedActivityId === a.id && 'bg-violet-500/15'
                                      )}
                                    >
                                      <p className="text-white/45 text-[10px] truncate">{detailLine(a)}</p>
                                      <p className="text-white/25 text-[9px] mt-0.5 tabular-nums">
                                        {format(parseISO(a.startTime), 'HH:mm')} · {formatDuration(a.duration)}
                                      </p>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

