import React, { useState } from 'react';
import {
  Shield,
  Cloud,
  Clock,
  Database,
  Cpu,
  Monitor,
  Lock,
  ChevronRight,
  Check,
  Globe,
  Plus,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { useAdminSettingsStore } from '../store/useAdminSettingsStore';
import { cn } from '../utils/cn';

type SettingsTab = 'general' | 'tracking' | 'privacy' | 'sync' | 'integrations' | 'about';

const TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General', icon: Monitor },
  { id: 'tracking', label: 'Tracking', icon: Clock },
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'sync', label: 'Sync & Backup', icon: Cloud },
  { id: 'integrations', label: 'Integrations', icon: Globe },
  { id: 'about', label: 'About', icon: Cpu },
];

export default function Settings() {
  const { settings, updateSettings, syncStatus, triggerSync } = useAdminSettingsStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [newExclusion, setNewExclusion] = useState('');

  const addExclusion = () => {
    if (newExclusion.trim()) {
      updateSettings({ exclusionList: [...settings.exclusionList, newExclusion.trim()] });
      setNewExclusion('');
    }
  };

  const removeExclusion = (item: string) => {
    updateSettings({ exclusionList: settings.exclusionList.filter((e) => e !== item) });
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#0D0F14]">
      <div className="w-52 border-r border-white/[0.06] bg-[#0D0F14] py-6 flex-shrink-0">
        <div className="px-4 mb-4">
          <h2 className="text-white text-lg font-semibold">Settings</h2>
          <p className="text-white/30 text-xs mt-0.5">Staff app preferences (shared DB)</p>
        </div>
        <nav className="px-2 space-y-0.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all',
                  activeTab === tab.id
                    ? 'bg-violet-500/20 text-violet-300'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.05]'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === 'general' && (
          <div className="max-w-xl space-y-6">
            <h3 className="text-white text-lg font-semibold">General Settings</h3>

            <SettingSection title="Appearance">
              <div className="flex items-center gap-2">
                {(['light', 'dark', 'system'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateSettings({ theme: t })}
                    className={cn(
                      'flex-1 py-2 rounded-xl border text-xs font-medium transition-all capitalize',
                      settings.theme === t
                        ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                        : 'bg-white/[0.04] border-white/[0.06] text-white/40 hover:text-white/60'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </SettingSection>

            <SettingSection title="Billing">
              <div className="space-y-3">
                <div>
                  <label className="text-white/40 text-[11px] block mb-1.5">Default Hourly Rate</label>
                  <div className="flex items-center gap-2">
                    <span className="text-white/40 text-sm">$</span>
                    <input
                      type="number"
                      value={settings.defaultHourlyRate}
                      onChange={(e) => updateSettings({ defaultHourlyRate: Number(e.target.value) })}
                      className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
                    />
                    <span className="text-white/40 text-sm">/hr</span>
                  </div>
                </div>
                <div>
                  <label className="text-white/40 text-[11px] block mb-1.5">Currency</label>
                  <select
                    value={settings.currency}
                    onChange={(e) => updateSettings({ currency: e.target.value })}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="CAD">CAD ($)</option>
                    <option value="AUD">AUD ($)</option>
                  </select>
                </div>
              </div>
            </SettingSection>

            <SettingSection title="Working Hours">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/40 text-[11px] block mb-1.5">Start</label>
                  <input
                    type="time"
                    value={`${String(settings.workingHoursStart).padStart(2, '0')}:00`}
                    onChange={(e) => updateSettings({ workingHoursStart: parseInt(e.target.value.split(':')[0], 10) })}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
                  />
                </div>
                <div>
                  <label className="text-white/40 text-[11px] block mb-1.5">End</label>
                  <input
                    type="time"
                    value={`${String(settings.workingHoursEnd).padStart(2, '0')}:00`}
                    onChange={(e) => updateSettings({ workingHoursEnd: parseInt(e.target.value.split(':')[0], 10) })}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
                  />
                </div>
              </div>
            </SettingSection>
          </div>
        )}

        {activeTab === 'tracking' && (
          <div className="max-w-xl space-y-6">
            <h3 className="text-white text-lg font-semibold">Tracking Settings</h3>

            <SettingSection title="Automatic Tracking">
              <Toggle
                label="Enable automatic tracking"
                description="Track apps, documents, and websites automatically"
                value={settings.trackingEnabled}
                onChange={(v) => updateSettings({ trackingEnabled: v })}
              />
              <Toggle
                label="Show menu bar widget"
                description="Display current session time in the menu bar"
                value={settings.menuBarWidget}
                onChange={(v) => updateSettings({ menuBarWidget: v })}
              />
              <Toggle
                label="Show productivity score in menu bar"
                description="Real-time productivity feedback in menu bar"
                value={settings.showProductivityInMenuBar}
                onChange={(v) => updateSettings({ showProductivityInMenuBar: v })}
              />
            </SettingSection>

            <SettingSection title="Idle Detection">
              <div>
                <label className="text-white/40 text-[11px] block mb-2">
                  Mark as idle after {settings.idleThreshold} minutes of inactivity
                </label>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={settings.idleThreshold}
                  onChange={(e) => updateSettings({ idleThreshold: Number(e.target.value) })}
                  className="w-full accent-violet-500"
                />
                <div className="flex justify-between text-[10px] text-white/20 mt-1">
                  <span>1 min</span><span>30 min</span>
                </div>
              </div>
            </SettingSection>

            <SettingSection title="Calendar Integration">
              <Toggle
                label="Enable calendar integration"
                description="Show and record calendar events in the timeline"
                value={settings.calendarIntegration}
                onChange={(v) => updateSettings({ calendarIntegration: v })}
              />
            </SettingSection>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="max-w-xl space-y-6">
            <h3 className="text-white text-lg font-semibold">Privacy Settings</h3>

            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-start gap-3">
              <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-emerald-400 text-xs font-medium">Privacy First</p>
                <p className="text-white/40 text-xs mt-1">All tracking data is stored locally in SQLite. Data only leaves your device if you enable cloud sync.</p>
              </div>
            </div>

            <SettingSection title="App Exclusion List">
              <p className="text-white/30 text-xs mb-3">Apps and websites added here will never be tracked.</p>
              <div className="space-y-2 mb-3">
                {settings.exclusionList.map((item) => (
                  <div key={item} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    <Lock className="w-3 h-3 text-white/30" />
                    <span className="flex-1 text-white/60 text-xs">{item}</span>
                    <button
                      type="button"
                      onClick={() => removeExclusion(item)}
                      className="w-5 h-5 rounded-md hover:bg-red-500/20 flex items-center justify-center text-white/20 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newExclusion}
                  onChange={(e) => setNewExclusion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addExclusion()}
                  placeholder="Add app or URL pattern..."
                  className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-xs placeholder-white/20 focus:outline-none focus:border-violet-500/50"
                />
                <button
                  type="button"
                  onClick={addExclusion}
                  className="px-3 py-2 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-400 hover:bg-violet-500/30 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </SettingSection>

            <SettingSection title="Private Browsing">
              <p className="text-white/40 text-xs">Private/incognito browser tabs are automatically discarded and never tracked.</p>
              <div className="mt-3 flex items-center gap-2 text-emerald-400 text-xs">
                <Check className="w-3.5 h-3.5" />
                <span>Incognito protection is always enabled</span>
              </div>
            </SettingSection>
          </div>
        )}

        {activeTab === 'sync' && (
          <div className="max-w-xl space-y-6">
            <h3 className="text-white text-lg font-semibold">Sync & Backup</h3>

            <SettingSection title="Supabase Cloud Sync">
              <Toggle
                label="Enable cloud sync"
                description="Sync tracking data across all devices via Supabase"
                value={settings.syncEnabled}
                onChange={(v) => updateSettings({ syncEnabled: v })}
              />
              {settings.syncEnabled && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="text-white/40 text-[11px] block mb-1.5">Supabase URL</label>
                    <input
                      type="text"
                      defaultValue="https://xyzproject.supabase.co"
                      className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white/60 text-sm focus:outline-none focus:border-violet-500/50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-white/40 text-[11px] block mb-1.5">Anon Key</label>
                    <input
                      type="password"
                      defaultValue="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white/60 text-sm focus:outline-none focus:border-violet-500/50 font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={triggerSync}
                    disabled={syncStatus === 'syncing'}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                  >
                    <RefreshCw className={cn('w-3.5 h-3.5', syncStatus === 'syncing' && 'animate-spin')} />
                    {syncStatus === 'syncing' ? 'Syncing…' : 'Sync Now'}
                  </button>
                </div>
              )}
            </SettingSection>

            <SettingSection title="Local Database">
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
                  <span className="text-white/50 text-xs">Storage Engine</span>
                  <span className="text-white/70 text-xs font-medium flex items-center gap-1.5">
                    <Database className="w-3 h-3" />SQLite (shared MVPTracker folder)
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
                  <span className="text-white/50 text-xs">Database Location</span>
                  <span className="text-white/30 text-[10px] font-mono text-right max-w-[200px]">
                    %LOCALAPPDATA%\MVPTracker\mvptracker.sqlite3
                  </span>
                </div>
              </div>
            </SettingSection>
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="max-w-xl space-y-6">
            <h3 className="text-white text-lg font-semibold">Integrations</h3>

            <div className="space-y-3">
              {[
                { name: 'Zapier', desc: 'Connect to 5,000+ apps without code', icon: '⚡', status: 'available', badge: 'Popular' },
                { name: 'GrandTotal', desc: 'Import billable hours as invoice items', icon: '💰', status: 'available', badge: null },
                { name: 'Web API', desc: 'REST API for custom integrations', icon: '🔌', status: 'active', badge: 'v2.0' },
                { name: 'Linear', desc: 'Sync time entries with Linear issues', icon: '📐', status: 'available', badge: null },
                { name: 'Jira', desc: 'Log work against Jira tickets', icon: '🎯', status: 'coming-soon', badge: 'Soon' },
                { name: 'Harvest', desc: 'Push time to Harvest invoicing', icon: '🌿', status: 'available', badge: null },
                { name: 'Toggl', desc: 'Import from or export to Toggl', icon: '⏱️', status: 'available', badge: null },
              ].map((integration) => (
                <div key={integration.name} className="flex items-center gap-4 px-4 py-4 rounded-xl bg-[#161920] border border-white/[0.05] hover:border-white/[0.08] transition-all">
                  <span className="text-2xl leading-none">{integration.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-white/80 text-sm font-medium">{integration.name}</p>
                      {integration.badge && (
                        <span className={cn(
                          'px-1.5 py-0.5 rounded-md text-[9px] font-semibold',
                          integration.status === 'coming-soon'
                            ? 'bg-white/10 text-white/30'
                            : integration.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-violet-500/20 text-violet-400'
                        )}>
                          {integration.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-white/30 text-xs mt-0.5">{integration.desc}</p>
                  </div>
                  <button
                    type="button"
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      integration.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : integration.status === 'coming-soon'
                        ? 'bg-white/[0.04] text-white/20 cursor-not-allowed'
                        : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/70'
                    )}
                    disabled={integration.status === 'coming-soon'}
                  >
                    {integration.status === 'active' ? '✓ Connected' : integration.status === 'coming-soon' ? 'Coming Soon' : 'Connect'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'about' && (
          <div className="max-w-xl space-y-6">
            <h3 className="text-white text-lg font-semibold">About MVPTracker</h3>

            <div className="flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-br from-violet-500/10 to-blue-600/10 border border-violet-500/20">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-900/40">
                <Clock className="w-7 h-7 text-white" />
              </div>
              <div>
                <h4 className="text-white font-semibold text-lg">MVPTracker</h4>
                <p className="text-white/40 text-sm">Admin · shared settings with Staff</p>
                <p className="text-violet-400 text-xs mt-1">Version 2.0.0</p>
              </div>
            </div>

            <SettingSection title="Tech Stack">
              <div className="space-y-2">
                {[
                  { label: 'Frontend', value: 'React 19 + Vite + Tailwind CSS 4', icon: '⚛️' },
                  { label: 'Desktop Runtime', value: 'Tauri v2', icon: '🦀' },
                  { label: 'Local Database', value: 'SQLite (rusqlite)', icon: '🗄️' },
                ].map(({ label, value, icon }) => (
                  <div key={label} className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
                    <span className="text-sm w-6">{icon}</span>
                    <span className="text-white/40 text-xs w-36">{label}</span>
                    <span className="text-white/70 text-xs font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </SettingSection>

            <div className="flex gap-2">
              <button type="button" className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.06] text-white/50 text-sm hover:bg-white/[0.1] transition-colors flex items-center justify-center gap-2">
                <Globe className="w-4 h-4" />Privacy Policy
              </button>
              <button type="button" className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.06] text-white/50 text-sm hover:bg-white/[0.1] transition-colors flex items-center justify-center gap-2">
                <ChevronRight className="w-4 h-4" />Check for Updates
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#161920] rounded-2xl p-5 border border-white/[0.05] space-y-4">
      <h4 className="text-white/60 text-xs font-semibold uppercase tracking-wider">{title}</h4>
      {children}
    </div>
  );
}

function Toggle({ label, description, value, onChange }: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <p className="text-white/70 text-sm">{label}</p>
        {description && <p className="text-white/30 text-xs mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          'w-10 h-5.5 rounded-full transition-all flex-shrink-0 relative mt-0.5',
          value ? 'bg-violet-500' : 'bg-white/10'
        )}
        style={{ height: '22px', width: '40px' }}
      >
        <div
          className={cn(
            'absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-all',
            value ? 'left-[18px]' : 'left-0.5'
          )}
          style={{ width: '18px', height: '18px' }}
        />
      </button>
    </div>
  );
}
