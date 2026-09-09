import { create } from 'zustand';
import { api } from '../lib/api';
import type { Board } from '../types';
import { useTaskStore } from './tasks';
import { useUiStore } from './ui';

interface BoardsState {
  boards: Board[];
  activeBoardId: string;
  load: () => Promise<void>;
  setActive: (id: string) => void;
  create: (name: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useBoardsStore = create<BoardsState>((set) => ({
  boards: [],
  activeBoardId: 'default',

  load: async () => {
    try {
      const boards = await api.boardList();
      set((s) => ({
        boards,
        activeBoardId: boards.some((b) => b.id === s.activeBoardId)
          ? s.activeBoardId
          : boards[0]?.id ?? 'default',
      }));
    } catch (e) {
      useUiStore.getState().toast(`加载看板失败：${e}`, 'error');
    }
  },

  setActive: (id) => set({ activeBoardId: id }),

  create: async (name) => {
    try {
      const b = await api.boardCreate({ name });
      set((s) => ({ boards: [...s.boards, b], activeBoardId: b.id }));
    } catch (e) {
      useUiStore.getState().toast(`新建看板失败：${e}`, 'error');
      throw e;
    }
  },

  rename: async (id, name) => {
    try {
      const saved = await api.boardRename(id, name);
      set((s) => ({ boards: s.boards.map((b) => (b.id === id ? saved : b)) }));
    } catch (e) {
      useUiStore.getState().toast(`重命名失败：${e}`, 'error');
      throw e;
    }
  },

  remove: async (id) => {
    try {
      await api.boardDelete(id);
    } catch (e) {
      useUiStore.getState().toast(`删除看板失败：${e}`, 'error');
      return;
    }
    set((s) => ({
      boards: s.boards.filter((b) => b.id !== id),
      activeBoardId: s.activeBoardId === id ? 'default' : s.activeBoardId,
    }));
    await useTaskStore.getState().load();
  },
}));
