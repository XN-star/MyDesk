export type Repeat = 'daily' | 'weekly' | 'monthly';

/** 重复规则的中文标签（抽屉下拉与卡片徽标共用）。 */
export const REPEAT_LABEL: Record<Repeat, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 重复任务的下一次到期时刻：dueAt 按 daily/weekly/monthly 顺延，时刻保留。
 * 无 dueAt 或无规则时返回 null（不生成下一单）。
 */
export function nextOccurrence(dueAt: string | null, repeat: Repeat | null): string | null {
  if (!dueAt || !repeat) return null;
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return null;
  switch (repeat) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}
