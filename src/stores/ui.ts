import { create } from 'zustand';
import type { TaskStatus } from '../types';

export type Drawer = { mode: 'create'; status: TaskStatus } | { mode: 'edit'; taskId: string } | null;

export interface Toast {
  id: number;
  msg: string;
  kind: 'info' | 'error';
}

interface UiState {
  activePage: string;
  drawer: Drawer;
  toasts: Toast[];
  setPage: (p: string) => void;
  openCreate: (status: TaskStatus) => void;
  openTask: (id: string) => void;
  closeDrawer: () => void;
  toast: (msg: string, kind?: 'info' | 'error') => void;
  dismiss: (id: number) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>((set, get) => ({
  activePage: 'tasks',
  drawer: null,
  toasts: [],
  setPage: (p) => set({ activePage: p }),
  openCreate: (status) => set({ drawer: { mode: 'create', status } }),
  openTask: (id) => set({ drawer: { mode: 'edit', taskId: id } }),
  closeDrawer: () => set({ drawer: null }),
  toast: (msg, kind = 'info') => {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts, { id, msg, kind }] });
    setTimeout(() => get().dismiss(id), 3500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
