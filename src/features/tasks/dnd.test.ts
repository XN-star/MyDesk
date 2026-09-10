import { describe, expect, it } from 'vitest';
import { applyMove, tasksOfBoard } from './dnd';
import type { Task } from '../../types';

function t(id: string, status: Task['status'], sortOrder: number): Task {
  return {
    id,
    boardId: 'default',
    title: id,
    description: '',
    status,
    priority: 1,
    dueAt: null,
    sortOrder,
    doneAt: null,
    remindMinutesBefore: null,
    repeat: null,
    createdAt: '',
    updatedAt: '',
  };
}

describe('applyMove', () => {
  it('移入空列 sort_order 为 100', () => {
    const tasks = [t('a', 'todo', 100)];
    const [moved] = applyMove(tasks, 'a', 'doing', 0);
    expect(moved.status).toBe('doing');
    expect(moved.sortOrder).toBe(100);
  });

  it('插入两卡片中间取中点', () => {
    const tasks = [t('a', 'todo', 100), t('b', 'doing', 100), t('c', 'doing', 200)];
    const [moved] = applyMove(tasks, 'a', 'doing', 1);
    expect(moved.sortOrder).toBe(150);
  });

  it('拖入 done 记录 doneAt，拖回 todo 清除 doneAt', () => {
    const tasks = [t('a', 'todo', 100)];
    const [done] = applyMove(tasks, 'a', 'done', 0);
    expect(done.doneAt).toBeTruthy();
    const [back] = applyMove([done], 'a', 'todo', 0);
    expect(back.doneAt).toBeNull();
  });

  it('目标索引超界时夹紧到末尾', () => {
    const tasks = [t('a', 'todo', 100), t('b', 'doing', 100)];
    const [moved] = applyMove(tasks, 'a', 'doing', 99);
    expect(moved.sortOrder).toBe(200);
  });

  it('id 不存在时原样返回', () => {
    const tasks = [t('a', 'todo', 100)];
    expect(applyMove(tasks, 'nope', 'doing', 0)).toBe(tasks);
  });
});

describe('tasksOfBoard', () => {
  it('只保留指定看板任务并保持原顺序', () => {
    const a = t('a', 'todo', 100);
    const b = { ...t('b', 'todo', 100), boardId: 'work' };
    const c = { ...t('c', 'doing', 100), boardId: 'work' };
    expect(tasksOfBoard([a, b, c], 'work')).toEqual([b, c]);
  });
});
