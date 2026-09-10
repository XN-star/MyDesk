/** 模块静态元数据（不含组件引用），供设置存储等非 UI 层使用，避免与 registry 的循环依赖。 */
export interface ModuleMeta {
  id: string;
  name: string;
  icon: string;
  description: string;
  defaultEnabled: boolean;
}

export const MODULE_META: ModuleMeta[] = [
  {
    id: 'overview',
    name: '概览',
    icon: '◈',
    description: '今日信息一览',
    defaultEnabled: true,
  },
  {
    id: 'tasks',
    name: '任务看板',
    icon: '▦',
    description: '三列拖拽任务管理',
    defaultEnabled: true,
  },
  {
    id: 'calendar',
    name: '日历',
    icon: '▤',
    description: '月历与当日日程',
    defaultEnabled: true,
  },
  {
    id: 'notes',
    name: '笔记',
    icon: '✎',
    description: '纯文本快速记录',
    defaultEnabled: true,
  },
  {
    id: 'links',
    name: '快捷入口',
    icon: '⚡',
    description: '网址/文件/命令快速启动',
    defaultEnabled: true,
  },
];
