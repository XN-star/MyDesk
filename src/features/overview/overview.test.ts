import { describe, expect, it } from 'vitest';
import type { Link, Note, Task, TimeEntry } from '../../types';
import { frequentLinks, recentNotes, taskStats, todayFocus, upcomingTasks, weekReport, todayHabits } from './overview';

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
  it('统计未完成任务/进行中/今日完成/逾期（未完成含无截止与未来截止）', () => {
    const stats = taskStats(
      [
        task({ id: '1', dueAt: '2026-09-09T18:00:00' }), // 今日截止待办
        task({ id: '2', status: 'doing' }), // 进行中
        task({ id: '3', status: 'done', doneAt: '2026-09-09T09:00:00' }), // 今日完成
        task({ id: '4', dueAt: '2026-09-08T10:00:00' }), // 逾期
        task({ id: '5' }), // 无截止待办，计入 todoToday
        task({ id: '6', dueAt: '2026-09-10T10:00:00' }), // 明天截止，计入 todoToday
      ],
      NOW,
    );
    // 未完成 4 条：今日截止 + 逾期 + 无截止 + 明天截止（逾期同时计入 overdue）
    expect(stats).toEqual({ todoToday: 4, doing: 1, doneToday: 1, overdue: 1 });
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

describe('todayFocus', () => {
  function entry(id: string, taskId: string, startedAt: string, endedAt: string | null): TimeEntry {
    return { id, taskId, startedAt, endedAt };
  }
  const tasks = [
    task({ id: 'a', title: '写报告' }),
    task({ id: 'b', title: '开会' }),
  ]; // 注意：'gone' 不在列表中，模拟任务已删除

  it('按任务聚合今日已结束条目的分钟数', () => {
    const entries = [
      entry('e1', 'a', '2026-09-09T09:00:00', '2026-09-09T09:25:00'), // 25 分钟
      entry('e2', 'a', '2026-09-09T10:00:00', '2026-09-09T10:35:00'), // 35 分钟
      entry('e3', 'b', '2026-09-09T11:00:00', '2026-09-09T11:10:00'), // 10 分钟
    ];
    const r = todayFocus(entries, tasks, new Date('2026-09-09T12:00:00'));
    expect(r.totalMin).toBe(70);
    expect(r.byTask).toEqual([
      { taskId: 'a', title: '写报告', minutes: 60 },
      { taskId: 'b', title: '开会', minutes: 10 },
    ]);
  });

  it('进行中的条目计入到当前时刻', () => {
    const entries = [entry('e1', 'a', '2026-09-09T09:50:00', null)];
    const r = todayFocus(entries, tasks, new Date('2026-09-09T10:00:00'));
    expect(r.totalMin).toBe(10);
  });

  it('昨天的条目不计入；已删除任务的条目按 (已删除) 显示', () => {
    const entries = [
      entry('e1', 'a', '2026-09-08T09:00:00', '2026-09-08T09:30:00'),
      entry('e2', 'gone', '2026-09-09T09:00:00', '2026-09-09T09:20:00'),
    ];
    const r = todayFocus(entries, tasks, new Date('2026-09-09T12:00:00'));
    expect(r.totalMin).toBe(20);
    expect(r.byTask).toEqual([{ taskId: 'gone', title: '（已删除任务）', minutes: 20 }]);
  });

  it('byTask 按时长降序取前三', () => {
    const entries = [
      entry('e1', 'a', '2026-09-09T09:00:00', '2026-09-09T09:10:00'),
      entry('e2', 'b', '2026-09-09T10:00:00', '2026-09-09T10:30:00'),
      entry('e3', 'c', '2026-09-09T11:00:00', '2026-09-09T11:20:00'),
      entry('e4', 'd', '2026-09-09T12:00:00', '2026-09-09T12:40:00'),
    ];
    const all = [...tasks, task({ id: 'c', title: '复盘' }), task({ id: 'd', title: '阅读' })];
    const r = todayFocus(entries, all, new Date('2026-09-09T13:00:00'));
    expect(r.byTask.map((x) => x.taskId)).toEqual(['d', 'b', 'c']);
  });
});
