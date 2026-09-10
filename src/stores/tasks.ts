import { create } from 'zustand';
import { api } from '../lib/api';
import type { Task, TaskInput, TaskStatus } from '../types';
import { applyMove } from '../features/tasks/dnd';
import { nextOccurrence } from '../features/tasks/repeat';
import { fromDate } from '../lib/format';
import { useUiStore } from './ui';

interface TaskState {
  tasks: Task[];
  load: () => Promise<void>;
  create: (input: TaskInput) => Promise<Task>;
  update: (task: Task) => Promise<void>;
  remove: (id: string) => Promise<void>;
  move: (taskId: string, status: TaskStatus, index: number) => Promise<void>;
  /** 完成任务；repeat 任务顺延生成下一单（返回新任务，普通任务返回 null）。 */
  complete: (task: Task) => Promise<Task | null>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  load: async () => {
    try {
      set({ tasks: await api.taskList() });
    } catch (e) {
      useUiStore.getState().toast(`加载任务失败：${e}`, 'error');
    }
  },
  create: async (input) => {
    const t = await api.taskCreate(input);
    set({ tasks: [...get().tasks, t] });
    return t;
  },
  update: async (task) => {
    try {
      const t = await api.taskUpdate(task);
      set({ tasks: get().tasks.map((x) => (x.id === t.id ? t : x)) });
    } catch (e) {
      useUiStore.getState().toast(`保存任务失败：${e}`, 'error');
      throw e;
    }
  },
  remove: async (id) => {
    await api.taskDelete(id);
    set({ tasks: get().tasks.filter((t) => t.id !== id) });
  },
  move: async (taskId, status, index) => {
    const next = applyMove(get().tasks, taskId, status, index);
    if (next === get().tasks) return;
    set({ tasks: next });
    const changed = next.find((t) => t.id === taskId);
    if (changed) {
      try {
        await api.taskUpdate(changed);
      } catch (e) {
        useUiStore.getState().toast(`保存移动失败：${e}`, 'error');
        await useTaskStore.getState().load();
      }
    }
  },
  complete: async (task) => {
    await get().update({
      ...task,
      status: 'done',
      doneAt: fromDate(new Date()),
    });
    const nextDue = nextOccurrence(task.dueAt, task.repeat);
    if (!nextDue) return null;
    return await get().create({
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueAt: nextDue,
      remindMinutesBefore: task.remindMinutesBefore,
      boardId: task.boardId,
      repeat: task.repeat,
    });
  },
}));
