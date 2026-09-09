import type { Link, Note, Task } from '../../types';
import { fromDate, toDateStr } from '../../lib/format';

export interface TaskStats {
  todoToday: number;
  doing: number;
  doneToday: number;
  overdue: number;
}

/** 今日任务统计：今日到期待办、进行中、今日完成、逾期（未完成且截止已过）。 */
export function taskStats(tasks: Task[], now: Date): TaskStats {
  const today = toDateStr(now);
  let todoToday = 0;
  let doing = 0;
  let doneToday = 0;
  let overdue = 0;
  for (const t of tasks) {
    if (t.status === 'doing') doing += 1;
    if (t.status === 'done') {
      if (t.doneAt && toDateStr(new Date(t.doneAt)) === today) doneToday += 1;
      continue;
    }
    if (t.dueAt) {
      if (t.dueAt < fromDate(now)) overdue += 1;
      else if (toDateStr(new Date(t.dueAt)) === today) todoToday += 1;
    }
  }
  return { todoToday, doing, doneToday, overdue };
}

/** 未来 days 天内到期的未完成任务，按到期升序取前 limit 条。 */
export function upcomingTasks(tasks: Task[], now: Date, days = 7, limit = 5): Task[] {
  const from = fromDate(now);
  const to = new Date(now);
  to.setDate(to.getDate() + days);
  const toStr = fromDate(to);
  return tasks
    .filter((t) => t.status !== 'done' && !!t.dueAt && t.dueAt >= from && t.dueAt <= toStr)
    .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1))
    .slice(0, limit);
}

/** 最近笔记：依赖后端已按 updated_at 倒序的输入，取前 limit 条。 */
export function recentNotes(notes: Note[], limit = 5): Note[] {
  return notes.slice(0, limit);
}

/** 常用入口：依赖后端 sort_order 排序的输入，取前 limit 条。 */
export function frequentLinks(links: Link[], limit = 6): Link[] {
  return links.slice(0, limit);
}
