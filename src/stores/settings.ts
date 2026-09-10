import { create } from 'zustand';
import { api } from '../lib/api';
import type { ThemeMode } from '../lib/theme';
import { MODULE_META } from '../modules/meta';
import { useUiStore } from './ui';

/** v0.1 出厂默认模块。老用户升级时以此区分「新模块」与「旧默认」，避免覆盖用户禁用选择。 */
const LEGACY_DEFAULT_MODULES = ['tasks', 'calendar'];

/** 把尚未向用户展示过的默认启用模块并入 enabled 并打标；无变化返回 null。 */
export function mergeNewDefaultModules(
  enabled: string[],
  merged: string[],
  modules: Array<{ id: string; defaultEnabled: boolean }>,
): { enabled: string[]; merged: string[] } | null {
  const toMerge = modules.filter(
    (m) => m.defaultEnabled && !merged.includes(m.id) && !enabled.includes(m.id),
  );
  if (toMerge.length === 0) return null;
  return {
    enabled: Array.from(new Set([...enabled, ...toMerge.map((m) => m.id)])),
    merged: Array.from(new Set([...merged, ...toMerge.map((m) => m.id)])),
  };
}

interface SettingsState {
  enabledModules: string[];
  theme: ThemeMode;
  load: () => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  setTheme: (t: ThemeMode) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  enabledModules: MODULE_META.filter((m) => m.defaultEnabled).map((m) => m.id),
  theme: 'system',
  load: async () => {
    try {
      const all = await api.settingsAll();
      const stored = all.enabledModules
        ? (JSON.parse(all.enabledModules) as string[])
        : undefined;
      const merged: string[] = all.mergedDefaultModules
        ? (JSON.parse(all.mergedDefaultModules) as string[])
        : LEGACY_DEFAULT_MODULES;
      const enabled = stored ?? get().enabledModules;
      const result = mergeNewDefaultModules(enabled, merged, MODULE_META);
      if (result) {
        await api.settingsSet('enabledModules', JSON.stringify(result.enabled));
        await api.settingsSet('mergedDefaultModules', JSON.stringify(result.merged));
      }
      set({
        enabledModules: result?.enabled ?? enabled,
        theme: (all.theme as ThemeMode) || 'system',
      });
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
