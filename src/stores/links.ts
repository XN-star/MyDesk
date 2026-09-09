import { create } from 'zustand';
import { api } from '../lib/api';
import type { Link, LinkInput } from '../types';
import { applyLinkMove } from '../features/links/links';
import { useUiStore } from './ui';

interface LinksState {
  links: Link[];
  load: () => Promise<void>;
  create: (input: LinkInput) => Promise<void>;
  update: (link: Link) => Promise<void>;
  remove: (id: string) => Promise<void>;
  move: (id: string, targetIndex: number) => Promise<void>;
  open: (link: Link) => Promise<void>;
}

export const useLinksStore = create<LinksState>((set, get) => ({
  links: [],

  load: async () => {
    try {
      set({ links: await api.linkList() });
    } catch (e) {
      useUiStore.getState().toast(`加载快捷入口失败：${e}`, 'error');
    }
  },

  create: async (input) => {
    try {
      const l = await api.linkCreate(input);
      set((s) => ({ links: [...s.links, l] }));
    } catch (e) {
      useUiStore.getState().toast(`新建快捷入口失败：${e}`, 'error');
      throw e;
    }
  },

  update: async (link) => {
    const before = get().links;
    set((s) => ({ links: s.links.map((l) => (l.id === link.id ? link : l)) }));
    try {
      const saved = await api.linkUpdate(link);
      set((s) => ({ links: s.links.map((l) => (l.id === saved.id ? saved : l)) }));
    } catch (e) {
      set({ links: before });
      useUiStore.getState().toast(`保存快捷入口失败：${e}`, 'error');
      throw e;
    }
  },

  remove: async (id) => {
    try {
      await api.linkDelete(id);
      set((s) => ({ links: s.links.filter((l) => l.id !== id) }));
    } catch (e) {
      useUiStore.getState().toast(`删除快捷入口失败：${e}`, 'error');
    }
  },

  move: async (id, targetIndex) => {
    const r = applyLinkMove(get().links, id, targetIndex);
    if (!r) return;
    const before = get().links;
    set({ links: r.next });
    try {
      await api.linkMove(id, r.sortOrder);
    } catch (e) {
      set({ links: before });
      useUiStore.getState().toast(`排序保存失败：${e}`, 'error');
    }
  },

  open: async (link) => {
    try {
      if (link.kind === 'command') await api.linkRun(link.id);
      else await api.linkOpen(link.kind, link.target);
    } catch (e) {
      useUiStore.getState().toast(`打开失败：${e}`, 'error');
    }
  },
}));
