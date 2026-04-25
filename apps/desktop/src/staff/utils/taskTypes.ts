/**
 * Canonical list of task types shown in the 15-min bucket detail panel.
 * `requiresDetail` triggers a secondary text input (e.g., department).
 * `'other'` is appended at the picker level so users can free-type unlisted work.
 */
export interface TaskTypeOption {
  slug: string;
  label: string;
  /** When set, picker reveals a labelled secondary input bound to BlockTag.taskTypeDetail. */
  requiresDetail?: string;
}

export const TASK_TYPES: readonly TaskTypeOption[] = [
  { slug: 'responding_to_emails', label: 'Responding to emails' },
  { slug: 'communicating_with_vendors', label: 'Communicating with vendors' },
  {
    slug: 'communicating_with_other_staff',
    label: 'Communicating with other staff',
    requiresDetail: 'Department',
  },
  { slug: 'training', label: 'Training' },
  { slug: 'research', label: 'Research' },
  { slug: 'filing', label: 'Filing' },
  { slug: 'accounting', label: 'Accounting' },
  { slug: 'bookkeeping', label: 'Bookkeeping' },
  { slug: 'drafting_notices', label: 'Drafting notices' },
  { slug: 'working_with_vendors', label: 'Working with vendors' },
  { slug: 'working_with_lawyers', label: 'Working with lawyers' },
  { slug: 'working_with_engineers', label: 'Working with engineers' },
  { slug: 'working_with_managers', label: 'Working with managers' },
  {
    slug: 'site_walk',
    label: 'Site walk with board / manager / owner / vendor / engineer',
  },
] as const;

export const OTHER_TASK_SLUG = 'other';
export const OTHER_TASK_LABEL = 'Other (type your own)';

const TASK_TYPE_BY_SLUG: Record<string, TaskTypeOption> = Object.fromEntries(
  TASK_TYPES.map((t) => [t.slug, t])
);

export function getTaskTypeOption(slug: string | undefined): TaskTypeOption | undefined {
  if (!slug) return undefined;
  return TASK_TYPE_BY_SLUG[slug];
}

export function formatTaskType(slug: string | undefined, detail?: string): string {
  if (!slug) return '';
  if (slug === OTHER_TASK_SLUG) return detail?.trim() || 'Other';
  const opt = TASK_TYPE_BY_SLUG[slug];
  if (!opt) return detail?.trim() || slug;
  if (opt.requiresDetail && detail?.trim()) {
    return `${opt.label} — ${detail.trim()}`;
  }
  return opt.label;
}
