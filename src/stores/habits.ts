import { create } from 'zustand';
import { api } from '../lib/api';
import type { Habit, HabitInput, HabitLog } from '../types';
import { toDateStr } from '../lib/format';
import { useUiStore } from './ui';
import { hitMilestone, streak } from '../features/habits/habits';

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
      // 仅新打卡时检查仪式感反馈（取消打卡不庆祝）
      if (result) void checkCelebration(d);
    } catch (e) {
      useUiStore.getState().toast(`打卡失败：${e}`, 'error');
    }
  },

  select: (id) => set({ selectedId: id }),
}));

/** 打卡庆祝事件 detail：习惯 id 与当前连续天数。 */
export interface HabitCelebration {
  habitId: string;
  streakDays: number;
  milestone: number | null;
  allDone: boolean;
}

/** 打卡庆祝事件名：页面组件监听后喷发粒子。 */
export const HABIT_CELEBRATION_EVENT = 'habit:celebrated';

/**
 * 打卡后的仪式感检查（toggle 成功且新打卡时调用）：
 * 里程碑 toast + 全部完成 toast；粒子由事件监听方喷发。
 */
async function checkCelebration(date: string): Promise<void> {
  const { habits, logs } = useHabitsStore.getState();
  const habitId = habits
    .map((h) => h.id)
    .find((hid) => logs.some((l) => l.habitId === hid && l.date === date && l.value === 1));
  // toggle 的调用方刚写入日志，此刻 logs 一定包含该条；保险起见找不到就跳过
  if (!habitId) return;
  const habitLogs = logs.filter((l) => l.habitId === habitId);
  const days = streak(habitLogs, date);
  const milestone = hitMilestone(days);
  const ui = useUiStore.getState();
  if (milestone) {
    ui.toast(`🎉 连续 ${milestone} 天，坚持住了！`, 'info');
  }
  // 全部完成彩蛋：所有未归档习惯当日均已打卡
  const allDone =
    habits.length > 0 &&
    habits.every((h) =>
      logs.some((l) => l.habitId === h.id && l.date === date && l.value === 1),
    );
  if (allDone && habits.length > 1) {
    ui.toast('今日全部打卡完成，太棒了！', 'info');
  }
  window.dispatchEvent(
    new CustomEvent<HabitCelebration>(HABIT_CELEBRATION_EVENT, {
      detail: { habitId, streakDays: days, milestone, allDone },
    }),
  );
}
