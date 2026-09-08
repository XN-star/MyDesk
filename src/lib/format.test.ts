import { describe, expect, it } from 'vitest';
import { dateOf, dueLabel, isOverdue, monthOf, timeShort, toDateStr, toLocalInput } from './format';

const now = new Date('2026-09-07T10:00:00');

describe('format', () => {
  it('toDateStr 输出 YYYY-MM-DD', () => {
    expect(toDateStr(new Date(2026, 8, 7))).toBe('2026-09-07');
  });

  it('dateOf 取日期部分', () => {
    expect(dateOf('2026-09-08T10:00:00')).toBe('2026-09-08');
    expect(dateOf(null)).toBeNull();
  });

  it('monthOf 取月份', () => {
    expect(monthOf('2026-09-07')).toBe('2026-09');
  });

  it('dueLabel 未来 1 小时', () => {
    expect(dueLabel('2026-09-07T11:00:00', now)).toBe('1小时后');
  });

  it('dueLabel 未来 3 天', () => {
    expect(dueLabel('2026-09-10T09:00:00', now)).toBe('3天后');
  });

  it('dueLabel 已过期', () => {
    expect(dueLabel('2026-09-07T08:00:00', now)).toBe('已过期');
  });

  it('isOverdue 只对未完成且已过期任务为真', () => {
    expect(isOverdue({ status: 'todo', dueAt: '2026-09-07T08:00:00' } as never, now)).toBe(true);
    expect(isOverdue({ status: 'done', dueAt: '2026-09-07T08:00:00' } as never, now)).toBe(false);
    expect(isOverdue({ status: 'todo', dueAt: null } as never, now)).toBe(false);
  });

  it('toLocalInput 截断到分钟（datetime-local 用）', () => {
    expect(toLocalInput('2026-09-08T10:00:00')).toBe('2026-09-08T10:00');
    expect(toLocalInput(null)).toBe('');
  });
});

describe('timeShort', () => {
  const now = new Date('2026-09-08T18:00:00');

  it('当天的笔记只显示时分', () => {
    expect(timeShort('2026-09-08T10:32:00', now)).toBe('10:32');
  });

  it('跨天显示 月/日', () => {
    expect(timeShort('2026-09-01T09:00:00', now)).toBe('9/1');
  });
});
