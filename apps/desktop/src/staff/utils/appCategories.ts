import type { AppCategory } from '../types';

/** Display order for filters and grouped views. */
export const APP_CATEGORY_ORDER: AppCategory[] = [
  'browser',
  'office',
  'tools',
  'graphics',
  'ide',
  'editor',
  'productivity',
  'communication',
  'media',
  'video',
  'reading',
  'system',
  'other',
];

export const CATEGORY_LABELS: Record<AppCategory, string> = {
  browser: 'Browsers',
  office: 'Office / Writing',
  tools: 'Tools',
  graphics: 'Graphics & Illustration',
  ide: 'IDEs',
  editor: 'Editors',
  productivity: 'Productivity',
  communication: 'Communication & Call Tracking',
  media: 'Media',
  video: 'Video Editing & DAWs',
  reading: 'Reading',
  system: 'System',
  other: 'Other',
};

/** Dot / chart colors per category. */
export const CATEGORY_HEX: Record<AppCategory, string> = {
  browser: '#3B82F6',
  office: '#F59E0B',
  tools: '#78716C',
  graphics: '#EC4899',
  ide: '#6366F1',
  editor: '#8B5CF6',
  productivity: '#10B981',
  communication: '#F97316',
  media: '#EF4444',
  video: '#A855F7',
  reading: '#14B8A6',
  system: '#6B7280',
  other: '#9CA3AF',
};

const VALID = new Set<string>(APP_CATEGORY_ORDER);

/** Map pre-change DB values into the current taxonomy. */
const LEGACY_CATEGORY_MAP: Record<string, AppCategory> = {
  development: 'editor',
  design: 'graphics',
  entertainment: 'media',
  browser: 'browser',
  communication: 'communication',
  productivity: 'productivity',
  system: 'system',
  other: 'other',
};

export function normalizeStoredCategory(raw: unknown): AppCategory {
  const s = String(raw ?? 'other').toLowerCase();
  const mapped = LEGACY_CATEGORY_MAP[s] ?? (VALID.has(s) ? (s as AppCategory) : undefined);
  return mapped ?? 'other';
}

function normProcess(name: string): string {
  return name.trim().toLowerCase().replace(/\.exe$/i, '');
}

function anySub(p: string, needles: string[]): boolean {
  return needles.some((n) => p.includes(n));
}

/**
 * Classify foreground activity from process name (and optionally window title).
 * Unknown apps → `other`. Empty process → `system`.
 */
export function inferAppCategory(appName: string, windowTitle = ''): AppCategory {
  const p = normProcess(appName);
  const t = windowTitle.trim().toLowerCase();

  if (!p) return 'system';

  // In-browser search surfaces (still browsers)
  if (
    (t.includes('google search') || t.includes('duckduckgo')) &&
    anySub(p, ['chrome', 'chromium', 'msedge', 'microsoft edge', 'edge', 'firefox', 'brave', 'safari', 'arc', 'vivaldi', 'opera', 'yandex'])
  ) {
    return 'browser';
  }

  // IDEs (before editors — avoid classifying IntelliJ as “editor”)
  if (
    anySub(p, [
      'pycharm',
      'intellij',
      'idea64',
      'webstorm',
      'phpstorm',
      'rubymine',
      'clion',
      'goland',
      'rider',
      'datagrip',
      'appcode',
      'androidstudio',
      'studio64',
      'xcode',
      'eclipse',
      'netbeans',
      'devenv',
      'wdexpress',
      'rstudio',
      'jcreator',
      'nova',
      'coda',
    ])
  ) {
    return 'ide';
  }

  // Editors
  if (
    anySub(p, [
      'code -',
      'code-insiders',
      'vscodium',
      'cursor',
      'windsurf',
      'antigravity',
      'trae',
      'atom',
      'sublime',
      'textmate',
      'bbedit',
      'textwrangler',
      'vim',
      'nvim',
      'gvim',
      'macvim',
      'emacs',
      'aquamacs',
      'notepad++',
      'brackets',
      'kate',
      'zed',
      'textedit',
      'smultron',
      'fraise',
      'oxygen',
      'csedit',
    ]) ||
    p === 'code'
  ) {
    return 'editor';
  }

  // Video editing & DAWs
  if (
    anySub(p, [
      'premiere',
      'afterfx',
      'after effects',
      'davinci',
      'resolve',
      'final cut',
      'fcpx',
      'vegas',
      'houdini',
      'nuke',
      'maya',
      'cinema',
      'c4d',
      'blender',
      'ableton',
      'logic',
      'pro tools',
      'media composer',
      'audition',
      'rush',
      'avid',
      'fl studio',
      'fl64',
      'reaper',
      'cubase',
      'garageband',
      'frame.io',
      'frameio',
    ])
  ) {
    return 'video';
  }

  // Graphics & illustration
  if (
    anySub(p, [
      'sketch',
      'photoshop',
      'illustrator',
      'indesign',
      'lightroom',
      'acorn',
      'gimp',
      'inkscape',
      'affinity',
      'pixelmator',
      'figma',
      'canva',
      'vectorworks',
      'coreldraw',
      'photopad',
    ])
  ) {
    return 'graphics';
  }

  // Office / writing
  if (
    anySub(p, [
      'winword',
      'excel',
      'powerpnt',
      'msaccess',
      'mspub',
      'onenote',
      'soffice',
      'libreoffice',
      'openoffice',
      'ooffice',
      'word',
      'textmaker',
      'freeoffice',
      'scrivener',
      'marsedit',
      'nisus',
      'bean',
      'texshop',
      'caret',
      'mweb',
      'byword',
      'ulysses',
      'agenda',
      'notion',
      'ia writer',
      'acrobat',
      'acroread',
      'pdf expert',
      'pdfx',
      'skim',
      'pages',
      'numbers',
      'keynote',
      'iwork',
    ])
  ) {
    return 'office';
  }

  // Reading (dedicated readers; Skim also office-adjacent — prefer reading for Skim app)
  if (anySub(p, ['djview', 'sumatrapdf', 'preview']) || p === 'skim') {
    return 'reading';
  }

  // Media players / streaming clients
  if (
    anySub(p, [
      'vlc',
      'mpv',
      'iina',
      'quicktime',
      'itunes',
      'music',
      'spotify',
      'mplayer',
      'foobar',
      'netflix',
      'prime video',
      'youtube',
      'pocket casts',
      'podcasts',
    ])
  ) {
    return 'media';
  }

  // Productivity / notes / VMs (before communication — avoids `linear` matching `line`)
  if (
    anySub(p, [
      'obsidian',
      'evernote',
      'devonthink',
      'parallels',
      'prl_client',
      'prl_tools',
      'vmware',
      'virtualbox',
      'vboxsvc',
      'teamviewer',
      'anydesk',
      'omnioutliner',
      'mindnode',
      'ithoughts',
      'outline',
      'scapple',
      'things3',
      'things',
      'omnifocus',
      'todoist',
      'ticktick',
      'trello',
      'asana',
      'linear',
      'clickup',
      'notion calendar',
      'goodnotes',
      'notability',
      'notes',
      'bear',
      'craft',
    ])
  ) {
    return 'productivity';
  }

  // LINE messenger (don’t substring-match `line` — would catch `linear`)
  if (p === 'line' || p.startsWith('line-')) {
    return 'communication';
  }

  // Communication & calls
  if (
    anySub(p, [
      'slack',
      'teams',
      'ms-teams',
      'zoom',
      'discord',
      'telegram',
      'whatsapp',
      'skype',
      'outlook',
      'thunderbird',
      'mimestream',
      'spark',
      'webex',
      'ringcentral',
      'wechat',
      'signal',
      'mattermost',
      'adium',
      'postbox',
      'airmail',
      'mailmate',
      'mailplane',
      'whereby',
      'gotomeeting',
      'bluejeans',
      'facetime',
      'messages',
      'viber',
      'element',
      'msteams',
    ]) ||
    p === 'mail'
  ) {
    return 'communication';
  }

  // Browsers
  if (
    anySub(p, [
      'chrome',
      'chromium',
      'msedge',
      'microsoft edge',
      'firefox',
      'waterfox',
      'librewolf',
      'brave',
      'vivaldi',
      'opera',
      'safari',
      'arc',
      'orion',
      'yandex',
      'tor browser',
      'duckduckgo',
      'sidekick',
      'comet',
    ])
  ) {
    return 'browser';
  }

  // Tools / file / dev utilities
  if (
    anySub(p, [
      'finder',
      'explorer',
      'terminal',
      'iterm',
      'console',
      'powershell',
      'pwsh',
      'cmd',
      'windowsterminal',
      'wt.exe',
      'hyper',
      'tabby',
      'warp',
      'sourcetree',
      'fork',
      'gitkraken',
      'github desktop',
      'cyberduck',
      'filezilla',
      'winscp',
      'transmit',
      'yummy',
      'ingredients',
      'x11',
      'xquartz',
      'chronosync',
      'remotix',
      'docker desktop',
      'postman',
      'insomnia',
      'base',
      'git-gui',
      'tortoisegit',
    ]) ||
    p === 'wt' ||
    p === 'git'
  ) {
    return 'tools';
  }

  return 'other';
}
