export type TaskStatus = 'todo' | 'doing' | 'done';

export interface Task {
  id: string;
  boardId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: number; // 0=低 1=中 2=高 3=紧急
  dueAt: string | null;
  sortOrder: number;
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  title: string;
  description?: string;
  priority?: number;
  dueAt?: string | null;
  status?: TaskStatus;
}

export interface EventItem {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  timeStart: string | null; // HH:MM
  timeEnd: string | null;
  note: string;
  createdAt: string;
}

export interface EventInput {
  title: string;
  date: string;
  timeStart?: string | null;
  timeEnd?: string | null;
  note?: string;
}
