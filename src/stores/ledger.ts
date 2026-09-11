import { create } from 'zustand';
import { api } from '../lib/api';
import type { LedgerEntry, LedgerEntryInput, LedgerKind } from '../types';
import { monthOf, toDateStr } from '../lib/format';
import { useUiStore } from './ui';

/** 记账 store：月视图——entries 为当前所选月份的记录，切月重拉区间。 */
interface LedgerState {
  entries: LedgerEntry[];
  /** 当前月份 'YYYY-MM' */
  month: string;
  budget: number; // 分
  load: (month?: string) => Promise<void>;
  setMonth: (month: string) => Promise<void>;
  setBudget: (cents: number) => Promise<void>;
  create: (input: LedgerEntryInput) => Promise<void>;
  update: (entry: LedgerEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function monthRange(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate(); // 该月天数
  const p = (n: number) => String(n).padStart(2, '0');
  return [`${month}-${p(1)}`, `${month}-${p(last)}`];
}

export const useLedgerStore = create<LedgerState>((set, get) => ({
  entries: [],
  month: monthOf(toDateStr(new Date())),
  budget: 0,

  load: async (month) => {
    const target = month ?? get().month;
    try {
      const all = await api.settingsAll();
      const [from, to] = monthRange(target);
      const [entries, budgetStr] = await Promise.all([
        api.ledgerList(from, to),
        Promise.resolve(all.ledgerBudget ?? '0'),
      ]);
      const budget = Number(budgetStr) || 0;
      set({ entries, month: target, budget });
    } catch (e) {
      useUiStore.getState().toast(`加载账本失败：${e}`, 'error');
    }
  },

  setMonth: async (month) => {
    if (month === get().month) return;
    await get().load(month);
  },

  setBudget: async (cents) => {
    const prev = get().budget;
    set({ budget: cents });
    try {
      await api.settingsSet('ledgerBudget', String(cents));
    } catch (e) {
      set({ budget: prev });
      useUiStore.getState().toast(`保存预算失败：${e}`, 'error');
    }
  },

  create: async (input) => {
    try {
      const entry = await api.ledgerCreate(input);
      // 只把当前月份的记录并入视图；跨月记录下月再看
      if (monthOf(entry.date) === get().month) {
        set((s) => ({ entries: [entry, ...s.entries] }));
      }
    } catch (e) {
      useUiStore.getState().toast(`记一笔失败：${e}`, 'error');
      throw e;
    }
  },

  update: async (entry) => {
    try {
      const saved = await api.ledgerUpdate(entry);
      set((s) => ({ entries: s.entries.map((e) => (e.id === saved.id ? saved : e)) }));
    } catch (e) {
      useUiStore.getState().toast(`保存记录失败：${e}`, 'error');
      throw e;
    }
  },

  remove: async (id) => {
    try {
      await api.ledgerDelete(id);
      set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    } catch (e) {
      useUiStore.getState().toast(`删除记录失败：${e}`, 'error');
    }
  },
}));

export type { LedgerKind };
