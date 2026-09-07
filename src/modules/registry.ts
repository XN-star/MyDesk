import type { Module } from './types';
import KanbanPage from '../features/tasks/KanbanPage';
import CalendarPage from '../features/calendar/CalendarPage';

export const MODULES: Module[] = [
  {
    id: 'tasks',
    name: '任务看板',
    icon: '▦',
    description: '三列拖拽任务管理',
    defaultEnabled: true,
    route: '/tasks',
    component: KanbanPage,
  },
  {
    id: 'calendar',
    name: '日历',
    icon: '▤',
    description: '月历与当日日程',
    defaultEnabled: true,
    route: '/calendar',
    component: CalendarPage,
  },
];

export function enabledModules(enabledIds: string[]): Module[] {
  return MODULES.filter((m) => enabledIds.includes(m.id));
}
