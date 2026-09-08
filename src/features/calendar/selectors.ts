import type { Task } from '../../types';
import { dateOf } from '../../lib/format';

/** 某天的条目：按 due_at 日期筛选，纯时间顺序排序（完成的保持原时刻、划线显示）。 */
export function tasksForDate(date: string, tasks: Task[]): Task[] {
  return tasks
    .filter((t) => dateOf(t.dueAt) === date)
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
}
