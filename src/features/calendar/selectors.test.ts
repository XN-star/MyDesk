import { describe, expect, it } from 'vitest';
import { tasksForDate } from './selectors';
import type { Task } from '../../types';

const base = {
  boardId: 'default',
  description: '',
  priority: 1,
  sortOrder: 0,
  doneAt: null,
  createdAt: '',
  updatedAt: '',
};

describe('tasksForDate', () => {
  it('按 dueAt 日期筛选并纯时间排序', () => {
    const tasks = [
      { ...base, id: '1', title: '晚', status: 'todo', dueAt: '2026-09-08T18:00:00' },
      { ...base, id: '2', title: '早', status: 'todo', dueAt: '2026-09-08T08:00:00' },
      { ...base, id: '3', title: '别天', status: 'todo', dueAt: '2026-09-09T08:00:00' },
      { ...base, id: '4', title: '无期', status: 'todo', dueAt: null },
    ] as Task[];
    const got = tasksForDate('2026-09-08', tasks);
    expect(got.map((t) => t.id)).toEqual(['2', '1']);
  });

  it('已完成的条目保持时间位置（不后置）', () => {
    const tasks = [
      { ...base, id: '1', title: '晚', status: 'todo', dueAt: '2026-09-08T18:00:00' },
      { ...base, id: '2', title: '已完成', status: 'done', dueAt: '2026-09-08T09:00:00' },
    ] as Task[];
    expect(tasksForDate('2026-09-08', tasks).map((t) => t.id)).toEqual(['2', '1']);
  });
});
