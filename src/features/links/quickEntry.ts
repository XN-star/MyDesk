import type { Link } from '../../types';
import { searchLinks } from './links';

export interface EntryMode {
  /** 展示的入口列表（入口模式=前 9 个；bang 模式=过滤结果，最多 9 个） */
  list: Link[];
  /** 当前选中下标 */
  sel: number;
  /** bang 模式的关键词（入口模式为 ''） */
  query: string;
}

const ENTRY_LIMIT = 9;

/**
 * 快速面板入口模式判定：
 * - 空格开头（`' '` 或 `' N'`）：列出前 9 个入口，N 为 1-9 序号选中；
 * - `/关键词`：按关键词过滤入口；
 * 其余输入返回 null（走任务搜索/创建）。
 */
export function entryMode(links: Link[], q: string): EntryMode | null {
  if (q.startsWith(' ')) {
    const n = Number(q.slice(1).trim());
    const sel = Number.isInteger(n) && n >= 1 && n <= links.length ? n - 1 : 0;
    return { list: links.slice(0, ENTRY_LIMIT), sel, query: '' };
  }
  if (q.startsWith('/')) {
    const query = q.slice(1);
    if (!query.trim()) return null;
    return { list: searchLinks(links, query).slice(0, ENTRY_LIMIT), sel: 0, query };
  }
  return null;
}
