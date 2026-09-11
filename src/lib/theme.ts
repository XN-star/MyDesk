import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { api } from './api';

export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentTheme = 'teal' | 'indigo' | 'coral' | 'slate';

export const ACCENTS: AccentTheme[] = ['teal', 'indigo', 'coral', 'slate'];

/** 主窗口 → quick/widget 窗口的主题广播事件名 */
export const THEME_EVENT = 'theme://changed';

export interface ThemePayload {
  theme: ThemeMode;
  accent: AccentTheme;
}

/** jsdom 无 matchMedia，浏览器环境恒有；单测环境兜底为浅色 */
function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

export function resolveDark(mode: ThemeMode, systemDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && systemDark);
}

/** 非法/缺省 accent 一律回退 teal（老数据无 accent 键） */
export function normalizeAccent(a: unknown): AccentTheme {
  return ACCENTS.includes(a as AccentTheme) ? (a as AccentTheme) : 'teal';
}

/** 维护 html 上的 dark 与 accent-* class；返回是否深色。 */
export function applyTheme(mode: ThemeMode, accent: AccentTheme = 'teal'): boolean {
  const dark = resolveDark(mode, systemPrefersDark());
  const el = document.documentElement;
  el.classList.toggle('dark', dark);
  const acc = normalizeAccent(accent);
  for (const a of ACCENTS) el.classList.toggle(`accent-${a}`, a === acc);
  return dark;
}

/** quick/widget 窗口用：启动读取设置，随后跟随主窗口广播与系统深浅色变化。 */
export function useThemeSync(): void {
  useEffect(() => {
    let mode: ThemeMode = 'system';
    let accent: AccentTheme = 'teal';
    const apply = () => applyTheme(mode, accent);
    api
      .settingsAll()
      .then((all) => {
        mode = (all.theme as ThemeMode) || 'system';
        accent = normalizeAccent(all.accent);
        apply();
      })
      .catch(() => {});
    const un = listen<ThemePayload>(THEME_EVENT, (e) => {
      mode = e.payload.theme;
      accent = normalizeAccent(e.payload.accent);
      apply();
    });
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const fn = () => {
      if (mode === 'system') apply();
    };
    mq?.addEventListener('change', fn);
    return () => {
      un.then((f) => f());
      mq?.removeEventListener('change', fn);
    };
  }, []);
}
