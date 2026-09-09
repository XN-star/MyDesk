import type { Link, LinkKind } from '../../types';

/** 标题+目标不区分大小写包含匹配；关键字为空白时返回全部。 */
export function searchLinks(links: Link[], keyword: string): Link[] {
  const k = keyword.trim().toLowerCase();
  if (!k) return links;
  return links.filter(
    (l) => l.title.toLowerCase().includes(k) || l.target.toLowerCase().includes(k),
  );
}

/**
 * 网格拖拽排序（中点算法，与任务看板一致）。
 * 返回重排后的新数组与被移动条目的新 sort_order；位置无变化返回 null。
 */
export function applyLinkMove(
  links: Link[],
  id: string,
  targetIndex: number,
): { next: Link[]; sortOrder: number } | null {
  const moving = links.find((l) => l.id === id);
  if (!moving) return null;
  const currentIndex = links.findIndex((l) => l.id === id);
  const rest = links.filter((l) => l.id !== id);
  const idx = Math.max(0, Math.min(targetIndex, rest.length));
  if (currentIndex === idx) return null;
  const prev = idx > 0 ? rest[idx - 1].sortOrder : null;
  const next = idx < rest.length ? rest[idx].sortOrder : null;
  const sortOrder =
    prev !== null && next !== null
      ? (prev + next) / 2
      : prev !== null
        ? prev + 100
        : next !== null
          ? next / 2
          : 100;
  const nextList = [...rest];
  nextList.splice(idx, 0, moving);
  return { next: nextList, sortOrder };
}

/** 卡片图标。 */
export function kindIcon(kind: LinkKind): string {
  return kind === 'url' ? '🌐' : kind === 'path' ? '📁' : '⚡';
}

/** url 无协议头自动补 https://；其余 trim。 */
export function normalizeTarget(kind: LinkKind, raw: string): string {
  const t = raw.trim();
  if (kind !== 'url') return t;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
}

/** 保存前校验；null=合法，否则为错误提示。 */
export function validateTarget(kind: LinkKind, raw: string): string | null {
  const t = raw.trim();
  if (!t) return '目标不能为空';
  if (kind === 'url' && !/^https?:\/\//i.test(normalizeTarget('url', t))) {
    return '网址需以 http(s):// 开头';
  }
  return null;
}
