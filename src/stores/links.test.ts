import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  linkList: vi.fn(async () => []),
  linkCreate: vi.fn(),
  linkUpdate: vi.fn(async (l: Record<string, unknown>) => l),
  linkDelete: vi.fn(async () => {}),
  linkMove: vi.fn(async () => {}),
  linkOpen: vi.fn(async () => {}),
  linkRun: vi.fn(async () => {}),
}));

vi.mock('../lib/api', () => ({ api }));

import { useLinksStore } from './links';
import type { Link } from '../types';

const L = (p: Partial<Link>) => ({
  id: 'x',
  title: '',
  kind: 'url' as const,
  target: '',
  sortOrder: 100,
  createdAt: '2026-09-08T10:00:00',
  updatedAt: '2026-09-08T10:00:00',
  ...p,
});

describe('links store', () => {
  beforeEach(() => {
    useLinksStore.setState({ links: [] });
    vi.clearAllMocks();
  });

  it('move 乐观更新并落库', async () => {
    useLinksStore.setState({ links: [L({ id: 'a', sortOrder: 100 }), L({ id: 'b', sortOrder: 200 })] });
    await useLinksStore.getState().move('b', 0);
    expect(api.linkMove).toHaveBeenCalledWith('b', 50);
    expect(useLinksStore.getState().links.map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('move 落库失败回滚', async () => {
    api.linkMove.mockRejectedValueOnce(new Error('x'));
    useLinksStore.setState({ links: [L({ id: 'a', sortOrder: 100 }), L({ id: 'b', sortOrder: 200 })] });
    await useLinksStore.getState().move('b', 0);
    expect(useLinksStore.getState().links.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('open 按 kind 分发', async () => {
    await useLinksStore.getState().open(L({ id: 'u', kind: 'url', target: 'https://a.com' }));
    await useLinksStore.getState().open(L({ id: 'p', kind: 'path', target: 'D:\\' }));
    await useLinksStore.getState().open(L({ id: 'c', kind: 'command', target: 'npm -v' }));
    expect(api.linkOpen).toHaveBeenCalledWith('url', 'https://a.com');
    expect(api.linkOpen).toHaveBeenCalledWith('path', 'D:\\');
    expect(api.linkRun).toHaveBeenCalledWith('c');
  });
});
