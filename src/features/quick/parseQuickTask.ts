export interface ParsedQuickTask {
  title: string;
  dueAt: string | null;
  remindMinutesBefore: number | null;
  description: string;
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

/** 规则解析：今天/明天/后天/大后天/周X/星期X + HH:MM|X点半|X点；重复短语（每天/每周X/每月X号）触发准点提醒；#标签 移入描述。 */
export function parseQuickTask(raw: string, now: Date = new Date()): ParsedQuickTask {
  const empty: ParsedQuickTask = { title: '', dueAt: null, remindMinutesBefore: null, description: '' };
  let text = raw.trim();
  if (!text) return empty;

  // #标签：移入描述前缀（# 后须有非符号字符，避免误伤「C#」）
  let description = '';
  const tags: string[] = [];
  text = text.replace(/#([^\s#]+)/g, (m, tag: string) => {
    if (/^[\p{P}\p{S}]+$/u.test(tag)) return m;
    tags.push(tag);
    return ' ';
  });
  if (tags.length > 0) description = `标签：${tags.join('、')}`;

  // 重复短语：每天 / 每周X / 每月X号 → 准点提醒
  let repeat = false;
  let repeatDate: Date | null = null;

  const everyDay = text.match(/每天|每日/);
  if (everyDay) {
    repeat = true;
    text = text.replace(everyDay[0], ' ');
  }

  if (!repeat) {
    const everyWeek = text.match(/每(?:周|星期|礼拜)([一二三四五六日天])/);
    if (everyWeek) {
      repeat = true;
      const target = WEEK[everyWeek[1]];
      const d = new Date(now);
      let delta = (target - d.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      d.setDate(d.getDate() + delta);
      repeatDate = d;
      text = text.replace(everyWeek[0], ' ');
    }
  }

  if (!repeat) {
    const everyMonth = text.match(/每月\s*(\d{1,2})\s*[号日]/);
    if (everyMonth) {
      repeat = true;
      const day = Number(everyMonth[1]);
      if (day >= 1 && day <= 31) {
        const d = new Date(now);
        const candidates = [d, new Date(d.getFullYear(), d.getMonth() + 1, 1)];
        const hit = candidates
          .map((base) => new Date(base.getFullYear(), base.getMonth(), day))
          .find((c) => c >= new Date(now.getFullYear(), now.getMonth(), now.getDate()));
        repeatDate = hit ?? new Date(now.getFullYear(), now.getMonth() + 1, day);
      }
      text = text.replace(everyMonth[0], ' ');
    }
  }

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
  if (repeat) {
    const explicitDate = repeatDate ?? datePart;
    const base = explicitDate ?? new Date(now);
    base.setHours(timePart ? timePart[0] : 9, timePart ? timePart[1] : 0, 0, 0);
    // 无明确日期的重复（每天）：时刻已过则顺延到明天；每周/每月日期已定在将来，无需顺延
    if (!explicitDate && base <= now) base.setDate(base.getDate() + 1);
    dueAt = toIso(base);
  } else if (datePart && timePart) {
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

  const remindMinutesBefore = repeat && dueAt ? 0 : null;
  return { title: text.replace(/\s+/g, ' ').trim(), dueAt, remindMinutesBefore, description };
}
