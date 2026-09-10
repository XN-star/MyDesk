import { describe, expect, it } from 'vitest';
import { nextOccurrence, REPEAT_LABEL } from './repeat';

describe('nextOccurrence', () => {
  it('每天：+1 天并保留时刻', () => {
    expect(nextOccurrence('2026-09-08T15:30:00', 'daily')).toBe('2026-09-09T15:30:00');
  });

  it('每周：+7 天', () => {
    expect(nextOccurrence('2026-09-08T09:00:00', 'weekly')).toBe('2026-09-15T09:00:00');
  });

  it('每月：+1 月并保留时刻（31 日 +1 月溢出按 JS 语义滚到下月初）', () => {
    expect(nextOccurrence('2026-01-15T10:00:00', 'monthly')).toBe('2026-02-15T10:00:00');
    expect(nextOccurrence('2026-01-31T10:00:00', 'monthly')).toBe('2026-03-03T10:00:00');
  });

  it('跨月/跨年', () => {
    expect(nextOccurrence('2026-12-31T23:00:00', 'daily')).toBe('2027-01-01T23:00:00');
    expect(nextOccurrence('2026-12-10T08:00:00', 'monthly')).toBe('2027-01-10T08:00:00');
  });

  it('无 dueAt 返回 null（不生成下一单）', () => {
    expect(nextOccurrence(null, 'daily')).toBeNull();
  });

  it('repeat 为空返回 null', () => {
    expect(nextOccurrence('2026-09-08T09:00:00', null)).toBeNull();
  });
});

describe('REPEAT_LABEL', () => {
  it('三档标签', () => {
    expect(REPEAT_LABEL.daily).toBe('每天');
    expect(REPEAT_LABEL.weekly).toBe('每周');
    expect(REPEAT_LABEL.monthly).toBe('每月');
  });
});
