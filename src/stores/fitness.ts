import { create } from 'zustand';
import { api } from '../lib/api';
import type { WeightLog, WorkoutLog, WorkoutLogInput } from '../types';
import { toDateStr } from '../lib/format';
import { useUiStore } from './ui';

/** 锻炼日志拉取窗口：近一年。 */
const LOG_DAYS_BACK = 371;

function logRange(): [string, string] {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - LOG_DAYS_BACK);
  return [toDateStr(from), toDateStr(today)];
}

/** 轻盈计划 store：体重全量（表很小）+ 近一年锻炼记录 + 目标/身高设置。 */
interface FitnessState {
  weights: WeightLog[];
  workouts: WorkoutLog[];
  goalWeight: number; // kg，0=未设置
  height: number; // cm，0=未设置
  load: () => Promise<void>;
  setGoalWeight: (kg: number) => Promise<void>;
  setHeight: (cm: number) => Promise<void>;
  upsertWeight: (date: string, weight: number) => Promise<void>;
  removeWeight: (id: string) => Promise<void>;
  createWorkout: (input: WorkoutLogInput) => Promise<void>;
  updateWorkout: (log: WorkoutLog) => Promise<void>;
  removeWorkout: (id: string) => Promise<void>;
}

export const useFitnessStore = create<FitnessState>((set) => ({
  weights: [],
  workouts: [],
  goalWeight: 0,
  height: 0,

  load: async () => {
    try {
      const [from, to] = logRange();
      const [weights, workouts, all] = await Promise.all([
        api.weightList(),
        api.workoutList(from, to),
        api.settingsAll(),
      ]);
      set({
        weights,
        workouts,
        goalWeight: Number(all.fitnessGoalWeight) || 0,
        height: Number(all.fitnessHeight) || 0,
      });
    } catch (e) {
      useUiStore.getState().toast(`加载轻盈计划失败：${e}`, 'error');
    }
  },

  setGoalWeight: async (kg) => {
    set({ goalWeight: kg });
    try {
      await api.settingsSet('fitnessGoalWeight', String(kg));
    } catch (e) {
      useUiStore.getState().toast(`保存目标失败：${e}`, 'error');
    }
  },

  setHeight: async (cm) => {
    set({ height: cm });
    try {
      await api.settingsSet('fitnessHeight', String(cm));
    } catch (e) {
      useUiStore.getState().toast(`保存身高失败：${e}`, 'error');
    }
  },

  upsertWeight: async (date, weight) => {
    try {
      const saved = await api.weightUpsert(date, weight);
      set((s) => ({
        weights: [...s.weights.filter((w) => w.date !== saved.date), saved].sort((a, b) =>
          a.date < b.date ? -1 : 1,
        ),
      }));
    } catch (e) {
      useUiStore.getState().toast(`记录体重失败：${e}`, 'error');
      throw e;
    }
  },

  removeWeight: async (id) => {
    try {
      await api.weightDelete(id);
      set((s) => ({ weights: s.weights.filter((w) => w.id !== id) }));
    } catch (e) {
      useUiStore.getState().toast(`删除体重记录失败：${e}`, 'error');
    }
  },

  createWorkout: async (input) => {
    try {
      const log = await api.workoutCreate(input);
      set((s) => ({ workouts: [log, ...s.workouts] }));
    } catch (e) {
      useUiStore.getState().toast(`记录锻炼失败：${e}`, 'error');
      throw e;
    }
  },

  updateWorkout: async (log) => {
    try {
      const saved = await api.workoutUpdate(log);
      set((s) => ({ workouts: s.workouts.map((w) => (w.id === saved.id ? saved : w)) }));
    } catch (e) {
      useUiStore.getState().toast(`保存锻炼失败：${e}`, 'error');
      throw e;
    }
  },

  removeWorkout: async (id) => {
    try {
      await api.workoutDelete(id);
      set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) }));
    } catch (e) {
      useUiStore.getState().toast(`删除锻炼记录失败：${e}`, 'error');
    }
  },
}));
