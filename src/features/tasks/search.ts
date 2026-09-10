import type { Task } from '../../types';

/** 看板页任务搜索：标题+描述不区分大小写包含匹配；关键字为空白时返回全部。 */
export function searchTasks(tasks: Task[], keyword: string): Task[] {
  const k = keyword.trim().toLowerCase();
  if (!k) return tasks;
  return tasks.filter(
    (t) => t.title.toLowerCase().includes(k) || t.description.toLowerCase().includes(k),
  );
}

/** 字数统计：去除所有空白字符后的字符数。 */
export function countChars(text: string): number {
  return text.replace(/\s/g, '').length;
}
