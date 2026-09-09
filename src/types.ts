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
