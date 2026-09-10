import { describe, expect, it } from 'vitest';
import type { Link, Note, Task } from '../../types';
import { frequentLinks, recentNotes, taskStats, upcomingTasks, weekReport, todayHabits } from './overview';

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
    repeat: null,
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

describe('weekReport', () => {
  // NOW = 2026-09-09 周三；本周一 = 2026-09-07，上周一 = 2026-08-31
  it('本周完成/新建按区间统计', () => {
    const r = weekReport(
      [
        task({ id: 'd1', status: 'done', doneAt: '2026-09-08T09:00:00' }), // 本周完成
        task({ id: 'd2', status: 'done', doneAt: '2026-09-01T09:00:00' }), // 上周完成
        task({ id: 'c1', createdAt: '2026-09-07T09:00:00' }), // 本周新建
        task({ id: 'c2', createdAt: '2026-09-02T09:00:00' }), // 上周新建
      ],
      NOW,
    );
    expect(r.done).toBe(1);
    expect(r.donePrev).toBe(1);
    expect(r.created).toBe(1);
    expect(r.createdPrev).toBe(1);
    expect(r.weekStart).toBe('2026-09-07');
  });

  it('逾期=本周内到期且至今未完成；上周逾期同口径', () => {
    const r = weekReport(
      [
        task({ id: 'o1', dueAt: '2026-09-08T10:00:00' }), // 本周到期，未完成 → 本周逾期
        task({ id: 'ok', dueAt: '2026-09-08T10:00:00', status: 'done', doneAt: '2026-09-09T09:00:00' }),
        task({ id: 'o2', dueAt: '2026-09-02T10:00:00' }), // 上周到期未完成 → 上周逾期
        task({ id: 'o3', dueAt: '2026-08-30T10:00:00' }), // 上上周（08-30 周日），不计入上周
        task({ id: 'f', dueAt: '2026-09-15T10:00:00' }), // 未来，不计
      ],
      NOW,
    );
    expect(r.overdue).toBe(1);
    expect(r.overduePrev).toBe(1);
  });

  it('周日（now=2026-09-13）本周一=2026-09-07', () => {
    const sunday = new Date('2026-09-13T22:00:00');
    const r = weekReport([], sunday);
    expect(r.weekStart).toBe('2026-09-07');
  });

  it('周一（now=2026-09-07）本周一=当天，上周一=2026-08-31', () => {
    const monday = new Date('2026-09-07T08:00:00');
    const r = weekReport([], monday);
    expect(r.weekStart).toBe('2026-09-07');
    const t = weekReport([task({ id: 'x', createdAt: '2026-08-31T10:00:00' })], monday);
    expect(t.createdPrev).toBe(1);
  });
});

describe('todayHabits', () => {
  function habit(id: string, name: string) {
    return {
      id,
      name,
      frequency: 'daily' as const,
      reminder: null,
      archived: false,
      createdAt: '2026-09-01T09:00:00',
      updatedAt: '2026-09-01T09:00:00',
    };
  }

  it('统计已打卡数并列出未打卡习惯', () => {
    const habits = [habit('a', '晨读'), habit('b', '健身'), habit('c', '喝水')];
    const logs = [{ id: 'l1', habitId: 'a', date: '2026-09-09', value: 1 }];
    const r = todayHabits(habits, logs, '2026-09-09');
    expect(r.total).toBe(3);
    expect(r.checked).toBe(1);
    expect(r.pending.map((h) => h.id)).toEqual(['b', 'c']);
  });

  it('全部打卡完成时 pending 为空', () => {
    const habits = [habit('a', '晨读')];
    const logs = [{ id: 'l1', habitId: 'a', date: '2026-09-09', value: 1 }];
    const r = todayHabits(habits, logs, '2026-09-09');
    expect(r.checked).toBe(1);
    expect(r.pending).toHaveLength(0);
  });
});
