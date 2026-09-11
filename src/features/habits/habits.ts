import type { Habit, HabitFrequency, HabitLog } from '../../types';

/**
 * 强度评分移植自 Loop Habit Tracker（iSoron/uhabits）官方算法：
 * uhabits-core/models/Score.kt —— EWMA `multiplier = 0.5^(√f / 13)`。
 * 官方 ScoreList.kt 对非每日 boolean 习惯将分子分母加倍平滑，
 * 等效于频率 f 加倍；本实现直接在 frequencyFactor 中体现（v0.7 不做滚动窗口，
 * boolean 打卡只有 0/1，f 加倍已覆盖窗口平滑的衰减效果）。
 */

/** 频率因子 f：daily=1；weekly/monthly 按官方「分子分母加倍」规则 = 2/7、2/30。 */
export function frequencyFactor(frequency: HabitFrequency): number {
  switch (frequency) {
    case 'weekly':
      return 2 / 7;
    case 'monthly':
      return 2 / 30;
    default:
      return 1;
  }
}

/** EWMA 衰减乘数：0.5^(√f / 13)，等效半衰期 = 13/√f 天。 */
export function multiplier(f: number): number {
  return Math.pow(0.5, Math.sqrt(f) / 13);
}

/** 单日 EWMA 更新：score = prev*m + checkmark*(1-m)。 */
export function habitScore(prev: number, f: number, checkmark: number): number {
  const m = multiplier(f);
  return Math.min(1, prev * m + checkmark * (1 - m));
}

function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 从习惯创建日（或首个日志日，取较早者）逐日迭代 EWMA 到 today，返回 [起点..today] 每日分数。
 * value=2（跳过）当天冻结：分数原样延续。
 */
export function scoreSeries(habit: Habit, logs: HabitLog[], today: string): number[] {
  const f = frequencyFactor(habit.frequency);
  const byDate = new Map(logs.map((l) => [l.date, l.value]));
  const firstLog = logs.length > 0 ? logs.map((l) => l.date).sort()[0] : null;
  const created = dateOf(habit.createdAt);
  let start = firstLog && firstLog < created ? firstLog : created;
  if (start > today) start = today;
  const series: number[] = [];
  let score = 0;
  for (let d = start; ; d = addDays(d, 1)) {
    const value = byDate.get(d);
    if (value === 2) {
      // 跳过：分数冻结
    } else {
      score = habitScore(score, f, value === 1 ? 1 : 0);
    }
    series.push(score);
    if (d === today) break;
  }
  return series;
}

/** 当前强度分数 0..1：scoreSeries 的最后一个值。 */
export function currentScore(habit: Habit, logs: HabitLog[], today: string): number {
  const series = scoreSeries(habit, logs, today);
  return series[series.length - 1] ?? 0;
}

/**
 * 当前连续打卡天数（uhabits 语义：连续段天数，跳过 value=2 占位不打断）。
 * 今天未打卡不打断（从昨天起算）。
 */
export function streak(logs: HabitLog[], today: string): number {
  const byDate = new Map(logs.map((l) => [l.date, l.value]));
  if (byDate.size === 0) return 0;
  // 锚点：今天已打卡用今天，否则用昨天
  const anchor = byDate.get(today) === 1 ? today : addDays(today, -1);
  if (!byDate.has(anchor)) return 0;
  // 从锚点往回找连续段起点（段内每天都出现在 byDate，value 为 1 或 2）
  let start = anchor;
  for (;;) {
    const prev = addDays(start, -1);
    const v = byDate.get(prev);
    if (v === 1 || v === 2) start = prev;
    else break;
  }
  // 段天数 = 起点..锚点 的日历跨度
  const ms = new Date(`${anchor}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.round(ms / 86400000) + 1;
}

/** 历史最长连续打卡天数（按日期跨度计，跳过日占位不打断）。 */
export function bestStreak(logs: HabitLog[]): number {
  const byDate = new Map(logs.map((l) => [l.date, l.value]));
  const dates = [...byDate.keys()].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const date of dates) {
    const v = byDate.get(date);
    if (v === 1) {
      run = prev !== null && addDays(prev, 1) === date ? run + 1 : 1;
      best = Math.max(best, run);
      prev = date;
    } else if (v === 2 && prev !== null && addDays(prev, 1) === date) {
      prev = date; // 跳过日占位，段延续
    } else {
      prev = null;
      run = 0;
    }
  }
  return best;
}

/** 热力图数据：以 today 结尾、对齐周日起始的 weeks×7 网格。 */
export function heatmapData(
  logs: HabitLog[],
  weeks: number,
  today: string,
): Array<{ date: string; value: number }> {
  const byDate = new Map(logs.filter((l) => l.value === 1).map((l) => [l.date, l.value]));
  const todayD = new Date(`${today}T00:00:00`);
  const daysAfterSunday = todayD.getDay(); // 周日=0
  const end = new Date(todayD);
  end.setDate(end.getDate() + (6 - daysAfterSunday)); // 补齐到周六
  const cells: Array<{ date: string; value: number }> = [];
  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const p = (n: number) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    cells.push({ date, value: byDate.get(date) ?? 0 });
  }
  return cells;
}

/** 当日是否已打卡。 */
export function dailyChecked(logs: HabitLog[], habitId: string, date: string): boolean {
  return logs.some((l) => l.habitId === habitId && l.date === date && l.value === 1);
}

/** 打卡里程碑：连续天数命中即庆祝。 */
export const MILESTONES = [7, 21, 66, 100, 365, 500, 1000] as const;

/** 命中里程碑则返回天数，否则返回 null。 */
export function hitMilestone(streakDays: number): number | null {
  return (MILESTONES as readonly number[]).includes(streakDays) ? streakDays : null;
}
