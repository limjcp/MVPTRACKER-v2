import { create } from 'zustand';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { AppSettings } from '../types/settings';

function isTauriRuntime() {
  return isTauri();
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  idleThreshold: 2,
  syncEnabled: true,
  calendarIntegration: true,
  menuBarWidget: true,
  showProductivityInMenuBar: true,
  defaultHourlyRate: 150,
  currency: 'USD',
  workingHoursStart: 9,
  workingHoursEnd: 18,
  trackingEnabled: true,
  exclusionList: ['1Password', 'Keychain', 'SecureInput'],
};

interface State {
  ready: boolean;
  settings: AppSettings;
  syncStatus: 'synced' | 'syncing' | 'error' | 'offline';
  hydrate: () => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => void;
  triggerSync: () => void;
}

export const useAdminSettingsStore = create<State>((set, get) => ({
  ready: false,
  settings: defaultSettings,
  syncStatus: 'offline',

  hydrate: async () => {
    if (!isTauriRuntime()) {
      set({ ready: true, settings: defaultSettings });
      return;
    }
    await invoke('db_init');
    const settingsJson = await invoke<string | null>('db_get_settings');
    const settings = settingsJson ? (JSON.parse(settingsJson) as AppSettings) : defaultSettings;
    if (!settingsJson) {
      await invoke('db_set_settings', { json: JSON.stringify(settings) });
    }
    set({ settings, ready: true });
  },

  updateSettings: (updates) => {
    const next = { ...get().settings, ...updates };
    set({ settings: next });
    if (isTauriRuntime()) void invoke('db_set_settings', { json: JSON.stringify(next) });
  },

  triggerSync: () => {
    set({ syncStatus: 'syncing' });
    setTimeout(() => set({ syncStatus: 'synced' }), 1500);
  },
}));
