import { toDateStr } from '../lib/format';
import { summarize } from '../lib/summary';
import { useEventStore } from '../stores/events';
import { useTaskStore } from '../stores/tasks';

export default function TodayBar() {
  const tasks = useTaskStore((s) => s.tasks);
  const events = useEventStore((s) => s.events);
  const today = toDateStr(new Date());
  const s = summarize(tasks, events, today);

  return (
    <div className="today-bar">
      <span>今日：{s.todoCount} 个未完成任务</span>
      <span>{s.eventCount} 个日程</span>
      <span>下个截止：{s.nextLabel}</span>
    </div>
  );
}
