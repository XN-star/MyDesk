export type ThemeMode = 'system' | 'light' | 'dark';

export function resolveDark(mode: ThemeMode, systemDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && systemDark);
}

export function applyTheme(mode: ThemeMode): boolean {
  const dark = resolveDark(mode, window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  return dark;
}
