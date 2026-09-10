import { create } from 'zustand';
import { api } from '../lib/api';
import type { Note } from '../types';
import { dailyNoteTitle, findDailyNote, sortNotes } from '../features/notes/notes';
import { useUiStore } from './ui';

const AUTOSAVE_DELAY_MS = 1000;

interface NotesState {
  notes: Note[];
  selectedId: string | null;
  saving: 'idle' | 'pending' | 'saving';
  load: () => Promise<void>;
  select: (id: string) => Promise<void>;
  create: () => Promise<string>;
  edit: (id: string, patch: Partial<Pick<Note, 'title' | 'content'>>) => void;
  togglePin: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  flush: () => Promise<void>;
  openOrCreateDaily: (date: string) => Promise<void>;
}

// 防抖计时器与待保存笔记 id 存在模块级（单实例应用，无需放 state）。
let timer: ReturnType<typeof setTimeout> | null = null;
let dirtyId: string | null = null;

function cancelPending() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const id = dirtyId;
  dirtyId = null;
  return id;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  selectedId: null,
  saving: 'idle',

  load: async () => {
    try {
      const notes = await api.noteList();
      set((s) => ({
        notes,
        selectedId:
          s.selectedId && notes.some((n) => n.id === s.selectedId)
            ? s.selectedId
            : notes[0]?.id ?? null,
      }));
    } catch (e) {
      useUiStore.getState().toast(`加载笔记失败：${e}`, 'error');
    }
  },

  select: async (id) => {
    await get().flush();
    set({ selectedId: id });
  },

  create: async () => {
    await get().flush();
    try {
      const n = await api.noteCreate({ title: '', content: '' });
      set((s) => ({ notes: sortNotes([n, ...s.notes]), selectedId: n.id }));
      return n.id;
    } catch (e) {
      useUiStore.getState().toast(`新建笔记失败：${e}`, 'error');
      throw e;
    }
  },

  edit: (id, patch) => {
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      saving: 'pending',
    }));
    dirtyId = id;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void get().flush();
    }, AUTOSAVE_DELAY_MS);
  },

  flush: async () => {
    const id = cancelPending();
    if (!id) return;
    const note = get().notes.find((n) => n.id === id);
    if (!note) return;
    set({ saving: 'saving' });
    try {
      const saved = await api.noteUpdate(note);
      set((s) => ({
        notes: sortNotes(s.notes.map((n) => (n.id === saved.id ? saved : n))),
        saving: 'idle',
      }));
    } catch (e) {
      set({ saving: 'idle' });
      useUiStore.getState().toast(`保存笔记失败：${e}`, 'error');
    }
  },

  togglePin: async (id) => {
    await get().flush();
    const note = get().notes.find((n) => n.id === id);
    if (!note) return;
    const next = { ...note, pinned: !note.pinned };
    set((s) => ({ notes: sortNotes(s.notes.map((n) => (n.id === id ? next : n))) }));
    try {
      const saved = await api.noteUpdate(next);
      set((s) => ({ notes: sortNotes(s.notes.map((n) => (n.id === saved.id ? saved : n))) }));
    } catch (e) {
      useUiStore.getState().toast(`置顶失败：${e}`, 'error');
      set((s) => ({ notes: sortNotes(s.notes.map((n) => (n.id === id ? note : n))) }));
    }
  },

  remove: async (id) => {
    if (dirtyId === id) cancelPending();
    try {
      await api.noteDelete(id);
    } catch (e) {
      useUiStore.getState().toast(`删除笔记失败：${e}`, 'error');
      return;
    }
    set((s) => {
      const notes = s.notes.filter((n) => n.id !== id);
      return {
        notes,
        selectedId: s.selectedId === id ? notes[0]?.id ?? null : s.selectedId,
      };
    });
  },

  openOrCreateDaily: async (date) => {
    await get().flush();
    try {
      await get().load();
    } catch {
      // load 内部已 toast，继续用当前数据兜底
    }
    const existing = findDailyNote(get().notes, date);
    if (existing) {
      set({ selectedId: existing.id });
      return;
    }
    try {
      const n = await api.noteCreate({ title: dailyNoteTitle(date), content: '' });
      set((s) => ({ notes: sortNotes([n, ...s.notes]), selectedId: n.id }));
    } catch (e) {
      useUiStore.getState().toast(`创建每日笔记失败：${e}`, 'error');
    }
  },
}));
