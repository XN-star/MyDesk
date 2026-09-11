import { describe, expect, it } from 'vitest';
import type { Habit, HabitLog } from '../../types';
import {
  bestStreak,
  currentScore,
  dailyChecked,
  frequencyFactor,
  habitCounts,
  habitScore,
  hitMilestone,
  mondayOf,
  multiplier,
  streak,
} from './habits';

function habit(p: Partial<Habit>): Habit {
  return {
    id: 'h1',
    name: '健身',
    frequency: 'daily',
    reminder: null,
    archived: false,
    createdAt: '2026-09-01T09:00:00',
    updatedAt: '2026-09-01T09:00:00',
    ...p,
  };
}

function log(habitId: string, date: string, value = 1): HabitLog {
  return { id: `${habitId}-${date}`, habitId, date, value };
}

describe('multiplier / habitScore（uhabits EWMA）', () => {
  it('每日习惯 multiplier = 0.5^(1/13)', () => {
    expect(multiplier(1)).toBeCloseTo(Math.pow(0.5, 1 / 13), 12);
  });

  it('每日习惯首日打卡得分 ≈ 0.051922（官方测试期望值）', () => {
    const s = habitScore(0, 1, 1);
    expect(s).toBeCloseTo(1 - Math.pow(0.5, 1 / 13), 5);
    expect(s).toBeGreaterThan(0.0519);
    expect(s).toBeLessThan(0.0520);
  });

  it('连续不打卡按半衰期 13 天衰减', () => {
    let s = 0.99;
    for (let i = 0; i < 13; i++) s = habitScore(s, 1, 0);
    expect(s).toBeCloseTo(0.495, 2);
  });

  it('weekly 习惯 f 加倍平滑（官方 numerator/denominator ×2）', () => {
    expect(frequencyFactor('weekly')).toBeCloseTo(2 / 7, 12);
    expect(frequencyFactor('monthly')).toBeCloseTo(2 / 30, 12);
    expect(frequencyFactor('daily')).toBe(1);
  });

  it('分数封顶 1', () => {
    let s = 0;
    for (let i = 0; i < 200; i++) s = habitScore(s, 1, 1);
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe('streak', () => {
  const h = 'h1';

  it('连续打卡计数', () => {
    const logs = [log(h, '2026-09-05'), log(h, '2026-09-06'), log(h, '2026-09-07')];
    expect(streak(logs, '2026-09-07')).toBe(3);
  });

  it('今天未打卡不打断（从昨天起算）', () => {
    const logs = [log(h, '2026-09-05'), log(h, '2026-09-06')];
    expect(streak(logs, '2026-09-07')).toBe(2);
  });

  it('中间断档归零', () => {
    const logs = [log(h, '2026-09-05'), log(h, '2026-09-07')];
    expect(streak(logs, '2026-09-07')).toBe(1);
  });

  it('SKIP（value=2）不打断连续', () => {
    const logs = [log(h, '2026-09-05'), log(h, '2026-09-06', 2), log(h, '2026-09-07')];
    expect(streak(logs, '2026-09-07')).toBe(3);
  });
});

describe('bestStreak', () => {
  it('取历史最长一段', () => {
    const logs = [
      log('h1', '2026-09-01'),
      log('h1', '2026-09-02'),
      log('h1', '2026-09-03'),
      log('h1', '2026-09-06'),
      log('h1', '2026-09-07'),
    ];
    expect(bestStreak(logs)).toBe(3);
  });
});

describe('currentScore', () => {
  it('从习惯创建日迭代到今天', () => {
    const h = habit({ createdAt: '2026-09-01T09:00:00' });
    const logs = [log('h1', '2026-09-02'), log('h1', '2026-09-03')];
    // 手工按 EWMA 迭代验证
    let s = 0;
    for (let d = 1; d <= 7; d++) {
      const date = `2026-09-0${d}`;
      const done = logs.some((l) => l.date === date && l.value === 1);
      s = habitScore(s, 1, done ? 1 : 0);
    }
    expect(currentScore(h, logs, '2026-09-07')).toBeCloseTo(s, 12);
  });
});

describe('dailyChecked', () => {
  it('按习惯 id 判断当日是否已打卡', () => {
    const logs = [log('h1', '2026-09-09')];
    expect(dailyChecked(logs, 'h1', '2026-09-09')).toBe(true);
    expect(dailyChecked(logs, 'h2', '2026-09-09')).toBe(false);
  });
});

describe('habitCounts', () => {
  it('本周/本月/本年分别计数（2026-09-09 是周三）', () => {
    const logs = [
      log('h1', '2026-09-07'), // 本周一
      log('h1', '2026-09-09'), // 今天
      log('h1', '2026-09-01'), // 本月，上周二
      log('h1', '2026-01-15'), // 今年 1 月
      log('h1', '2025-12-31'), // 去年，全部不计
      log('h1', '2026-09-10', 2), // 未来日期不存在，但 value=2 跳过不计数
      log('h2', '2026-09-09'), // 别的习惯
    ];
    expect(habitCounts(logs, 'h1', '2026-09-09')).toEqual({ week: 2, month: 3, year: 4 });
  });

  it('周一恰好是一周起点（2026-09-07 周一）', () => {
    const logs = [log('h1', '2026-09-07'), log('h1', '2026-09-06')];
    expect(habitCounts(logs, 'h1', '2026-09-07')).toEqual({ week: 1, month: 2, year: 2 });
  });

  it('月边界：1 号算本月；上月最后一天不算月但同属 ISO 周则计周', () => {
    // 2026-09-01 是周二，本周一是 08-31
    const logs = [log('h1', '2026-09-01'), log('h1', '2026-08-31')];
    expect(habitCounts(logs, 'h1', '2026-09-01')).toEqual({ week: 2, month: 1, year: 2 });
  });

  it('年边界与空日志（ISO 跨年周计入本周）', () => {
    // 2026-01-01 是周四，本周一是 2025-12-29，12-31 属于同一 ISO 周
    expect(habitCounts([log('h1', '2025-12-31')], 'h1', '2026-01-01')).toEqual({
      week: 1,
      month: 0,
      year: 0,
    });
    expect(habitCounts([], 'h1', '2026-09-09')).toEqual({ week: 0, month: 0, year: 0 });
  });
});

describe('mondayOf', () => {
  it('周日回退到上周一，周一返回自身', () => {
    expect(mondayOf('2026-09-13')).toBe('2026-09-07'); // 周日
    expect(mondayOf('2026-09-07')).toBe('2026-09-07'); // 周一
    expect(mondayOf('2026-09-12')).toBe('2026-09-07'); // 周六
  });
});

describe('hitMilestone', () => {
  it('命中里程碑返回天数', () => {
    for (const m of [7, 21, 66, 100, 365, 500, 1000]) {
      expect(hitMilestone(m)).toBe(m);
    }
  });

  it('未命中返回 null', () => {
    expect(hitMilestone(0)).toBeNull();
    expect(hitMilestone(1)).toBeNull();
    expect(hitMilestone(6)).toBeNull();
    expect(hitMilestone(8)).toBeNull();
    expect(hitMilestone(99)).toBeNull();
    expect(hitMilestone(366)).toBeNull();
  });
});
