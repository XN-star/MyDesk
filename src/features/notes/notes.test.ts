import { describe, expect, it } from 'vitest';
import type { Note } from '../../types';
import { noteExcerpt, searchNotes, sortNotes, splitPinned } from './notes';

function note(partial: Partial<Note>): Note {
  return {
    id: 'x',
    title: '',
    content: '',
    pinned: false,
    createdAt: '2026-09-08T10:00:00',
    updatedAt: '2026-09-08T10:00:00',
    ...partial,
  };
}

describe('searchNotes', () => {
  const notes = [
    note({ id: '1', title: '会议记录', content: '讨论了预算' }),
    note({ id: '2', title: '购物清单', content: '牛奶、鸡蛋' }),
  ];

  it('空关键字返回全部', () => {
    expect(searchNotes(notes, '  ')).toHaveLength(2);
  });

  it('匹配标题或内容，不区分大小写', () => {
    expect(searchNotes(notes, '会议').map((n) => n.id)).toEqual(['1']);
    expect(searchNotes(notes, '牛奶').map((n) => n.id)).toEqual(['2']);
    expect(searchNotes(notes, 'TODO')).toHaveLength(0);
  });
});

describe('splitPinned', () => {
  it('拆分为置顶与未置顶两组并保持原顺序', () => {
    const [pinned, rest] = splitPinned([
      note({ id: 'a' }),
      note({ id: 'b', pinned: true }),
      note({ id: 'c' }),
    ]);
    expect(pinned.map((n) => n.id)).toEqual(['b']);
    expect(rest.map((n) => n.id)).toEqual(['a', 'c']);
  });
});

describe('noteExcerpt', () => {
  it('取首个非空行并去掉首尾空白', () => {
    expect(noteExcerpt('\n\n  第二行内容  \n第三行')).toBe('第二行内容');
  });

  it('超过 40 字截断加省略号', () => {
    const long = '一'.repeat(50);
    expect(noteExcerpt(long)).toBe('一'.repeat(40) + '…');
  });

  it('空内容返回空串', () => {
    expect(noteExcerpt('')).toBe('');
  });
});

describe('sortNotes', () => {
  it('置顶在前，同组内按更新时间倒序', () => {
    const sorted = sortNotes([
      note({ id: 'a', updatedAt: '2026-09-08T09:00:00' }),
      note({ id: 'b', updatedAt: '2026-09-08T11:00:00' }),
      note({ id: 'p', pinned: true, updatedAt: '2026-09-08T08:00:00' }),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(['p', 'b', 'a']);
  });
});
