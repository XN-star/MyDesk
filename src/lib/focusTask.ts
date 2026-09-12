import type { Task } from '../types';

/** 隐藏任务标题前缀：专注模式对应的任务（不在看板与统计中显示）。 */
export const FOCUS_MODE_PREFIX = 'focus_mode:';

/** 判断任务是否为专注模式隐藏任务（看板与各类统计应排除）。 */
export function isFocusModeTask(task: Pick<Task, 'title'>): boolean {
  return task.title.startsWith(FOCUS_MODE_PREFIX);
}
