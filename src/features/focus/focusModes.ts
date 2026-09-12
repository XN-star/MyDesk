import type { Task } from '../../types';
import { FOCUS_MODE_PREFIX, isFocusModeTask } from '../../lib/focusTask';

// re-export 保持既有调用方与测试的导入路径不变
export { FOCUS_MODE_PREFIX, isFocusModeTask };

export interface FocusMode {
  /** 模式名（同时是隐藏任务的标题） */
  name: string;
  emoji: string;
  /** 建议时长分钟（仅展示提示，计时仍是自由停止） */
  suggestedMin: number;
  hint: string;
}

/** 无任务专注模式预设：点击即以该模式开始计时。 */
export const FOCUS_MODES: FocusMode[] = [
  { name: '冥想', emoji: '🧘', suggestedMin: 10, hint: '呼吸放慢，念头归零' },
  { name: '读书', emoji: '📖', suggestedMin: 30, hint: '沉浸一段文字' },
  { name: '运动', emoji: '🏃', suggestedMin: 45, hint: '身体动起来' },
  { name: '写作', emoji: '✍️', suggestedMin: 25, hint: '让想法落到纸上' },
  { name: '听播客', emoji: '🎧', suggestedMin: 30, hint: '输入一点新东西' },
  { name: '散步', emoji: '🚶', suggestedMin: 15, hint: '走一走，透透气' },
];

/** 隐藏任务的标题（模式名 → focus_mode:冥想）。 */
export function focusModeTaskTitle(modeName: string): string {
  return `${FOCUS_MODE_PREFIX}${modeName}`;
}

/** 从标题反解模式名；非隐藏任务返回 null。 */
export function focusModeOfTask(title: string): string | null {
  return title.startsWith(FOCUS_MODE_PREFIX) ? title.slice(FOCUS_MODE_PREFIX.length) : null;
}

/** 判断任务是否为看板应隐藏的专注模式任务。 */

/**
 * 找到模式对应的隐藏任务（按标题精确匹配）。
 * 返回 null 表示尚未创建，需要调用方先建任务。
 */
export function findFocusModeTask(tasks: Task[], modeName: string): Task | null {
  const title = focusModeTaskTitle(modeName);
  return tasks.find((t) => t.title === title) ?? null;
}

/** 工时统计展示时，把隐藏任务标题还原为「冥想」等模式名。 */
export function displayTitleOf(title: string): string {
  return focusModeOfTask(title) ?? title;
}
