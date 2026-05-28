import { format, parseISO } from 'date-fns';
import { invoke, isTauri } from '@tauri-apps/api/core';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ActivityEntry, AppSettings, DailyStats, ManualEntry, Project } from '../types';
import { formatDuration } from './format';

export type ReportFormat = 'pdf' | 'xlsx' | 'csv' | 'html';
export type BillableCurrency = 'USD' | 'CAD' | 'PHP';

type BillableOverride = {
  billableRateOverride?: number | null;
  billableCurrencyOverride?: BillableCurrency | null;
};

export function getReportWindow(filteredStats: DailyStats[]): { startDate: string; endDate: string } | null {
  if (filteredStats.length === 0) return null;
  const dates = filteredStats.map((s) => s.date).sort();
  return { startDate: dates[0]!, endDate: dates[dates.length - 1]! };
}

function projectNameById(projects: Project[], id: string | undefined): string {
  if (!id) return '';
  return projects.find((p) => p.id === id)?.name ?? id;
}

/** Union of project ids that appear in any day's stats, stable order by first seen then name */
function projectColumnOrder(filteredStats: DailyStats[], projects: Project[]): Project[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const s of filteredStats) {
    for (const pid of Object.keys(s.projects)) {
      if (!seen.has(pid)) {
        seen.add(pid);
        order.push(pid);
      }
    }
  }
  const byId = new Map(projects.map((p) => [p.id, p]));
  return order
    .map((id) => byId.get(id))
    .filter((p): p is Project => Boolean(p))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface LineItemRow {
  date: string;
  kind: string;
  appOrSource: string;
  detail: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  projectName: string;
}

export function buildLineItems(
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  startDate: string,
  endDate: string,
  projects: Project[]
): LineItemRow[] {
  const rows: LineItemRow[] = [];

  for (const a of activities) {
    const d = format(parseISO(a.startTime), 'yyyy-MM-dd');
    if (d < startDate || d > endDate) continue;
    rows.push({
      date: d,
      kind: a.type,
      appOrSource: a.appName,
      detail: a.displayLabel?.trim() || a.windowTitle || a.url || a.filePath || '',
      startTime: a.startTime,
      endTime: a.endTime,
      durationSeconds: a.duration,
      projectName: projectNameById(projects, a.projectId),
    });
  }

  for (const m of manualEntries) {
    const d = format(parseISO(m.startTime), 'yyyy-MM-dd');
    if (d < startDate || d > endDate) continue;
    rows.push({
      date: d,
      kind: m.type,
      appOrSource: 'Manual entry',
      detail: m.title,
      startTime: m.startTime,
      endTime: m.endTime,
      durationSeconds: m.duration,
      projectName: projectNameById(projects, m.projectId),
    });
  }

  return rows.sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());
}

function escapeCsvCell(value: string | number): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(escapeCsvCell).join(',');
}

export function buildDailySummaryTable(
  filteredStats: DailyStats[],
  projects: Project[]
): { headers: string[]; rows: (string | number)[][] } {
  const projCols = projectColumnOrder(filteredStats, projects);
  const headers = [
    'date',
    'total_seconds',
    'productive_seconds',
    'unproductive_seconds',
    'idle_seconds',
    'productivity_score',
    ...projCols.map((p) => `project_hours_${sanitizeKey(p.name)}`),
  ];
  const rows: (string | number)[][] = filteredStats.map((s) => {
    const base: (string | number)[] = [
      s.date,
      s.totalTime,
      s.productiveTime,
      s.unproductiveTime,
      s.idleTime ?? 0,
      s.productivityScore,
    ];
    for (const p of projCols) {
      const secs = s.projects[p.id] ?? 0;
      base.push(Number((secs / 3600).toFixed(4)));
    }
    return base;
  });
  return { headers, rows };
}

function sanitizeKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40) || 'project';
}

export function reportFilenameBase(startDate: string, endDate: string): string {
  return `mvptime-report-${startDate}_to_${endDate}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** In the Tauri WebView, anchor downloads often do nothing; use a native save dialog instead. */
export async function saveReportBytes(filename: string, bytes: Uint8Array): Promise<void> {
  if (isTauri()) {
    await invoke('save_report_file', {
      defaultName: filename,
      contents: Array.from(bytes),
    });
    return;
  }
  downloadBlob(new Blob([new Uint8Array(bytes)]), filename);
}

export function downloadTextFile(
  filename: string,
  mime: string,
  body: string,
  options?: { utf8Bom?: boolean }
): void {
  const prefix = options?.utf8Bom ? '\uFEFF' : '';
  const blob = new Blob([`${prefix}${body}`], { type: `${mime};charset=utf-8` });
  downloadBlob(blob, filename);
}

async function saveTextReportFile(
  filename: string,
  body: string,
  options?: { utf8Bom?: boolean }
): Promise<void> {
  const prefix = options?.utf8Bom ? '\uFEFF' : '';
  const enc = new TextEncoder().encode(`${prefix}${body}`);
  await saveReportBytes(filename, enc);
}

/** Print HTML without `window.open` (blocked in embedded WebView2). */
export function printHtmlInHiddenFrame(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);
  const idoc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!idoc || !win) {
    iframe.remove();
    window.alert('Print is not available in this view.');
    return;
  }
  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };
  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } catch (e) {
      console.error(e);
      window.alert('Print failed. Check the console for details.');
    } finally {
      setTimeout(cleanup, 500);
    }
  };
  idoc.open();
  idoc.write(html);
  idoc.close();
  setTimeout(runPrint, 0);
}

export async function exportReportCsv(
  filteredStats: DailyStats[],
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  projects: Project[],
  window: { startDate: string; endDate: string }
): Promise<void> {
  const { headers, rows } = buildDailySummaryTable(filteredStats, projects);
  const lines: string[] = ['# Daily summary', csvRow(headers), ...rows.map(csvRow), '', '# Line items'];
  const lineHeaders = [
    'date',
    'kind',
    'app_or_source',
    'detail',
    'start_time',
    'end_time',
    'duration_seconds',
    'project',
  ];
  lines.push(csvRow(lineHeaders));
  const items = buildLineItems(activities, manualEntries, window.startDate, window.endDate, projects);
  for (const r of items) {
    lines.push(
      csvRow([
        r.date,
        r.kind,
        r.appOrSource,
        r.detail,
        r.startTime,
        r.endTime,
        r.durationSeconds,
        r.projectName,
      ])
    );
  }
  const base = reportFilenameBase(window.startDate, window.endDate);
  await saveTextReportFile(`${base}.csv`, lines.join('\n'), { utf8Bom: true });
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function exportReportHtml(
  filteredStats: DailyStats[],
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  projects: Project[],
  settings: AppSettings,
  window: { startDate: string; endDate: string },
  override?: BillableOverride
): Promise<void> {
  const { headers, rows } = buildDailySummaryTable(filteredStats, projects);
  const items = buildLineItems(activities, manualEntries, window.startDate, window.endDate, projects);
  const totalSec = filteredStats.reduce((s, d) => s + d.totalTime, 0);
  const productiveSec = filteredStats.reduce((s, d) => s + d.productiveTime, 0);
  const rate = override?.billableRateOverride ?? settings.defaultHourlyRate ?? 150;
  const currency = override?.billableCurrencyOverride ?? ((settings.currency as any) ?? 'USD');
  const est = ((totalSec / 3600) * rate).toFixed(2);

  const summaryRowsHtml = rows
    .map(
      (cells) =>
        `<tr>${cells.map((c) => `<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`
    )
    .join('');
  const summaryHeadHtml = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;

  const lineRowsHtml = items
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.kind)}</td><td>${escapeHtml(r.appOrSource)}</td><td>${escapeHtml(r.detail)}</td><td>${escapeHtml(r.startTime)}</td><td>${escapeHtml(r.endTime)}</td><td>${r.durationSeconds}</td><td>${escapeHtml(r.projectName)}</td></tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>MVP Tracker report</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #111; background: #fff; }
  h1 { font-size: 1.25rem; }
  .meta { color: #555; font-size: 0.875rem; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 28px; font-size: 0.8rem; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f3f4f6; }
  caption { text-align: left; font-weight: 600; margin-bottom: 8px; }
  @media print { body { margin: 12px; } }
</style>
</head>
<body>
  <h1>Time report</h1>
  <p class="meta">Range: <strong>${escapeHtml(window.startDate)}</strong> to <strong>${escapeHtml(window.endDate)}</strong><br/>
  Generated: ${escapeHtml(new Date().toISOString())}<br/>
  Totals: ${escapeHtml(formatDuration(totalSec))} tracked, ${escapeHtml(formatDuration(productiveSec))} productive.<br/>
  Estimated billable (${escapeHtml(currency)} @ ${rate}/hr): <strong>${escapeHtml(est)}</strong></p>

  <table>
    <caption>Daily summary</caption>
    <thead>${summaryHeadHtml}</thead>
    <tbody>${summaryRowsHtml}</tbody>
  </table>

  <table>
    <caption>Line items</caption>
    <thead><tr><th>Date</th><th>Kind</th><th>App / source</th><th>Detail</th><th>Start</th><th>End</th><th>Duration (s)</th><th>Project</th></tr></thead>
    <tbody>${lineRowsHtml || '<tr><td colspan="8">No rows</td></tr>'}</tbody>
  </table>
</body>
</html>`;

  const base = reportFilenameBase(window.startDate, window.endDate);
  await saveTextReportFile(`${base}.html`, html, { utf8Bom: false });
}

export async function exportReportXlsx(
  filteredStats: DailyStats[],
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  projects: Project[],
  window: { startDate: string; endDate: string }
): Promise<void> {
  const { headers, rows } = buildDailySummaryTable(filteredStats, projects);
  const wb = XLSX.utils.book_new();
  const summaryAoA = [headers, ...rows.map((r) => r.map((c) => c))];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryAoA);
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

  const items = buildLineItems(activities, manualEntries, window.startDate, window.endDate, projects);
  const lineHeaders = [
    'date',
    'kind',
    'app_or_source',
    'detail',
    'start_time',
    'end_time',
    'duration_seconds',
    'project',
  ];
  const lineAoA = [
    lineHeaders,
    ...items.map((r) => [
      r.date,
      r.kind,
      r.appOrSource,
      r.detail,
      r.startTime,
      r.endTime,
      r.durationSeconds,
      r.projectName,
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(lineAoA);
  XLSX.utils.book_append_sheet(wb, ws2, 'Activities');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const base = reportFilenameBase(window.startDate, window.endDate);
  await saveReportBytes(`${base}.xlsx`, new Uint8Array(out));
}

export async function exportReportPdf(
  filteredStats: DailyStats[],
  activities: ActivityEntry[],
  manualEntries: ManualEntry[],
  projects: Project[],
  settings: AppSettings,
  window: { startDate: string; endDate: string },
  override?: BillableOverride
): Promise<void> {
  const { headers, rows } = buildDailySummaryTable(filteredStats, projects);
  const items = buildLineItems(activities, manualEntries, window.startDate, window.endDate, projects);
  const totalSec = filteredStats.reduce((s, d) => s + d.totalTime, 0);
  const rate = override?.billableRateOverride ?? settings.defaultHourlyRate ?? 150;
  const currency = override?.billableCurrencyOverride ?? ((settings.currency as any) ?? 'USD');
  const est = ((totalSec / 3600) * rate).toFixed(2);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text('MVP Tracker — time report', 14, 16);
  doc.setFontSize(9);
  doc.text(`Range: ${window.startDate} to ${window.endDate}`, 14, 22);
  doc.text(`Generated: ${new Date().toISOString()}`, 14, 27);
  doc.text(`Estimated billable (${currency} @ ${rate}/hr): ${est}`, 14, 32);

  const head = [headers.map((h) => h.replace(/_/g, ' '))];
  const body = rows.map((r) => r.map((c) => String(c)));

  autoTable(doc, {
    head: head,
    body: body,
    startY: 36,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [55, 48, 163] },
    margin: { left: 14, right: 14 },
  });

  const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  const yAfter = docWithTable.lastAutoTable?.finalY ?? 50;

  doc.setFontSize(10);
  doc.text('Line items', 14, yAfter + 8);

  const lineHead = [['Date', 'Kind', 'Source', 'Detail', 'Start', 'End', 'Sec', 'Project']];
  const lineBody = items.map((r) => [
    r.date,
    r.kind,
    r.appOrSource.slice(0, 28),
    r.detail.slice(0, 40),
    r.startTime.slice(0, 19),
    r.endTime.slice(0, 19),
    String(r.durationSeconds),
    r.projectName.slice(0, 20),
  ]);

  autoTable(doc, {
    head: lineHead,
    body: lineBody,
    startY: yAfter + 12,
    styles: { fontSize: 6, cellPadding: 1 },
    headStyles: { fillColor: [16, 185, 129] },
    margin: { left: 14, right: 14 },
  });

  const base = reportFilenameBase(window.startDate, window.endDate);
  const buf = doc.output('arraybuffer') as ArrayBuffer;
  await saveReportBytes(`${base}.pdf`, new Uint8Array(buf));
}

export function buildTimesheetPrintHtml(
  filteredStats: DailyStats[],
  _activities: ActivityEntry[],
  _manualEntries: ManualEntry[],
  _projects: Project[],
  settings: AppSettings,
  window: { startDate: string; endDate: string },
  override?: BillableOverride
): string {
  const totalSec = filteredStats.reduce((s, d) => s + d.totalTime, 0);
  const totalProductiveSec = filteredStats.reduce((s, d) => s + d.productiveTime, 0);
  const rate = override?.billableRateOverride ?? settings.defaultHourlyRate ?? 150;
  const currency = override?.billableCurrencyOverride ?? ((settings.currency as any) ?? 'USD');
  const est = ((totalSec / 3600) * rate).toFixed(2);

  const dailyRows = filteredStats
    .map(
      (s) =>
        `<tr><td>${escapeHtml(format(parseISO(s.date), 'EEE, MMM d'))}</td><td>${escapeHtml(formatDuration(s.totalTime))}</td><td>${escapeHtml(formatDuration(s.productiveTime))}</td><td>${s.productivityScore}%</td></tr>`
    )
    .join('');

  const totalRow = `<tr><td><strong>${escapeHtml('Total')}</strong></td><td><strong>${escapeHtml(formatDuration(totalSec))}</strong></td><td><strong>${escapeHtml(formatDuration(totalProductiveSec))}</strong></td><td>—</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Print timesheet</title>
<style>
body{font-family:system-ui,sans-serif;margin:16px;color:#111}
table{border-collapse:collapse;width:100%;margin-top:12px;font-size:12px}
th,td{border:1px solid #999;padding:6px;text-align:left}
th{background:#eee}
tfoot td{background:#f3f4f6;font-weight:600}
h1{font-size:18px}
.meta{color:#444;font-size:12px;margin:8px 0}
@media print{body{margin:0}}
</style></head><body>
<h1>Daily timesheet</h1>
<p class="meta">${escapeHtml(window.startDate)} to ${escapeHtml(window.endDate)} · Est. ${escapeHtml(currency)} ${escapeHtml(est)} @ ${rate}/hr</p>
<table><thead><tr><th>Date</th><th>Total</th><th>Productive</th><th>Score</th></tr></thead><tbody>${dailyRows}</tbody><tfoot>${totalRow}</tfoot></table>
</body></html>`;
}
