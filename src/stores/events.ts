import { create } from 'zustand';
import { api } from '../lib/api';
import { monthOf, toDateStr } from '../lib/format';
import type { EventInput, EventItem } from '../types';
import { useUiStore } from './ui';

interface EventState {
  events: EventItem[]; // 已加载的当前月份
  month: string;
  loadMonth: (month?: string) => Promise<void>;
  create: (input: EventInput) => Promise<void>;
  update: (e: EventItem) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  month: monthOf(toDateStr(new Date())),
  loadMonth: async (month) => {
    const m = month ?? get().month;
    try {
      set({ month: m, events: await api.eventListMonth(m) });
    } catch (e) {
      useUiStore.getState().toast(`加载日程失败：${e}`, 'error');
    }
  },
  create: async (input) => {
    const e = await api.eventCreate(input);
    if (monthOf(e.date) === get().month) set({ events: [...get().events, e] });
  },
  update: async (e) => {
    await api.eventUpdate(e);
    set({ events: get().events.map((x) => (x.id === e.id ? e : x)) });
  },
  remove: async (id) => {
    await api.eventDelete(id);
    set({ events: get().events.filter((e) => e.id !== id) });
  },
}));
