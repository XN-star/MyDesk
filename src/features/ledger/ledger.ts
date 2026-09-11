import type { LedgerEntry, LedgerKind } from '../../types';

/** 支出分类（含 emoji 标识），固定预设不做分类管理。 */
export const EXPENSE_CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '居住', '医疗', '其他'] as const;

/** 收入分类。 */
export const INCOME_CATEGORIES = ['工资', '兼职', '红包', '其他'] as const;

export const CATEGORY_EMOJI: Record<string, string> = {
  餐饮: '🍜',
  交通: '🚌',
  购物: '🛍',
  娱乐: '🎮',
  居住: '🏠',
  医疗: '💊',
  工资: '💼',
  兼职: '💻',
  红包: '🧧',
  其他: '📦',
};

export function categoriesOf(kind: LedgerKind): readonly string[] {
  return kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

/** 金额「分 → 元」显示字符串：1800 → '18'，1805 → '18.05'，1850 → '18.5'（去尾随零）。 */
export function centsToYuan(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const rest = abs % 100;
  if (rest === 0) return `${sign}${yuan}`;
  const frac = String(rest).padStart(2, '0').replace(/0+$/, '');
  return `${sign}${yuan}.${frac}`;
}

/** 金额「元字符串 → 分」；非法或为空返回 null。'18.5' → 1850 */
export function yuanToCents(input: string): number | null {
  const s = input.trim().replace('¥', '');
  if (!s || !/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [yuan, rest = ''] = s.split('.');
  return Number(yuan) * 100 + Number((rest + '00').slice(0, 2) || 0);
}

export interface MonthSummary {
  income: number;
  expense: number;
  balance: number;
}

/** 月度汇总：收入 / 支出 / 结余（单位分）。 */
export function monthSummary(entries: LedgerEntry[]): MonthSummary {
  let income = 0;
  let expense = 0;
  for (const e of entries) {
    if (e.kind === 'income') income += e.amount;
    else expense += e.amount;
  }
  return { income, expense, balance: income - expense };
}

export interface CategorySlice {
  category: string;
  amount: number;
  /** 占总支出（或总收入）比例 0..1 */
  ratio: number;
}

/** 分类占比：只统计指定 kind，按金额降序。 */
export function categoryBreakdown(entries: LedgerEntry[], kind: LedgerKind): CategorySlice[] {
  const totals = new Map<string, number>();
  let sum = 0;
  for (const e of entries) {
    if (e.kind !== kind) continue;
    totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
    sum += e.amount;
  }
  if (sum === 0) return [];
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount, ratio: amount / sum }))
    .sort((a, b) => b.amount - a.amount);
}

export interface BudgetProgress {
  spent: number;
  budget: number;
  /** 0..1+，可超 1 表示超支 */
  ratio: number;
  /** 剩余预算（分），可为负 */
  remaining: number;
  /** 是否超支 */
  over: boolean;
}

/** 预算进度：budget 为 0 或负数视为未设置预算。 */
export function budgetProgress(expenseCents: number, budgetCents: number): BudgetProgress {
  if (budgetCents <= 0) {
    return { spent: expenseCents, budget: 0, ratio: 0, remaining: 0, over: false };
  }
  return {
    spent: expenseCents,
    budget: budgetCents,
    ratio: expenseCents / budgetCents,
    remaining: budgetCents - expenseCents,
    over: expenseCents > budgetCents,
  };
}
