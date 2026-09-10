import type { Habit, HabitLog, Link, Note, Task } from '../../types';
import { fromDate, toDateStr } from '../../lib/format';
import { dailyChecked } from '../habits/habits';

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

export interface WeekReport {
  /** 本周完成数（doneAt 落在本周） */
  done: number;
  /** 本周新建数（createdAt 落在本周） */
  created: number;
  /** 本周逾期：到期时刻在本周内、至今未完成 */
  overdue: number;
  /** 上周同口径三项 */
  donePrev: number;
  createdPrev: number;
  overduePrev: number;
  /** 本周一，'YYYY-MM-DD' */
  weekStart: string;
}

function weekStartDate(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 周一为一周起点
  return d;
}

function inRange(iso: string | null, start: Date, now: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso);
  return t >= start && t < now;
}

/** 周报：本周/上周的完成、新建、逾期统计（周一为一周起点）。 */
export function weekReport(tasks: Task[], now: Date): WeekReport {
  const start = weekStartDate(now);
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - 7);
  const pad = (n: number) => String(n).padStart(2, '0');
  const weekStart = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;

  let done = 0;
  let created = 0;
  let overdue = 0;
  let donePrev = 0;
  let createdPrev = 0;
  let overduePrev = 0;
  for (const t of tasks) {
    if (t.status === 'done') {
      if (inRange(t.doneAt, start, now)) done += 1;
      else if (inRange(t.doneAt, prevStart, start)) donePrev += 1;
      continue;
    }
    if (inRange(t.createdAt, start, now)) created += 1;
    else if (inRange(t.createdAt, prevStart, start)) createdPrev += 1;
    if (t.dueAt) {
      const due = new Date(t.dueAt);
      if (due < now) {
        if (due >= start) overdue += 1;
        else if (due >= prevStart) overduePrev += 1;
      }
    }
  }
  return { done, created, overdue, donePrev, createdPrev, overduePrev, weekStart };
}

export interface TodayHabits {
  total: number;
  checked: number;
  /** 今日未打卡的习惯，保持注册顺序 */
  pending: Habit[];
}

/** 今日习惯统计：已打卡/总数与待打卡列表。 */
export function todayHabits(habits: Habit[], logs: HabitLog[], date: string): TodayHabits {
  const pending = habits.filter((h) => !dailyChecked(logs, h.id, date));
  return { total: habits.length, checked: habits.length - pending.length, pending };
}
