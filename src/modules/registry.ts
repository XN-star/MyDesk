import { MODULE_META } from './meta';
import type { ComponentType } from 'react';
import KanbanPage from '../features/tasks/KanbanPage';
import FocusPage from '../features/focus/FocusPage';
import CalendarPage from '../features/calendar/CalendarPage';
import NotesPage from '../features/notes/NotesPage';
import LinksPage from '../features/links/LinksPage';
import OverviewPage from '../features/overview/OverviewPage';
import HabitsPage from '../features/habits/HabitsPage';
import LedgerPage from '../features/ledger/LedgerPage';
import FitnessPage from '../features/fitness/FitnessPage';

/** 完整模块 = 静态元数据 + 组件/路由。 */
export interface Module {
  id: string;
  name: string;
  icon: string;
  description: string;
  defaultEnabled: boolean;
  /** 侧边栏图标专属色（继承自 meta） */
  color?: string;
  route: string;
  component: ComponentType;
}

const ROUTES: Record<string, string> = {
  overview: '/overview',
  tasks: '/tasks',
  focus: '/focus',
  calendar: '/calendar',
  habits: '/habits',
  notes: '/notes',
  ledger: '/ledger',
  fitness: '/fitness',
  links: '/links',
};

const COMPONENTS: Record<string, ComponentType> = {
  overview: OverviewPage,
  tasks: KanbanPage,
  focus: FocusPage,
  calendar: CalendarPage,
  habits: HabitsPage,
  notes: NotesPage,
  ledger: LedgerPage,
  fitness: FitnessPage,
  links: LinksPage,
};

/** 注册表 = 静态元数据（meta.ts，供 store 等非 UI 层引用）+ 组件/路由挂载。 */
export const MODULES: Module[] = MODULE_META.map((m) => ({
  ...m,
  route: ROUTES[m.id],
  component: COMPONENTS[m.id],
}));

export function enabledModules(enabledIds: string[]): Module[] {
  return MODULES.filter((m) => enabledIds.includes(m.id));
}
