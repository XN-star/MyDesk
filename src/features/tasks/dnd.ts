import type { Task, TaskStatus } from '../../types';
import { fromDate } from '../../lib/format';
import { isFocusModeTask } from '../../lib/focusTask';

export const STATUSES: TaskStatus[] = ['todo', 'doing', 'done'];

export const STATUS_NAMES: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
};

/** 计算拖拽后的完整任务列表（纯函数）。目标列排除自身后，在 targetIndex 处取 sort_order。 */
export function applyMove(
  tasks: Task[],
  taskId: string,
  targetStatus: TaskStatus,
  targetIndex: number,
): Task[] {
  const moving = tasks.find((t) => t.id === taskId);
  if (!moving) return tasks;
  const column = tasks
    .filter((t) => t.status === targetStatus && t.id !== taskId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const idx = Math.max(0, Math.min(targetIndex, column.length));
  const prev = idx > 0 ? column[idx - 1].sortOrder : null;
  const next = idx < column.length ? column[idx].sortOrder : null;
  const sortOrder =
    prev !== null && next !== null
      ? (prev + next) / 2
      : prev !== null
        ? prev + 100
        : next !== null
          ? next - 100
          : 100;
  return tasks.map((t) =>
    t.id === taskId
      ? {
          ...t,
          status: targetStatus,
          sortOrder,
          doneAt: targetStatus === 'done' ? (t.doneAt ?? fromDate(new Date())) : null,
        }
      : t,
  );
}

/** 过滤出指定看板的任务（保持原顺序）；专注模式隐藏任务不在看板显示。 */
export function tasksOfBoard(tasks: Task[], boardId: string): Task[] {
  return tasks.filter((t) => t.boardId === boardId && !isFocusModeTask(t));
}
