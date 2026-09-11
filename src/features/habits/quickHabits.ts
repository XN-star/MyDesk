import type { Habit } from '../../types';

export interface QuickHabit {
  name: string;
  emoji: string;
}

/** 常用打卡速建预设：点击即建同名每日习惯。 */
export const QUICK_HABITS: QuickHabit[] = [
  { name: '骑行', emoji: '🚴' },
  { name: '步行', emoji: '🚶' },
  { name: '喝水', emoji: '💧' },
  { name: '午休', emoji: '😴' },
  { name: '阅读', emoji: '📖' },
  { name: '冥想', emoji: '🧘' },
];

/** 预设是否已被同名习惯占用（精确匹配名称）。 */
export function isQuickHabitTaken(habits: Array<Pick<Habit, 'name' | 'archived'>>, name: string): boolean {
  return habits.some((h) => !h.archived && h.name === name);
}

/** 计算速建 chips 的展示态：已存在 → taken（置灰跳过），否则可建。 */
export function quickHabitStates(
  habits: Array<Pick<Habit, 'name' | 'archived'>>,
): Array<QuickHabit & { taken: boolean }> {
  return QUICK_HABITS.map((q) => ({ ...q, taken: isQuickHabitTaken(habits, q.name) }));
}
