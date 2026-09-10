import { create } from 'zustand';
import { api } from '../lib/api';
import type { Habit, HabitInput, HabitLog } from '../types';
import { toDateStr } from '../lib/format';
import { useUiStore } from './ui';

/** 热力图与统计拉取的日志区间：近一年。 */
const LOG_DAYS_BACK = 371;

interface HabitsState {
  habits: Habit[];
  logs: HabitLog[];
  selectedId: string | null;
  load: () => Promise<void>;
  create: (input: HabitInput) => Promise<void>;
  update: (habit: Habit) => Promise<void>;
  remove: (id: string) => Promise<void>;
  toggle: (id: string, date?: string) => Promise<void>;
  select: (id: string) => void;
}

function logRange(): [string, string] {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - LOG_DAYS_BACK);
  return [toDateStr(from), toDateStr(today)];
}

export const useHabitsStore = create<HabitsState>((set) => ({
  habits: [],
  logs: [],
  selectedId: null,

  load: async () => {
    try {
      const [from, to] = logRange();
      const [habits, logs] = await Promise.all([api.habitList(), api.habitLogs(from, to)]);
      set((s) => ({
        habits,
        logs,
        selectedId:
          s.selectedId && habits.some((h) => h.id === s.selectedId)
            ? s.selectedId
            : habits[0]?.id ?? null,
      }));
    } catch (e) {
      useUiStore.getState().toast(`加载习惯失败：${e}`, 'error');
    }
  },

  create: async (input) => {
    try {
      const h = await api.habitCreate(input);
      set((s) => ({ habits: [...s.habits, h], selectedId: h.id }));
    } catch (e) {
      useUiStore.getState().toast(`新建习惯失败：${e}`, 'error');
      throw e;
    }
  },

  update: async (habit) => {
    try {
      const saved = await api.habitUpdate(habit);
      set((s) => ({ habits: s.habits.map((h) => (h.id === saved.id ? saved : h)) }));
    } catch (e) {
      useUiStore.getState().toast(`保存习惯失败：${e}`, 'error');
      throw e;
    }
  },

  remove: async (id) => {
    try {
      await api.habitDelete(id);
      set((s) => {
        const habits = s.habits.filter((h) => h.id !== id);
        return {
          habits,
          logs: s.logs.filter((l) => l.habitId !== id),
          selectedId: s.selectedId === id ? habits[0]?.id ?? null : s.selectedId,
        };
      });
    } catch (e) {
      useUiStore.getState().toast(`删除习惯失败：${e}`, 'error');
    }
  },

  toggle: async (id, date) => {
    const d = date ?? toDateStr(new Date());
    try {
      const result = await api.habitToggle(id, d);
      set((s) => ({
        logs: result
          ? [...s.logs.filter((l) => !(l.habitId === id && l.date === d)), result]
          : s.logs.filter((l) => !(l.habitId === id && l.date === d)),
      }));
    } catch (e) {
      useUiStore.getState().toast(`打卡失败：${e}`, 'error');
    }
  },

  select: (id) => set({ selectedId: id }),
}));
