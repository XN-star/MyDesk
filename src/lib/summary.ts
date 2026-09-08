import type { Task } from '../types';
import { fromDate } from './format';

export interface DaySummary {
  todoCount: number;
  todayCount: number;
  nextLabel: string;
}

function dueLabelOf(iso: string, now: Date): string {
  const due = new Date(iso);
  const diffMs = due.getTime() - now.getTime();
  if (diffMs < 0) return '已过期';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}分钟后`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}小时后`;
  return `${Math.round(hours / 24)}天后`;
}

export function summarize(tasks: Task[], today: string, now: Date = new Date()): DaySummary {
  const todoCount = tasks.filter((t) => t.status !== 'done').length;
  const todayCount = tasks.filter((t) => t.dueAt?.slice(0, 10) === today).length;
  const next = tasks
    .filter((t) => t.status !== 'done' && t.dueAt && t.dueAt >= fromDate(now))
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0];
  const nextLabel = next?.dueAt ? dueLabelOf(next.dueAt, now) : '无';
  return { todoCount, todayCount, nextLabel };
}
