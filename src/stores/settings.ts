import { create } from 'zustand';
import { api } from '../lib/api';
import type { ThemeMode } from '../lib/theme';
import { MODULES } from '../modules/registry';
import { useUiStore } from './ui';

interface SettingsState {
  enabledModules: string[];
  theme: ThemeMode;
  load: () => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  setTheme: (t: ThemeMode) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  enabledModules: MODULES.filter((m) => m.defaultEnabled).map((m) => m.id),
  theme: 'system',
  load: async () => {
    try {
      const all = await api.settingsAll();
      const enabled = all.enabledModules
        ? (JSON.parse(all.enabledModules) as string[])
        : undefined;
      const theme = (all.theme as ThemeMode) || 'system';
      set({ enabledModules: enabled ?? get().enabledModules, theme });
    } catch (e) {
      useUiStore.getState().toast(`加载设置失败：${e}`, 'error');
    }
  },
  setEnabled: async (id, enabled) => {
    const next = enabled
      ? Array.from(new Set([...get().enabledModules, id]))
      : get().enabledModules.filter((x) => x !== id);
    set({ enabledModules: next });
    await api.settingsSet('enabledModules', JSON.stringify(next));
  },
  setTheme: async (t) => {
    set({ theme: t });
    await api.settingsSet('theme', t);
  },
}));
