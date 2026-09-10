import { describe, expect, it } from 'vitest';
import type { Link } from '../../types';
import { applyLinkMove, kindIcon, normalizeTarget, searchLinks, validateTarget } from './links';
import { entryMode } from './quickEntry';

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

describe('entryMode（快速面板入口模式）', () => {
  const links = [
    link({ id: '1', title: 'Gmail', target: 'https://mail.google.com' }),
    link({ id: '2', title: '素材', kind: 'path', target: 'D:\\assets' }),
    link({ id: '3', title: '构建', kind: 'command', target: 'npm run build' }),
  ];

  it('空格开头进入入口模式，列出前 9 个入口', () => {
    const m = entryMode(links, ' ');
    expect(m).not.toBeNull();
    expect(m!.list.map((l) => l.id)).toEqual(['1', '2', '3']);
    expect(m!.query).toBe('');
  });

  it('空格+序号选中对应入口', () => {
    expect(entryMode(links, ' 2')!.sel).toBe(1);
    expect(entryMode(links, ' 9')!.sel).toBe(0); // 越界回落第一条
  });

  it('/ 开头进入 bang 模式，关键词过滤入口', () => {
    const m = entryMode(links, '/mail');
    expect(m).not.toBeNull();
    expect(m!.list.map((l) => l.id)).toEqual(['1']);
    expect(m!.sel).toBe(0);
  });

  it('/ 无匹配时列表为空', () => {
    expect(entryMode(links, '/zzz')!.list).toHaveLength(0);
  });

  it('其他输入不进入入口模式', () => {
    expect(entryMode(links, '明天 交报告')).toBeNull();
    expect(entryMode(links, '/')).toBeNull(); // 纯斜杠尚未有关键词语义，且无过滤词时不启用
    expect(entryMode(links, '')).toBeNull();
  });
});
