import { describe, expect, it } from 'vitest';
import type { Link, Note, Task } from '../../types';
import { frequentLinks, recentNotes, taskStats, upcomingTasks } from './overview';

const NOW = new Date('2026-09-09T10:00:00');

function task(p: Partial<Task>): Task {
  return {
    id: 't',
    boardId: 'default',
    title: '任务',
    description: '',
    status: 'todo',
    priority: 1,
    dueAt: null,
    sortOrder: 100,
    doneAt: null,
    remindMinutesBefore: null,
    createdAt: '2026-09-08T10:00:00',
    updatedAt: '2026-09-08T10:00:00',
    ...p,
  };
}

describe('taskStats', () => {
  it('统计今日待办/进行中/今日完成/逾期', () => {
    const stats = taskStats(
      [
        task({ id: '1', dueAt: '2026-09-09T18:00:00' }), // 今日待办
        task({ id: '2', status: 'doing' }), // 进行中
        task({ id: '3', status: 'done', doneAt: '2026-09-09T09:00:00' }), // 今日完成
        task({ id: '4', dueAt: '2026-09-08T10:00:00' }), // 逾期
        task({ id: '5' }), // 无截止待办，不计入 todoToday
        task({ id: '6', dueAt: '2026-09-10T10:00:00' }), // 明天，不计
      ],
      NOW,
    );
    expect(stats).toEqual({ todoToday: 1, doing: 1, doneToday: 1, overdue: 1 });
  });

  it('昨天完成不计入今日完成', () => {
    const stats = taskStats([task({ id: '1', status: 'done', doneAt: '2026-09-08T23:00:00' })], NOW);
    expect(stats.doneToday).toBe(0);
  });
});

describe('upcomingTasks', () => {
  it('取 7 天内未完成任务按到期升序，最多 5 条', () => {
    const list = upcomingTasks(
      [
        task({ id: 'far', dueAt: '2026-09-20T10:00:00' }), // 超窗
        task({ id: 'done', status: 'done', dueAt: '2026-09-10T10:00:00' }), // 已完成
        task({ id: 'b', dueAt: '2026-09-12T10:00:00' }),
        task({ id: 'a', dueAt: '2026-09-10T09:00:00' }),
        task({ id: 'n' }), // 无截止
        task({ id: 'past', dueAt: '2026-09-08T10:00:00' }), // 已过期不算 upcoming
      ],
      NOW,
    );
    expect(list.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('recentNotes', () => {
  it('按输入顺序（后端已倒序）取前 N 条', () => {
    const notes = [
      { id: '1', title: 'A', content: '', pinned: false, createdAt: '', updatedAt: '2026-09-09T09:00:00' },
      { id: '2', title: '', content: '', pinned: false, createdAt: '', updatedAt: '2026-09-08T09:00:00' },
    ] as Note[];
    expect(recentNotes(notes, 1)).toEqual([notes[0]]);
  });
});

describe('frequentLinks', () => {
  it('按输入顺序（后端 sort_order）取前 N 条', () => {
    const links = [
      { id: '1', title: 'G', kind: 'url', target: '', sortOrder: 100, createdAt: '', updatedAt: '' },
      { id: '2', title: 'D', kind: 'path', target: '', sortOrder: 200, createdAt: '', updatedAt: '' },
    ] as Link[];
    expect(frequentLinks(links, 1)).toEqual([links[0]]);
  });
});
