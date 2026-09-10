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
  /** 提前提醒分钟数：null=不提醒，0=准点，n=提前 n 分钟 */
  remindMinutesBefore: number | null;
  /** 重复规则：null=一次性；'daily'|'weekly'|'monthly'=完成时顺延生成下一单 */
  repeat: 'daily' | 'weekly' | 'monthly' | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  title: string;
  description?: string;
  priority?: number;
  dueAt?: string | null;
  status?: TaskStatus;
  remindMinutesBefore?: number | null;
  boardId?: string;
  repeat?: 'daily' | 'weekly' | 'monthly' | null;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteInput {
  title: string;
  content?: string;
}

export type LinkKind = 'url' | 'path' | 'command';

export interface Link {
  id: string;
  title: string;
  kind: LinkKind;
  target: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface LinkInput {
  title: string;
  kind: LinkKind;
  target: string;
}

export interface Board {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoardInput {
  name: string;
}

export type HabitFrequency = 'daily' | 'weekly' | 'monthly';

export interface Habit {
  id: string;
  name: string;
  frequency: HabitFrequency;
  /** 每日提醒时刻 'HH:MM'；null=不提醒 */
  reminder: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HabitInput {
  name: string;
  frequency?: HabitFrequency;
  reminder?: string | null;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  value: number; // 1=完成 0=未完成 2=跳过
}
