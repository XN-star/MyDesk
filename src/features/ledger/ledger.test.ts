import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from '../../types';
import {
  budgetProgress,
  centsToYuan,
  categoriesOf,
  categoryBreakdown,
  monthSummary,
  yuanToCents,
} from './ledger';

function entry(partial: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: partial.id ?? 'e1',
    kind: partial.kind ?? 'expense',
    amount: partial.amount ?? 0,
    category: partial.category ?? '其他',
    note: partial.note ?? '',
    date: partial.date ?? '2026-09-11',
    createdAt: '2026-09-11T12:00:00',
    updatedAt: '2026-09-11T12:00:00',
  };
}

describe('centsToYuan / yuanToCents', () => {
  it('分转元显示', () => {
    expect(centsToYuan(1800)).toBe('18');
    expect(centsToYuan(1805)).toBe('18.05');
    expect(centsToYuan(1850)).toBe('18.5');
    expect(centsToYuan(0)).toBe('0');
  });

  it('元转分', () => {
    expect(yuanToCents('18')).toBe(1800);
    expect(yuanToCents('18.5')).toBe(1850);
    expect(yuanToCents('18.05')).toBe(1805);
    expect(yuanToCents(' 12.30 ')).toBe(1230);
  });

  it('非法输入返回 null', () => {
    expect(yuanToCents('')).toBeNull();
    expect(yuanToCents('abc')).toBeNull();
    expect(yuanToCents('-5')).toBeNull();
    expect(yuanToCents('1.234')).toBeNull();
  });

  it('roundtrip 保持一致', () => {
    for (const cents of [0, 1, 99, 100, 12345, 999999]) {
      expect(yuanToCents(centsToYuan(cents))).toBe(cents);
    }
  });
});

describe('monthSummary', () => {
  it('汇总收入支出结余', () => {
    const entries = [
      entry({ kind: 'income', amount: 500000 }),
      entry({ kind: 'expense', amount: 1800 }),
      entry({ kind: 'expense', amount: 3200, date: '2026-09-12' }),
    ];
    expect(monthSummary(entries)).toEqual({ income: 500000, expense: 5000, balance: 495000 });
  });

  it('空列表全零', () => {
    expect(monthSummary([])).toEqual({ income: 0, expense: 0, balance: 0 });
  });
});

describe('categoryBreakdown', () => {
  it('只统计指定 kind 并按金额降序', () => {
    const entries = [
      entry({ kind: 'expense', amount: 3000, category: '餐饮' }),
      entry({ kind: 'expense', amount: 1000, category: '交通' }),
      entry({ kind: 'income', amount: 99999, category: '工资' }),
    ];
    const slices = categoryBreakdown(entries, 'expense');
    expect(slices.map((s) => s.category)).toEqual(['餐饮', '交通']);
    expect(slices[0].ratio).toBeCloseTo(0.75);
    expect(slices[1].ratio).toBeCloseTo(0.25);
  });

  it('无该类记录返回空', () => {
    expect(categoryBreakdown([entry({ kind: 'income', amount: 100 })], 'expense')).toEqual([]);
  });
});

describe('budgetProgress', () => {
  it('正常进度', () => {
    const p = budgetProgress(6400, 10000);
    expect(p.ratio).toBeCloseTo(0.64);
    expect(p.remaining).toBe(3600);
    expect(p.over).toBe(false);
  });

  it('超支', () => {
    const p = budgetProgress(11000, 10000);
    expect(p.over).toBe(true);
    expect(p.remaining).toBe(-1000);
    expect(p.ratio).toBeGreaterThan(1);
  });

  it('未设置预算', () => {
    expect(budgetProgress(5000, 0)).toEqual({
      spent: 5000,
      budget: 0,
      ratio: 0,
      remaining: 0,
      over: false,
    });
  });
});

describe('categoriesOf', () => {
  it('按 kind 返回分类', () => {
    expect(categoriesOf('expense')).toContain('餐饮');
    expect(categoriesOf('income')).toContain('工资');
    expect(categoriesOf('income')).not.toContain('餐饮');
  });
});
