import { useEffect, useMemo, useRef, useState } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { Note } from '../../types';
import { timeShort } from '../../lib/format';
import { noteExcerpt, searchNotes, splitPinned } from './notes';
import { useNotesStore } from '../../stores/notes';

export default function NotesPage() {
  const notes = useNotesStore((s) => s.notes);
  const selectedId = useNotesStore((s) => s.selectedId);
  const saving = useNotesStore((s) => s.saving);
  const load = useNotesStore((s) => s.load);
  const select = useNotesStore((s) => s.select);
  const create = useNotesStore((s) => s.create);
  const edit = useNotesStore((s) => s.edit);
  const togglePin = useNotesStore((s) => s.togglePin);
  const remove = useNotesStore((s) => s.remove);

  const [keyword, setKeyword] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const current = notes.find((n) => n.id === selectedId) ?? null;

  useEffect(() => {
    void load();
  }, [load]);

  // 卸载前把未保存的编辑落库（页面切换时 App 直接卸载本组件）。
  useEffect(() => {
    return () => void useNotesStore.getState().flush();
  }, []);

  const visible = useMemo(() => searchNotes(notes, keyword), [notes, keyword]);
  const [pinned, rest] = useMemo(() => splitPinned(visible), [visible]);

  async function handleCreate() {
    await create();
    titleRef.current?.focus();
  }

  async function handleDelete() {
    if (!current) return;
    const ok = await confirm('删除这篇笔记？', { title: '删除笔记' });
    if (!ok) return;
    await remove(current.id);
  }

  return (
    <div className="notes-layout">
      <aside className="panel notes-list">
        <div className="notes-list-tools">
          <input
            className="input"
            placeholder="搜索笔记…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <button className="btn primary" style={{ flex: 'none' }} onClick={() => void handleCreate()}>
            ＋
          </button>
        </div>
        <div className="notes-items">
          {pinned.length > 0 && <div className="notes-group-label">置顶</div>}
          {pinned.map((n) => (
            <NoteRow key={n.id} note={n} active={n.id === selectedId} onSelect={() => void select(n.id)} />
          ))}
          {rest.length > 0 && pinned.length > 0 && <div className="notes-group-label">全部</div>}
          {rest.map((n) => (
            <NoteRow key={n.id} note={n} active={n.id === selectedId} onSelect={() => void select(n.id)} />
          ))}
          {visible.length === 0 && (
            <div className="day-empty">{keyword ? '没有匹配的笔记' : '还没有笔记'}</div>
          )}
        </div>
      </aside>
      <section className="panel notes-editor">
        {current ? (
          <>
            <div className="notes-editor-head">
              <input
                ref={titleRef}
                className="notes-title-input"
                placeholder="无标题"
                value={current.title}
                onChange={(e) => edit(current.id, { title: e.target.value })}
              />
              <button
                className="btn"
                title={current.pinned ? '取消置顶' : '置顶'}
                onClick={() => void togglePin(current.id)}
              >
                {current.pinned ? '已置顶' : '置顶'}
              </button>
              <button className="btn danger" onClick={() => void handleDelete()}>
                删除
              </button>
            </div>
            <textarea
              className="notes-content"
              placeholder="写点什么…"
              value={current.content}
              onChange={(e) => edit(current.id, { content: e.target.value })}
            />
            <div className="notes-status">{saving === 'idle' ? '已保存' : '保存中…'}</div>
          </>
        ) : (
          <div className="notes-empty">
            <div>
              <p>{notes.length === 0 ? '还没有笔记，随手记点东西吧' : '选择左侧笔记，或新建一篇'}</p>
              <button className="btn primary" onClick={() => void handleCreate()}>
                新建第一篇笔记
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function NoteRow({ note, active, onSelect }: { note: Note; active: boolean; onSelect: () => void }) {
  return (
    <button className={`note-item${active ? ' active' : ''}`} onClick={onSelect}>
      <span className={`note-item-title${note.title ? '' : ' blank'}`}>
        {note.pinned && <span className="pin">📌 </span>}
        {note.title || '无标题'}
      </span>
      <span className="note-item-meta">
        <span>{noteExcerpt(note.content) || '（空）'}</span>
        <span>{timeShort(note.updatedAt)}</span>
      </span>
    </button>
  );
}
