import { describe, expect, it } from 'vitest';
import { QUICK_HABITS, isQuickHabitTaken, quickHabitStates } from './quickHabits';

describe('quickHabits', () => {
  it('六个预设且都带 emoji', () => {
    expect(QUICK_HABITS.map((q) => q.name)).toEqual(['骑行', '步行', '喝水', '午休', '阅读', '冥想']);
    for (const q of QUICK_HABITS) expect(q.emoji.length).toBeGreaterThan(0);
  });

  it('同名未归档习惯占用速建位', () => {
    const habits = [{ name: '喝水', archived: false }];
    expect(isQuickHabitTaken(habits, '喝水')).toBe(true);
    expect(isQuickHabitTaken(habits, '骑行')).toBe(false);
  });

  it('已归档的同名习惯不占用', () => {
    const habits = [{ name: '喝水', archived: true }];
    expect(isQuickHabitTaken(habits, '喝水')).toBe(false);
  });

  it('quickHabitStates 输出 taken 标记', () => {
    const states = quickHabitStates([{ name: '冥想', archived: false }]);
    const meditate = states.find((s) => s.name === '冥想');
    const ride = states.find((s) => s.name === '骑行');
    expect(meditate?.taken).toBe(true);
    expect(ride?.taken).toBe(false);
  });
});
