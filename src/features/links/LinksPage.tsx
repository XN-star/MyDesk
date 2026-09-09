import { useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { Link, LinkKind } from '../../types';
import { kindIcon, normalizeTarget, searchLinks, validateTarget } from './links';
import { useLinksStore } from '../../stores/links';

const KIND_OPTIONS: Array<{ value: LinkKind; label: string }> = [
  { value: 'url', label: '网址' },
  { value: 'path', label: '文件或文件夹' },
  { value: 'command', label: '命令' },
];

const KIND_NAMES: Record<LinkKind, string> = { url: '网址', path: '文件', command: '命令' };

export default function LinksPage() {
  const links = useLinksStore((s) => s.links);
  const load = useLinksStore((s) => s.load);
  const move = useLinksStore((s) => s.move);
  const open = useLinksStore((s) => s.open);
  const remove = useLinksStore((s) => s.remove);

  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<{ mode: 'create' } | { mode: 'edit'; link: Link } | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => searchLinks(links, keyword), [links, keyword]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const targetIndex = visible.findIndex((l) => l.id === over.id);
    if (targetIndex >= 0) void move(active.id as string, targetIndex);
  }

  async function handleDelete(link: Link) {
    const ok = await confirm(`删除「${link.title || link.target}」？`, { title: '删除快捷入口' });
    if (ok) await remove(link.id);
  }

  return (
    <div className="links-page">
      <div className="links-toolbar">
        <input
          className="input"
          placeholder="搜索快捷入口…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button className="btn primary" style={{ flex: 'none' }} onClick={() => setEditing({ mode: 'create' })}>
          ＋新建
        </button>
      </div>
      {visible.length === 0 ? (
        <div className="empty">
          <div>
            <p>{keyword ? '没有匹配的快捷入口' : '还没有快捷入口'}</p>
            <button className="btn primary" onClick={() => setEditing({ mode: 'create' })}>
              添加第一个快捷入口
            </button>
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visible.map((l) => l.id)} strategy={rectSortingStrategy}>
            <div className="links-grid">
              {visible.map((l) => (
                <LinkCard
                  key={l.id}
                  link={l}
                  onOpen={() => void open(l)}
                  onEdit={() => setEditing({ mode: 'edit', link: l })}
                  onDelete={() => void handleDelete(l)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {editing && (
        <LinkDialog initial={editing.mode === 'edit' ? editing.link : null} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function LinkCard({
  link,
  onOpen,
  onEdit,
  onDelete,
}: {
  link: Link;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="link-card"
      title={`${link.target}\n（拖住图标排序，双击或点按钮打开）`}
      onDoubleClick={onOpen}
    >
      <button className="link-open" title="打开" onClick={onOpen}>
        <span className="link-icon" {...attributes} {...listeners} style={{ cursor: 'grab', touchAction: 'none' }}>
          {kindIcon(link.kind)}
        </span>
        <span className="link-title">{link.title || link.target}</span>
      </button>
      <span className="link-kind">{KIND_NAMES[link.kind]}</span>
      <button
        className="link-act"
        title="编辑"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        ✎
      </button>
      <button
        className="link-act"
        title="删除"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        🗑
      </button>
    </div>
  );
}

function LinkDialog({ initial, onClose }: { initial: Link | null; onClose: () => void }) {
  const create = useLinksStore((s) => s.create);
  const update = useLinksStore((s) => s.update);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [kind, setKind] = useState<LinkKind>(initial?.kind ?? 'url');
  const [target, setTarget] = useState(initial?.target ?? '');
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const t = normalizeTarget(kind, target);
    const err = validateTarget(kind, t);
    if (err) {
      setError(err);
      return;
    }
    try {
      if (initial) {
        await update({ ...initial, title: title.trim(), kind, target: t });
      } else {
        await create({ title: title.trim() || t, kind, target: t });
      }
      onClose();
    } catch {
      // 保存失败：store 已 toast，弹窗保留供修改重试
    }
  }

  return (
    <div className="overlay center" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{initial ? '编辑快捷入口' : '新建快捷入口'}</h3>
        <div className="field">
          <label>标题（留空则用目标）</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：Gmail" />
        </div>
        <div className="field">
          <label>类型</label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as LinkKind)}>
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{kind === 'url' ? '网址' : kind === 'path' ? '文件或文件夹路径' : '命令'}</label>
          <input
            className="input"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={kind === 'url' ? 'mail.google.com' : kind === 'path' ? 'D:\\资料\\报告.docx' : 'npm run build'}
          />
          {kind === 'command' && <small className="day-hint">⚠ 将在本机执行此命令，请确认来源可信</small>}
          {error && <small style={{ color: 'var(--danger)' }}>{error}</small>}
        </div>
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={() => void handleSave()}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
