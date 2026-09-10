import { create } from 'zustand';
import { api } from '../lib/api';
import type { RunningTimer } from '../types';
import { useUiStore } from './ui';

interface TimerState {
  running: RunningTimer | null;
  load: () => Promise<void>;
  start: (taskId: string) => Promise<void>;
  stop: () => Promise<void>;
}

export const useTimerStore = create<TimerState>((set) => ({
  running: null,

  load: async () => {
    try {
      set({ running: await api.timerStatus() });
    } catch {
      // 心跳失败静默，下一轮重试
    }
  },

  start: async (taskId) => {
    try {
      await api.timerStart(taskId);
      await useTimerStore.getState().load();
    } catch (e) {
      useUiStore.getState().toast(`开始计时失败：${e}`, 'error');
    }
  },

  stop: async () => {
    try {
      await api.timerStop();
      set({ running: null });
    } catch (e) {
      useUiStore.getState().toast(`停止计时失败：${e}`, 'error');
    }
  },
}));
