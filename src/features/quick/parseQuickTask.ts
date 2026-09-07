export interface ParsedQuickTask {
  title: string;
  dueAt: string | null;
}

const WEEK: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
const DAY_WORDS: Array<[string, number]> = [
  ['大后天', 3],
  ['后天', 2],
  ['明天', 1],
  ['今天', 0],
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

/** 规则解析：今天/明天/后天/大后天/周X/星期X + HH:MM|X点半|X点。无匹配日期短语时 dueAt=null。 */
export function parseQuickTask(raw: string, now: Date = new Date()): ParsedQuickTask {
  let text = raw.trim();
  if (!text) return { title: '', dueAt: null };

  let datePart: Date | null = null;
  let timePart: [number, number] | null = null;

  for (const [word, delta] of DAY_WORDS) {
    const idx = text.indexOf(word);
    if (idx !== -1) {
      const d = new Date(now);
      d.setDate(d.getDate() + delta);
      datePart = d;
      text = text.replace(word, ' ');
      break;
    }
  }
  if (!datePart) {
    const m = text.match(/(?:周|星期|礼拜)([一二三四五六日天])/);
    if (m) {
      const target = WEEK[m[1]];
      const d = new Date(now);
      let delta = (target - d.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      d.setDate(d.getDate() + delta);
      datePart = d;
      text = text.replace(m[0], ' ');
    }
  }

  const tm = text.match(/(\d{1,2})[:：点](半|\d{1,2})?/);
  if (tm) {
    let h = Number(tm[1]);
    // 「3点半」「3:30」这类无日期短语时按口语习惯把 1-7 点视为下午
    const isColloquial = tm[0].includes('点');
    if (!datePart && isColloquial && h >= 1 && h <= 7) h += 12;
    const min = tm[2] === '半' ? 30 : tm[2] ? Number(tm[2]) : 0;
    if (h >= 0 && h < 24 && min < 60) {
      timePart = [h, min];
      text = text.replace(tm[0], ' ');
    }
  }

  let dueAt: string | null = null;
  if (datePart && timePart) {
    datePart.setHours(timePart[0], timePart[1], 0, 0);
    dueAt = toIso(datePart);
  } else if (datePart) {
    datePart.setHours(9, 0, 0, 0);
    dueAt = toIso(datePart);
  } else if (timePart) {
    const candidate = new Date(now);
    candidate.setHours(timePart[0], timePart[1], 0, 0);
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
    dueAt = toIso(candidate);
  }

  return { title: text.replace(/\s+/g, ' ').trim(), dueAt };
}
