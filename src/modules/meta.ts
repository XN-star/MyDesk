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
    name: '今日速览',
    icon: '◈',
    description: '今日一眼看清',
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
    id: 'focus',
    name: '心流专注',
    icon: '⏱',
    description: '番茄钟与心流计时',
    defaultEnabled: true,
  },
  {
    id: 'calendar',
    name: '时光月历',
    icon: '▤',
    description: '月历与当日日程',
    defaultEnabled: true,
  },
  {
    id: 'habits',
    name: '习惯打卡',
    icon: '◉',
    description: '每日打卡与热力图',
    defaultEnabled: true,
  },
  {
    id: 'notes',
    name: '灵感速记',
    icon: '✎',
    description: '随手记灵感与想法',
    defaultEnabled: true,
  },
  {
    id: 'ledger',
    name: '随手记账',
    icon: '¥',
    description: '收支预算一目了然',
    defaultEnabled: true,
  },
  {
    id: 'fitness',
    name: '轻盈计划',
    icon: '⚖',
    description: '体重趋势与锻炼打卡',
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
