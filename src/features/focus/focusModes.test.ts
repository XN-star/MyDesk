import { describe, expect, it } from 'vitest';
import type { Task } from '../../types';
import {
  FOCUS_MODES,
  FOCUS_MODE_PREFIX,
  displayTitleOf,
  findFocusModeTask,
  focusModeOfTask,
  focusModeTaskTitle,
  isFocusModeTask,
} from './focusModes';

function task(p: Partial<Task>): Task {
  return {
    id: 't',
    boardId: 'default',
    title: '任务',
    description: '',
    status: 'todo',
    priority: 1,
    dueAt: null,
    sortOrder: 100,
    doneAt: null,
    remindMinutesBefore: null,
    repeat: null,
    createdAt: '2026-09-11T10:00:00',
    updatedAt: '2026-09-11T10:00:00',
    ...p,
  };
}

describe('focusModes', () => {
  it('标题往返：模式名 → 隐藏标题 → 模式名', () => {
    const title = focusModeTaskTitle('冥想');
    expect(title).toBe(`${FOCUS_MODE_PREFIX}冥想`);
    expect(focusModeOfTask(title)).toBe('冥想');
    expect(displayTitleOf(title)).toBe('冥想');
  });

  it('普通任务不受影响', () => {
    expect(focusModeOfTask('写报告')).toBeNull();
    expect(displayTitleOf('写报告')).toBe('写报告');
    expect(isFocusModeTask(task({ title: '写报告' }))).toBe(false);
  });

  it('isFocusModeTask 只认前缀', () => {
    expect(isFocusModeTask(task({ title: 'focus_mode:读书' }))).toBe(true);
    expect(isFocusModeTask(task({ title: 'focus_mode:' }))).toBe(true);
    expect(isFocusModeTask(task({ title: 'focus:读书' }))).toBe(false);
  });

  it('findFocusModeTask 按标题精确匹配', () => {
    const tasks = [
      task({ id: '1', title: 'focus_mode:冥想' }),
      task({ id: '2', title: 'focus_mode:读书' }),
    ];
    expect(findFocusModeTask(tasks, '读书')?.id).toBe('2');
    expect(findFocusModeTask(tasks, '运动')).toBeNull();
  });

  it('预设包含六种模式且带 emoji', () => {
    expect(FOCUS_MODES.length).toBe(6);
    for (const m of FOCUS_MODES) {
      expect(m.emoji.length).toBeGreaterThan(0);
      expect(m.suggestedMin).toBeGreaterThan(0);
    }
  });
});
