import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Board } from '../types';

const api = vi.hoisted(() => ({
  boardList: vi.fn<() => Promise<unknown[]>>(),
  boardCreate: vi.fn(),
  boardRename: vi.fn(),
  boardDelete: vi.fn(async () => {}),
}));

vi.mock('../lib/api', () => ({ api }));

import { useBoardsStore } from './boards';

const B = (id: string, name: string) => ({ id, name, createdAt: '', updatedAt: '' }) as import('../types').Board;

describe('boards store', () => {
  beforeEach(() => {
    useBoardsStore.setState({ boards: [], activeBoardId: 'default' });
    vi.clearAllMocks();
  });

  it('load 后 activeBoardId 失效时重置为第一个看板', async () => {
    api.boardList.mockResolvedValueOnce([B('default', '默认看板'), B('w', '工作')] as Board[]);
    useBoardsStore.setState({ activeBoardId: 'gone' });
    await useBoardsStore.getState().load();
    expect(useBoardsStore.getState().activeBoardId).toBe('default');
  });

  it('create 新建并切换为当前看板', async () => {
    api.boardCreate.mockResolvedValueOnce(B('w', '工作') as never);
    await useBoardsStore.getState().create('工作');
    expect(api.boardCreate).toHaveBeenCalledWith({ name: '工作' });
    expect(useBoardsStore.getState().activeBoardId).toBe('w');
    expect(useBoardsStore.getState().boards).toHaveLength(1);
  });

  it('删除当前看板后切回 default 并刷新任务', async () => {
    api.boardList.mockResolvedValue([B('default', '默认看板'), B('w', '工作')]);
    await useBoardsStore.getState().load();
    useBoardsStore.setState({ activeBoardId: 'w' });
    await useBoardsStore.getState().remove('w');
    expect(api.boardDelete).toHaveBeenCalledWith('w');
    expect(useBoardsStore.getState().activeBoardId).toBe('default');
    expect(useBoardsStore.getState().boards).toHaveLength(1);
  });
});
