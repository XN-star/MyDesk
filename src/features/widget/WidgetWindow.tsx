import { useEffect } from 'react';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api } from '../../lib/api';
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
 */
export default function WidgetWindow() {
  useEffect(() => {
    let alive = true;

    async function refresh() {
      try {
        const data = await api.widgetData();
        if (!alive) return;
        render(data);
      } catch {
        // 后端不可达时保持原内容
      }
    }

    function render(data: WidgetData) {
      const root = document.getElementById('root');
      if (!root) return;
      root.innerHTML = '';
      const el = document.createElement('div');
      el.className = 'widget';

      const head = document.createElement('div');
      head.className = 'widget-head';
      head.textContent = 'MyDesk';
      el.appendChild(head);

      const section = (title: string) => {
        const s = document.createElement('div');
        s.className = 'widget-section';
        const t = document.createElement('div');
        t.className = 'widget-section-title';
        t.textContent = title;
        s.appendChild(t);
        return s;
      };

      const tasks = section('今日任务');
      if (data.todayTasks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'widget-empty';
        empty.textContent = '没有待办';
        tasks.appendChild(empty);
      }
      for (const t of data.todayTasks) {
        const row = document.createElement('button');
        row.className = 'widget-row';
        row.textContent = t.title;
        row.title = '打开任务';
        row.onclick = () => void openMain('task', t.id);
        tasks.appendChild(row);
      }
      el.appendChild(tasks);

      if (data.nextReminder) {
        const r = section('下一次提醒');
        const row = document.createElement('button');
        row.className = 'widget-row';
        row.textContent = `${data.nextReminder.title} · ${dueLabel(data.nextReminder.dueAt!, new Date())}`;
        row.onclick = () => void openMain('task', data.nextReminder!.id);
        r.appendChild(row);
        el.appendChild(r);
      }

      const notes = section('最近笔记');
      if (data.recentNotes.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'widget-empty';
        empty.textContent = '还没有笔记';
        notes.appendChild(empty);
      }
      for (const n of data.recentNotes) {
        const row = document.createElement('button');
        row.className = 'widget-row';
        row.textContent = n.title || '无标题';
        row.onclick = () => void openMain('note', n.id);
        notes.appendChild(row);
      }
      el.appendChild(notes);

      root.appendChild(el);
    }

    async function openMain(type: 'task' | 'note', id: string) {
      const w = getCurrentWindow();
      await emit('quick://open', { type, id });
      await w.hide();
    }

    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return null;
}
