import { invoke } from '@tauri-apps/api/core';
import type { Task, TaskInput } from '../types';

export const api = {
  taskList: () => invoke<Task[]>('task_list'),
  taskCreate: (input: TaskInput) => invoke<Task>('task_create', { input }),
  taskUpdate: (task: Task) => invoke<Task>('task_update', { task }),
  taskDelete: (id: string) => invoke<void>('task_delete', { id }),
  settingsAll: () => invoke<Record<string, string>>('settings_all'),
  settingsSet: (key: string, value: string) => invoke<void>('settings_set', { key, value }),
  backupExport: (path: string) => invoke<void>('backup_export', { path }),
  backupImport: (path: string) => invoke<number>('backup_import', { path }),
};
