import { describe, expect, it } from 'vitest';
import type { Link } from '../../types';
import { applyLinkMove, kindIcon, normalizeTarget, searchLinks, validateTarget } from './links';

function link(partial: Partial<Link>): Link {
  return {
    id: 'x',
    title: '',
    kind: 'url',
    target: '',
    sortOrder: 100,
    createdAt: '2026-09-08T10:00:00',
    updatedAt: '2026-09-08T10:00:00',
    ...partial,
  };
}

describe('searchLinks', () => {
  const links = [
    link({ id: '1', title: 'Gmail', target: 'https://mail.google.com' }),
    link({ id: '2', title: '素材', kind: 'path', target: 'D:\\assets' }),
  ];

  it('空关键字返回全部', () => {
    expect(searchLinks(links, '  ')).toHaveLength(2);
  });

  it('匹配标题或目标，不区分大小写', () => {
    expect(searchLinks(links, 'gmail').map((l) => l.id)).toEqual(['1']);
    expect(searchLinks(links, 'assets').map((l) => l.id)).toEqual(['2']);
    expect(searchLinks(links, 'github')).toHaveLength(0);
  });
});

describe('applyLinkMove', () => {
  const links = [
    link({ id: 'a', sortOrder: 100 }),
    link({ id: 'b', sortOrder: 200 }),
    link({ id: 'c', sortOrder: 300 }),
  ];

  it('移到中间取前后中点', () => {
    const r = applyLinkMove(links, 'c', 1);
    expect(r).not.toBeNull();
    expect(r!.sortOrder).toBe(150);
    expect(r!.next.map((l) => l.id)).toEqual(['a', 'c', 'b']);
  });

  it('移到首位取前半，移到末尾取 MAX+100，位置不变返回 null', () => {
    expect(applyLinkMove(links, 'a', 0)).toBeNull(); // 已在首位
    expect(applyLinkMove(links, 'a', 2)!.sortOrder).toBe(400);
    expect(applyLinkMove(links, 'c', 0)!.sortOrder).toBe(50);
  });
});

describe('kindIcon', () => {
  it('三类图标', () => {
    expect(kindIcon('url')).toBe('🌐');
    expect(kindIcon('path')).toBe('📁');
    expect(kindIcon('command')).toBe('⚡');
  });
});

describe('normalizeTarget', () => {
  it('url 无协议头补 https://，其余 trim', () => {
    expect(normalizeTarget('url', 'gmail.com')).toBe('https://gmail.com');
    expect(normalizeTarget('url', 'https://a.com')).toBe('https://a.com');
    expect(normalizeTarget('path', ' D:\\dir ')).toBe('D:\\dir');
    expect(normalizeTarget('command', ' npm run build ')).toBe('npm run build');
  });
});

describe('validateTarget', () => {
  it('空目标报错', () => {
    expect(validateTarget('url', '   ')).toContain('不能为空');
  });

  it('url 校验协议头', () => {
    expect(validateTarget('url', 'https://a.com')).toBeNull();
    expect(validateTarget('url', 'ftp://a.com')).toContain('http');
  });

  it('path/command 非空即可', () => {
    expect(validateTarget('path', 'D:\\x')).toBeNull();
    expect(validateTarget('command', 'npm run build')).toBeNull();
  });
});
