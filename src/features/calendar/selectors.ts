import type { EventItem, Task } from '../../types';
import { dateOf } from '../../lib/format';

export function tasksForDate(date: string, tasks: Task[]): Task[] {
  return tasks
    .filter((t) => dateOf(t.dueAt) === date)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'done' ? 1 : -1;
      return (a.dueAt ?? '').localeCompare(b.dueAt ?? '');
    });
}

export function eventsForDate(date: string, events: EventItem[]): EventItem[] {
  return events
    .filter((e) => e.date === date)
    .sort((a, b) => (a.timeStart ?? '99:99').localeCompare(b.timeStart ?? '99:99'));
}
