import type { AppCategory, Project, ProjectColor } from '../types';

/** Title hints that override generic browser → Communication (e.g. Gmail in Firefox). */
const COMM_TITLE_RE =
  /gmail|google mail|outlook|office 365|mail -| - mail|inbox|slack|discord|zoom\b|microsoft teams|\bteams\b|meet\.google|webex|whatsapp|telegram|signal|linkedin|outlook web|messages -/i;

export function inferSystemProjectName(
  appName: string,
  windowTitle: string,
  category: AppCategory
): string {
  const tl = windowTitle.trim();
  if (COMM_TITLE_RE.test(tl)) return 'Communication';

  if (category === 'communication') return 'Communication';
  if (category === 'browser') return 'Browsing';
  if (category === 'ide' || category === 'editor') return 'Coding';
  if (category === 'office') return 'Office';
  if (category === 'graphics') return 'Design';
  if (category === 'video' || category === 'media') return 'Media';
  if (category === 'reading') return 'Reading';
  if (category === 'productivity') return 'Productivity';
  if (category === 'system') return 'System';
  if (category === 'tools') return 'Tools';
  return 'Other';
}

export function resolveProjectIdForSystemName(
  inferredName: string,
  projects: Project[]
): string | undefined {
  const low = inferredName.trim().toLowerCase();
  return projects.find((x) => x.name.trim().toLowerCase() === low)?.id;
}

type SystemProjectSpec = {
  name: string;
  color: ProjectColor;
  icon: string;
  productivityScore: number;
};

export const SYSTEM_PROJECT_SPECS: ReadonlyArray<SystemProjectSpec> = [
  { name: 'Browsing', color: 'blue', icon: '🌐', productivityScore: 55 },
  { name: 'Coding', color: 'indigo', icon: '💻', productivityScore: 88 },
  { name: 'Communication', color: 'orange', icon: '💬', productivityScore: 60 },
  { name: 'Office', color: 'yellow', icon: '📝', productivityScore: 70 },
  { name: 'Design', color: 'pink', icon: '🎨', productivityScore: 72 },
  { name: 'Media', color: 'red', icon: '▶️', productivityScore: 35 },
  { name: 'Reading', color: 'teal', icon: '📖', productivityScore: 50 },
  { name: 'Productivity', color: 'green', icon: '✅', productivityScore: 75 },
  { name: 'System', color: 'purple', icon: '⚙️', productivityScore: 20 },
  { name: 'Tools', color: 'cyan', icon: '🔧', productivityScore: 65 },
  { name: 'Other', color: 'indigo', icon: '📦', productivityScore: 45 },
];

export function buildSystemProjectRow(spec: SystemProjectSpec): Project {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: spec.name,
    color: spec.color,
    icon: spec.icon,
    productivityScore: spec.productivityScore,
    totalTime: 0,
    createdAt: now,
    scope: 'private',
  };
}
