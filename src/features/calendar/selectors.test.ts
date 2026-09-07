import { describe, expect, it } from 'vitest';
import { eventsForDate, tasksForDate } from './selectors';
import type { EventItem, Task } from '../../types';

const base = {
  boardId: 'default',
  description: '',
  priority: 1,
  sortOrder: 0,
  doneAt: null,
  createdAt: '',
  updatedAt: '',
};

describe('selectors', () => {
  it('tasksForDate 按 dueAt 日期筛选并让未完成靠前', () => {
    const tasks = [
      { ...base, id: '1', title: '完成', status: 'done', dueAt: '2026-09-08T09:00:00' },
      { ...base, id: '2', title: '晚', status: 'todo', dueAt: '2026-09-08T18:00:00' },
      { ...base, id: '3', title: '早', status: 'todo', dueAt: '2026-09-08T08:00:00' },
      { ...base, id: '4', title: '别天', status: 'todo', dueAt: '2026-09-09T08:00:00' },
      { ...base, id: '5', title: '无期', status: 'todo', dueAt: null },
    ] as Task[];
    const got = tasksForDate('2026-09-08', tasks);
    expect(got.map((t) => t.id)).toEqual(['3', '2', '1']);
  });

  it('eventsForDate 按 timeStart 排序（全天最后）', () => {
    const events = [
      { id: 'b', title: '晚', date: '2026-09-08', timeStart: '16:00' },
      { id: 'a', title: '早', date: '2026-09-08', timeStart: '09:00' },
      { id: 'c', title: '全天', date: '2026-09-08', timeStart: null },
    ] as EventItem[];
    expect(eventsForDate('2026-09-08', events).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});
