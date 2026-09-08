import { describe, expect, it } from 'vitest';
import { summarize } from './summary';

const base = { boardId: 'default', description: '', sortOrder: 0, doneAt: null, createdAt: '', updatedAt: '' };

describe('summarize', () => {
  it('统计未完成任务数、今日条目数与下个截止', () => {
    const tasks = [
      { ...base, id: '1', title: 'a', status: 'todo', priority: 1, dueAt: '2026-09-07T12:00:00' },
      { ...base, id: '2', title: 'b', status: 'done', priority: 1, dueAt: null },
      { ...base, id: '3', title: 'c', status: 'doing', priority: 1, dueAt: '2026-09-08T09:00:00' },
      { ...base, id: '4', title: 'd', status: 'done', priority: 1, dueAt: '2026-09-07T08:00:00' },
    ] as never[];
    const s = summarize(tasks, '2026-09-07', new Date('2026-09-07T10:00:00'));
    expect(s.todoCount).toBe(2);
    expect(s.todayCount).toBe(2);
    expect(s.nextLabel).toBe('2小时后');
  });
});
