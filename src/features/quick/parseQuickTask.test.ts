import { describe, expect, it } from 'vitest';
import { parseQuickTask } from './parseQuickTask';

// 2026-09-07 是周一
const now = new Date('2026-09-07T10:00:00');

describe('parseQuickTask', () => {
  it('明天 + 时间', () => {
    const r = parseQuickTask('明天 15:00 开周会', now);
    expect(r.title).toBe('开周会');
    expect(r.dueAt).toBe('2026-09-08T15:00:00');
  });

  it('今天 无时间 → 09:00', () => {
    const r = parseQuickTask('今天 散步', now);
    expect(r.title).toBe('散步');
    expect(r.dueAt).toBe('2026-09-07T09:00:00');
  });

  it('后天', () => {
    const r = parseQuickTask('后天 交作业', now);
    expect(r.dueAt).toBe('2026-09-09T09:00:00');
  });

  it('周X → 下一个该星期', () => {
    const r = parseQuickTask('周五 写周报', now);
    expect(r.dueAt).toBe('2026-09-11T09:00:00');
  });

  it('仅时间：未过 → 今天；已过 → 明天', () => {
    expect(parseQuickTask('14:30 站会', now).dueAt).toBe('2026-09-07T14:30:00');
    expect(parseQuickTask('08:00 晨跑', now).dueAt).toBe('2026-09-08T08:00:00');
  });

  it('X点半 写法', () => {
    expect(parseQuickTask('3点半 评审', now).dueAt).toBe('2026-09-07T15:30:00');
  });

  it('无日期短语 → dueAt 为 null', () => {
    const r = parseQuickTask('写周报', now);
    expect(r.title).toBe('写周报');
    expect(r.dueAt).toBeNull();
  });

  it('空输入', () => {
    expect(parseQuickTask('   ', now)).toEqual({ title: '', dueAt: null });
  });
});
