import type { ReactNode } from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

export type BadgeTone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

/**
 * Pill badge with a tone dot — the same visual language the example apps use
 * (examples/_shared/src/ui.tsx) to surface provider + privacy status.
 */
export default function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span className={clsx(styles.badge, styles[tone])}>
      <span className={styles.dot} />
      {children}
    </span>
  );
}
