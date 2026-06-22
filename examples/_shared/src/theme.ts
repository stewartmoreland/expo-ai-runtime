export const theme = {
  color: {
    bg: '#0b1020',
    card: '#151b2e',
    cardBorder: '#26304b',
    text: '#eef2ff',
    subtle: '#9aa6c4',
    accent: '#6ea8fe',
    ok: '#34d399',
    warn: '#fbbf24',
    danger: '#f87171',
    info: '#a78bfa',
    inputBg: '#1d2540',
  },
  space: (n: number) => n * 8,
  radius: 12,
} as const;

export type BadgeTone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

export const toneColor: Record<BadgeTone, string> = {
  ok: theme.color.ok,
  warn: theme.color.warn,
  danger: theme.color.danger,
  info: theme.color.info,
  neutral: theme.color.subtle,
};
