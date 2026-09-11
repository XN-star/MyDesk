import type { WorkoutLog, WorkoutType } from '../../types';

/** 锻炼类型（含 emoji 标识）。 */
export const WORKOUT_TYPES: WorkoutType[] = ['跑步', '力量', '游泳', '骑行', '球类', '瑜伽', '其他'];

export const WORKOUT_EMOJI: Record<WorkoutType, string> = {
  跑步: '🏃',
  力量: '🏋',
  游泳: '🏊',
  骑行: '🚴',
  球类: '🏸',
  瑜伽: '🧘',
  其他: '💪',
};

/** BMI = 体重kg / 身高m²；身高体重非法（<=0）返回 null。 */
export function bmi(weightKg: number, heightCm: number): number | null {
  if (weightKg <= 0 || heightCm <= 0) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** BMI 中文分级（中国标准）。 */
export function bmiLabel(value: number): string {
  if (value < 18.5) return '偏瘦';
  if (value < 24) return '正常';
  if (value < 28) return '偏胖';
  return '肥胖';
}

/** 最新体重记录（按日期最大）。 */
export function latestWeight(weights: Array<{ date: string; weight: number }>): { date: string; weight: number } | null {
  if (weights.length === 0) return null;
  return weights.reduce((a, b) => (a.date > b.date ? a : b));
}

export interface WeightSeriesPoint {
  date: string;
  weight: number;
}

/**
 * 趋势序列：取最近 days 天（含 today）内按日期升序的记录。
 * 超过 5 条时等间隔抽样至最多 maxPoints 个点，保持首尾。
 */
export function weightSeries(
  weights: Array<{ date: string; weight: number }>,
  today: string,
  days = 90,
  maxPoints = 30,
): WeightSeriesPoint[] {
  const from = addDays(today, -(days - 1));
  const inRange = weights
    .filter((w) => w.date >= from && w.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (inRange.length <= maxPoints) return inRange;
  const step = (inRange.length - 1) / (maxPoints - 1);
  const points: WeightSeriesPoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    points.push(inRange[Math.round(i * step)]);
  }
  return points;
}

export interface WeekWorkoutStats {
  count: number;
  minutes: number;
}

/** 本周（周一起算）锻炼统计。 */
export function weeklyWorkouts(workouts: WorkoutLog[], today: string): WeekWorkoutStats {
  const monday = mondayOf(today);
  const inWeek = workouts.filter((w) => w.date >= monday && w.date <= today);
  return {
    count: inWeek.length,
    minutes: inWeek.reduce((sum, w) => sum + w.minutes, 0),
  };
}

/** 本月（1 号起）锻炼统计。 */
export function monthlyWorkouts(workouts: WorkoutLog[], today: string): WeekWorkoutStats {
  const first = `${today.slice(0, 7)}-01`;
  const inMonth = workouts.filter((w) => w.date >= first && w.date <= today);
  return {
    count: inMonth.length,
    minutes: inMonth.reduce((sum, w) => sum + w.minutes, 0),
  };
}

export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 所在周的周一（ISO 周，周一起算）。 */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const day = d.getDay(); // 周日=0
  const delta = day === 0 ? -6 : 1 - day;
  return addDays(date, delta);
}
