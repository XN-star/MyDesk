import { useEffect, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api } from '../../lib/api';
import { useThemeSync } from '../../lib/theme';
import type { Note, Task } from '../../types';
import { dueLabel } from '../../lib/format';

export interface WidgetData {
  todayTasks: Task[];
  nextReminder: Task | null;
  recentNotes: Note[];
}

/**
 * 桌面常驻小组件：今日任务 / 下一次提醒 / 最近笔记。
 * 30s 轮询刷新；点击条目唤起主窗并跳转。
 * 纯 React 声明式渲染——React 管理的 root 里不能手动 append DOM（会被清空导致白板）。
 */
export default function WidgetWindow() {
  useThemeSync();
  const [data, setData] = useState<WidgetData | null>(null);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const d = await api.widgetData();
        if (alive) setData(d);
      } catch {
        // 后端不可达时保留上次数据
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  async function openMain(type: 'task' | 'note', id: string) {
    const w = getCurrentWindow();
    await emit('quick://open', { type, id });
    await w.hide();
  }

  return (
    <div className="widget">
      <div className="widget-head">MyDesk</div>

      <div className="widget-section">
        <div className="widget-section-title">今日任务</div>
        {(data?.todayTasks.length ?? 0) === 0 && <div className="widget-empty">没有待办</div>}
        {data?.todayTasks.map((t) => (
          <button key={t.id} className="widget-row" title="打开任务" onClick={() => void openMain('task', t.id)}>
            {t.title}
          </button>
        ))}
      </div>

      {data?.nextReminder && (
        <div className="widget-section">
          <div className="widget-section-title">下一次提醒</div>
          <button
            className="widget-row"
            onClick={() => void openMain('task', data.nextReminder!.id)}
          >
            {data.nextReminder.title} · {dueLabel(data.nextReminder.dueAt!, new Date())}
          </button>
        </div>
      )}

      <div className="widget-section">
        <div className="widget-section-title">最近速记</div>
        {(data?.recentNotes.length ?? 0) === 0 && <div className="widget-empty">还没有速记</div>}
        {data?.recentNotes.map((n) => (
          <button key={n.id} className="widget-row" onClick={() => void openMain('note', n.id)}>
            {n.title || '无标题'}
          </button>
        ))}
      </div>
    </div>
  );
}
