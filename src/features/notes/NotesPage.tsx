import { useEffect, useMemo, useRef, useState } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { Note } from '../../types';
import { timeShort } from '../../lib/format';
import { api } from '../../lib/api';
import { noteExcerpt, parseLinks, searchNotes, splitPinned } from './notes';
import { countChars } from '../tasks/search';
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
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const current = notes.find((n) => n.id === selectedId) ?? null;

  // [[ 自动补全候选：光标前最近 [[ 未闭合时弹出
  const [candidates, setCandidates] = useState<Note[] | null>(null);
  const [candIndex, setCandIndex] = useState(0);
  // 反链：引用了当前笔记的其他笔记
  const [backlinks, setBacklinks] = useState<Note[]>([]);

  useEffect(() => {
    void load();
  }, [load]);

  // 卸载前把未保存的编辑落库（页面切换时 App 直接卸载本组件）。
  useEffect(() => {
    return () => void useNotesStore.getState().flush();
  }, []);

  // 选中笔记变化：拉取反链
  useEffect(() => {
    setCandidates(null);
    if (!current) {
      setBacklinks([]);
      return;
    }
    api
      .relatedNotes(current.id)
      .then(setBacklinks)
      .catch(() => setBacklinks([]));
  }, [current?.id]);

  const visible = useMemo(() => searchNotes(notes, keyword), [notes, keyword]);
  const [pinned, rest] = useMemo(() => splitPinned(visible), [visible]);

  // 当前笔记引用的标题 → 笔记映射（链接区块）
  const outgoingLinks = useMemo(() => {
    if (!current) return [];
    return parseLinks(current.content)
      .map((title) => {
        const target = notes.find((n) => n.title === title && n.id !== current.id);
        return { title, note: target ?? null };
      })
      .slice(0, 10);
  }, [current, notes]);

  function refreshCandidates(el: HTMLTextAreaElement) {
    const pos = el.selectionStart;
    const before = el.value.slice(0, pos);
    const open = before.lastIndexOf('[[');
    if (open === -1 || before.indexOf(']]', open) !== -1) {
      setCandidates(null);
      return;
    }
    const typed = before.slice(open + 2).toLowerCase();
    const list = notes
      .filter((n) => n.id !== selectedId && n.title.toLowerCase().includes(typed) && n.title)
      .slice(0, 6);
    setCandidates(list.length > 0 ? list : null);
    setCandIndex(0);
  }

  function insertCandidate(note: Note) {
    const el = contentRef.current;
    if (!el || !current) return;
    const pos = el.selectionStart;
    const value = el.value;
    const open = value.lastIndexOf('[[', pos);
    if (open === -1) return;
    const next = value.slice(0, open + 2) + note.title + ']]' + value.slice(pos);
    edit(current.id, { content: next });
    setCandidates(null);
    // 焦点回到插入点之后
    requestAnimationFrame(() => {
      el.focus();
      const caret = open + 2 + note.title.length + 2;
      el.setSelectionRange(caret, caret);
    });
  }

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
            <div className="notes-content-wrap">
              <textarea
                ref={contentRef}
                className="notes-content"
                placeholder="写点什么…（输入 [[ 可链接其他笔记）"
                value={current.content}
                onChange={(e) => {
                  edit(current.id, { content: e.target.value });
                  refreshCandidates(e.target);
                }}
                onClick={() => setCandidates(null)}
                onBlur={() => setTimeout(() => setCandidates(null), 150)}
                onKeyDown={(e) => {
                  if (candidates) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setCandIndex((i) => Math.min(i + 1, candidates.length - 1));
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setCandIndex((i) => Math.max(i - 1, 0));
                      return;
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void insertCandidate(candidates[candIndex]);
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setCandidates(null);
                      return;
                    }
                  }
                }}
              />
              {candidates && (
                <div className="link-candidates">
                  {candidates.map((n, i) => (
                    <button
                      key={n.id}
                      className={`link-candidate${i === candIndex ? ' active' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        void insertCandidate(n);
                      }}
                    >
                      {n.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="notes-links">
              {outgoingLinks.length > 0 && (
                <div className="notes-links-row">
                  <span className="notes-links-label">链接</span>
                  {outgoingLinks.map(({ title, note: target }) => (
                    <button
                      key={title}
                      className={`ov-chip${target ? '' : ' missing'}`}
                      title={target ? `打开「${title}」` : '暂无此笔记，先选中它再点击可创建'}
                      onClick={async () => {
                        if (target) void select(target.id);
                        else {
                          const ok = await confirm(`没有标题为「${title}」的笔记，新建一篇？`, {
                            title: '新建笔记',
                          });
                          if (ok) {
                            await create();
                            edit(useNotesStore.getState().selectedId!, { title });
                          }
                        }
                      }}
                    >
                      [[{title}]]
                    </button>
                  ))}
                </div>
              )}
              {backlinks.length > 0 && (
                <div className="notes-links-row">
                  <span className="notes-links-label">引用了它</span>
                  {backlinks.slice(0, 6).map((n) => (
                    <button key={n.id} className="ov-chip" onClick={() => void select(n.id)}>
                      {n.title || '无标题'} · {timeShort(n.updatedAt)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="notes-status">
              {saving === 'idle' ? '已保存' : '保存中…'}
              <span className="notes-chars">· {countChars(current.content)} 字</span>
            </div>
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
