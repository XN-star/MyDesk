import { describe, expect, it } from 'vitest';
import { searchTasks, countChars } from './search';
import type { Task } from '../../types';

function t(id: string, title: string, description = ''): Task {
  return {
    id,
    boardId: 'default',
    title,
    description,
    status: 'todo',
    priority: 1,
    dueAt: null,
    sortOrder: 100,
    doneAt: null,
    remindMinutesBefore: null,
    repeat: null,
    createdAt: '',
    updatedAt: '',
  };
}

describe('searchTasks', () => {
  const tasks = [
    t('1', '写季度报告', '包含预算分析'),
    t('2', '买菜', ''),
    t('3', '预算评审', ''),
  ];

  it('空关键字返回全部', () => {
    expect(searchTasks(tasks, '  ')).toHaveLength(3);
  });

  it('匹配标题或描述，不区分大小写', () => {
    expect(searchTasks(tasks, '预算').map((x) => x.id)).toEqual(['1', '3']);
    expect(searchTasks(tasks, '买菜').map((x) => x.id)).toEqual(['2']);
    expect(searchTasks(tasks, 'TODO')).toHaveLength(0);
  });
});

describe('countChars', () => {
  it('去除空白后的字符数', () => {
    expect(countChars('你好世界\n\n第二行 ')).toBe(7);
    expect(countChars('')).toBe(0);
    expect(countChars('   \n ')).toBe(0);
  });
});
