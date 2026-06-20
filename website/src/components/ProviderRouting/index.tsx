import type {ReactNode} from 'react';
import Badge, {type BadgeTone} from '@site/src/components/Badge';
import styles from './styles.module.css';

type Rung = {
  provider: string;
  label: string;
  meta: string;
  privacy: string;
  tone: BadgeTone;
};

// The real default candidate order (PRD §5), grouped by the privacy boundary:
// the router tries on-device providers first, then falls back off-device.
const ON_DEVICE: Rung[] = [
  {
    provider: 'apple-foundation-models',
    label: 'Apple Foundation Models',
    meta: 'iOS 26+ · Apple Intelligence',
    privacy: 'on-device',
    tone: 'ok',
  },
  {
    provider: 'android-aicore-gemini-nano',
    label: 'Gemini Nano',
    meta: 'Android · ML Kit GenAI / AICore',
    privacy: 'on-device',
    tone: 'ok',
  },
];

const OFF_DEVICE: Rung[] = [
  {
    provider: 'apple-private-cloud-compute',
    label: 'Private Cloud Compute',
    meta: 'Apple-operated, stateless',
    privacy: 'private cloud',
    tone: 'info',
  },
  {
    provider: 'cloud',
    label: 'Cloud fallback',
    meta: 'Your backend · opt-in',
    privacy: 'third-party cloud',
    tone: 'warn',
  },
  {
    provider: 'none',
    label: 'Unavailable',
    meta: 'No eligible provider',
    privacy: 'n/a',
    tone: 'neutral',
  },
];

function RungRow({rung}: {rung: Rung}): ReactNode {
  return (
    <li className={styles.rung}>
      <div className={styles.rungMain}>
        <code className={styles.provider}>{rung.provider}</code>
        <span className={styles.label}>{rung.label}</span>
        <span className={styles.meta}>{rung.meta}</span>
      </div>
      <Badge tone={rung.tone}>{rung.privacy}</Badge>
    </li>
  );
}

/**
 * The page signature: the provider router's default fallback chain, split by
 * the on-device / off-device privacy boundary. Encodes a true product fact —
 * routing always prefers on-device, and every hop declares its privacy mode.
 */
export default function ProviderRouting(): ReactNode {
  return (
    <figure className={styles.ladder} aria-label="Default provider routing order">
      <figcaption className={styles.caption}>Default routing order</figcaption>
      <ol className={styles.group}>
        {ON_DEVICE.map((r) => (
          <RungRow key={r.provider} rung={r} />
        ))}
      </ol>
      <div className={styles.boundary}>
        <span>device boundary</span>
      </div>
      <ol className={styles.group}>
        {OFF_DEVICE.map((r) => (
          <RungRow key={r.provider} rung={r} />
        ))}
      </ol>
    </figure>
  );
}
