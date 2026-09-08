import { toDateStr } from '../lib/format';
import { summarize } from '../lib/summary';
import { useTaskStore } from '../stores/tasks';

export default function TodayBar() {
  const tasks = useTaskStore((s) => s.tasks);
  const today = toDateStr(new Date());
  const s = summarize(tasks, today);

  return (
    <div className="today-bar">
      <span>今日：{s.todoCount} 个未完成任务</span>
      <span>今日 {s.todayCount} 项</span>
      <span>下个截止：{s.nextLabel}</span>
    </div>
  );
}
