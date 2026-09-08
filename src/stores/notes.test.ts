import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  noteList: vi.fn(async () => []),
  noteCreate: vi.fn(),
  noteUpdate: vi.fn(async (n: Record<string, unknown> & { updatedAt: string }) => ({
    ...n,
    updatedAt: '2026-09-08T12:00:00',
  })),
  noteDelete: vi.fn(async () => {}),
}));

vi.mock('../lib/api', () => ({ api }));

import { useNotesStore } from './notes';

const N1 = {
  id: 'n1',
  title: '旧标题',
  content: '',
  pinned: false,
  createdAt: '2026-09-08T10:00:00',
  updatedAt: '2026-09-08T10:00:00',
};

describe('notes store 自动保存', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNotesStore.setState({ notes: [], selectedId: null, saving: 'idle' });
    api.noteUpdate.mockClear();
  });

  it('编辑进入 pending，停顿 1 秒后自动保存并回到 idle', async () => {
    useNotesStore.setState({ notes: [{ ...N1 }], selectedId: 'n1' });

    useNotesStore.getState().edit('n1', { title: '新标题' });
    expect(useNotesStore.getState().saving).toBe('pending');

    await vi.advanceTimersByTimeAsync(1000);
    expect(api.noteUpdate).toHaveBeenCalledTimes(1);
    expect(api.noteUpdate.mock.calls[0][0].title).toBe('新标题');
    expect(useNotesStore.getState().saving).toBe('idle');
  });

  it('连续编辑只触发最后一次保存；切换选中前先 flush', async () => {
    useNotesStore.setState({
      notes: [{ ...N1 }, { ...N1, id: 'n2', updatedAt: '2026-09-08T11:00:00' }],
      selectedId: 'n1',
    });

    useNotesStore.getState().edit('n1', { title: '第一次' });
    await vi.advanceTimersByTimeAsync(600);
    useNotesStore.getState().edit('n1', { title: '第二次' });
    await useNotesStore.getState().select('n2');

    expect(api.noteUpdate).toHaveBeenCalledTimes(1);
    expect(api.noteUpdate.mock.calls[0][0].title).toBe('第二次');
    expect(useNotesStore.getState().selectedId).toBe('n2');
  });

  it('删除后自动选中列表第一条', async () => {
    useNotesStore.setState({
      notes: [{ ...N1 }, { ...N1, id: 'n2', updatedAt: '2026-09-08T11:00:00' }],
      selectedId: 'n1',
    });

    await useNotesStore.getState().remove('n1');

    expect(api.noteDelete).toHaveBeenCalledWith('n1');
    expect(useNotesStore.getState().selectedId).toBe('n2');
  });
});
