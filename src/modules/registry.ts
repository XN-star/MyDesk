import type { Module } from './types';
import KanbanPage from '../features/tasks/KanbanPage';
import CalendarPage from '../features/calendar/CalendarPage';
import NotesPage from '../features/notes/NotesPage';

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
  {
    id: 'notes',
    name: '笔记',
    icon: '✎',
    description: '纯文本快速记录',
    defaultEnabled: true,
    route: '/notes',
    component: NotesPage,
  },
];

export function enabledModules(enabledIds: string[]): Module[] {
  return MODULES.filter((m) => enabledIds.includes(m.id));
}
