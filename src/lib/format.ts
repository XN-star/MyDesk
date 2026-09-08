import type { Task } from '../types';

export function localNowIso(): string {
  return fromDate(new Date());
}

export function fromDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function toDateStr(d: Date): string {
  return fromDate(d).slice(0, 10);
}

export function dateOf(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function toLocalInput(iso: string | null): string {
  return iso ? iso.slice(0, 16) : '';
}

export function fromLocalInput(v: string): string | null {
  return v ? `${v}:00` : null;
}

export function isOverdue(task: Pick<Task, 'status' | 'dueAt'>, now: Date = new Date()): boolean {
  return !!task.dueAt && task.status !== 'done' && task.dueAt < fromDate(now);
}

/** 截止时间的中文相对描述 */
export function dueLabel(iso: string, now: Date = new Date()): string {
  const due = new Date(iso);
  const diffMs = due.getTime() - now.getTime();
  if (diffMs < 0) return '已过期';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}分钟后`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}小时后`;
  const days = Math.round(hours / 24);
  return `${days}天后`;
}

/** 笔记列表用的更新时间短格式：当天 HH:mm，跨天 M/D */
export function timeShort(iso: string, now: Date = new Date()): string {
  if (dateOf(iso) === toDateStr(now)) return iso.slice(11, 16);
  const [, m, d] = dateOf(iso)!.split('-');
  return `${Number(m)}/${Number(d)}`;
}
