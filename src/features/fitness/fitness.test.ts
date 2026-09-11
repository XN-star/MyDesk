import { describe, expect, it } from 'vitest';
import type { WorkoutLog } from '../../types';
import {
  addDays,
  bmi,
  bmiLabel,
  latestWeight,
  mondayOf,
  monthlyWorkouts,
  weightSeries,
  weeklyWorkouts,
} from './fitness';

describe('bmi', () => {
  it('标准计算', () => {
    expect(bmi(64, 170)).toBeCloseTo(22.15, 1);
    expect(bmi(72.5, 175)).toBeCloseTo(23.67, 1);
  });

  it('非法输入返回 null', () => {
    expect(bmi(0, 170)).toBeNull();
    expect(bmi(60, 0)).toBeNull();
    expect(bmi(-1, 170)).toBeNull();
  });
});

describe('bmiLabel', () => {
  it('中国标准分级', () => {
    expect(bmiLabel(17)).toBe('偏瘦');
    expect(bmiLabel(22)).toBe('正常');
    expect(bmiLabel(25)).toBe('偏胖');
    expect(bmiLabel(29)).toBe('肥胖');
  });
});

describe('latestWeight', () => {
  it('取日期最大的记录', () => {
    const ws = [
      { date: '2026-09-01', weight: 73 },
      { date: '2026-09-10', weight: 72.5 },
      { date: '2026-09-05', weight: 72.8 },
    ];
    expect(latestWeight(ws)?.weight).toBe(72.5);
  });

  it('空返回 null', () => {
    expect(latestWeight([])).toBeNull();
  });
});

describe('weightSeries', () => {
  it('区间过滤并升序', () => {
    const ws = [
      { date: '2026-05-01', weight: 74 }, // 超出 90 天窗口
      { date: '2026-09-10', weight: 72.5 },
      { date: '2026-09-01', weight: 73 },
    ];
    const pts = weightSeries(ws, '2026-09-11');
    expect(pts.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-10']);
  });

  it('超量时等间隔抽样保持首尾', () => {
    const ws: Array<{ date: string; weight: number }> = [];
    for (let i = 0; i < 60; i++) {
      const date = addDays('2026-09-11', -(59 - i));
      ws.push({ date, weight: 70 + i / 10 });
    }
    const pts = weightSeries(ws, '2026-09-11', 90, 30);
    expect(pts.length).toBe(30);
    expect(pts[0].date).toBe(ws[0].date);
    expect(pts[29].date).toBe(ws[59].date);
  });
});

describe('weeklyWorkouts / monthlyWorkouts', () => {
  const mk = (date: string, minutes: number): WorkoutLog => ({
    id: `k-${date}-${minutes}`,
    date,
    type: '跑步',
    minutes,
    note: '',
    createdAt: `${date}T19:00:00`,
    updatedAt: `${date}T19:00:00`,
  });

  it('本周从周一起算（2026-09-11 是周五）', () => {
    expect(mondayOf('2026-09-11')).toBe('2026-09-07');
    const ws = [
      mk('2026-09-07', 30), // 周一
      mk('2026-09-06', 45), // 上周日，不计
      mk('2026-09-10', 60), // 周四
      mk('2026-09-12', 20), // 明天（超出 today），不计
    ];
    expect(weeklyWorkouts(ws, '2026-09-11')).toEqual({ count: 2, minutes: 90 });
  });

  it('周日所在的周从上周一开始', () => {
    expect(mondayOf('2026-09-13')).toBe('2026-09-07');
  });

  it('本月从 1 号起算', () => {
    const ws = [mk('2026-08-31', 60), mk('2026-09-01', 30), mk('2026-09-11', 45)];
    expect(monthlyWorkouts(ws, '2026-09-11')).toEqual({ count: 2, minutes: 75 });
  });
});
