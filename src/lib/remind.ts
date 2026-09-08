/** 提前提醒选项（任务抽屉与日历面板共用）。value 为字符串便于 select 使用：'null'=不提醒，'0'=准点，n=提前 n 分钟。 */
export const REMIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'null', label: '不提醒' },
  { value: '0', label: '准点提醒' },
  { value: '5', label: '提前 5 分钟' },
  { value: '15', label: '提前 15 分钟' },
  { value: '30', label: '提前 30 分钟' },
  { value: '60', label: '提前 1 小时' },
  { value: '1440', label: '提前 1 天' },
];

export function remindToNumber(value: string): number | null {
  return value === 'null' ? null : Number(value);
}

export function remindToString(value: number | null | undefined): string {
  return value === null || value === undefined ? 'null' : String(value);
}
