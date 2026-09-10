import type { Note } from '../../types';

/** 标题+内容不区分大小写包含匹配；关键字为空白时返回全部。 */
export function searchNotes(notes: Note[], keyword: string): Note[] {
  const k = keyword.trim().toLowerCase();
  if (!k) return notes;
  return notes.filter(
    (n) => n.title.toLowerCase().includes(k) || n.content.toLowerCase().includes(k),
  );
}

/** 依赖后端已排序的输入，保持组内顺序拆为 [置顶, 其余]。 */
export function splitPinned(notes: Note[]): [Note[], Note[]] {
  return [notes.filter((n) => n.pinned), notes.filter((n) => !n.pinned)];
}

/** 列表摘要：首个非空行，超 40 字截断加省略号。 */
export function noteExcerpt(content: string): string {
  const line = content.split('\n').find((l) => l.trim() !== '') ?? '';
  const s = line.trim();
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

/** 本地更新后维持与后端一致的顺序：置顶在前，其余按更新时间倒序。 */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** 每日笔记的约定标题：'2026-09-10' → '9月10日'（月/日去前导零）。 */
export function dailyNoteTitle(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

/** 当日笔记：按标题匹配的第一条（依赖后端已排序的输入）。 */
export function findDailyNote(notes: Note[], date: string): Note | null {
  const title = dailyNoteTitle(date);
  return notes.find((n) => n.title === title) ?? null;
}

/** 提取正文中的 [[标题]] 双向链接引用，去重并保持首次出现顺序；空标题/未闭合不算。 */
export function parseLinks(content: string): string[] {
  const links: string[] = [];
  for (const m of content.matchAll(/\[\[([^\[\]]+)\]\]/g)) {
    const title = m[1].trim();
    if (title && !links.includes(title)) links.push(title);
  }
  return links;
}
