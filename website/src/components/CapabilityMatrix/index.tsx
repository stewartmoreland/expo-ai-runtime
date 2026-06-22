import type { ReactNode } from 'react';
import Badge from '@site/src/components/Badge';
import styles from './styles.module.css';

// What works on which engine. Encodes the capability profiles the adapters
// report (expo-ai-core capability registry); on-device engines gate features at
// runtime, so a device may still report a subset of these.
type Capability = {
  key: string;
  label: string;
};

type ProviderColumn = {
  provider: string;
  label: string;
  meta: string;
  onDevice: boolean;
  supports: Record<string, boolean>;
};

const CAPABILITIES: Capability[] = [
  { key: 'text', label: 'Text generation' },
  { key: 'streaming', label: 'Streaming' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'structured', label: 'Structured output' },
  { key: 'streamObject', label: 'streamObject' },
  { key: 'tasks', label: 'Summarize / rewrite / proofread' },
];

const PROVIDERS: ProviderColumn[] = [
  {
    provider: 'apple-foundation-models',
    label: 'Apple Foundation Models',
    meta: 'iOS 26+',
    onDevice: true,
    supports: {
      text: true,
      streaming: true,
      sessions: true,
      structured: true,
      streamObject: true,
      tasks: true,
    },
  },
  {
    provider: 'android-aicore-gemini-nano',
    label: 'Gemini Nano',
    meta: 'Android · AICore',
    onDevice: true,
    supports: {
      text: true,
      streaming: true,
      sessions: true,
      structured: true,
      streamObject: true,
      tasks: true,
    },
  },
  {
    provider: 'cloud',
    label: 'Cloud fallback',
    meta: 'Your backend · opt-in',
    onDevice: false,
    supports: {
      text: true,
      streaming: true,
      sessions: true,
      structured: true,
      streamObject: true,
      tasks: true,
    },
  },
];

function Cell({ on }: { on: boolean }): ReactNode {
  return on ? (
    <span className={styles.yes} aria-label="supported">
      ✓
    </span>
  ) : (
    <span className={styles.no} aria-label="not supported">
      —
    </span>
  );
}

/**
 * The "what works where" matrix. Structured output and streamObject are
 * implemented in the core, so they work on every provider that can generate
 * text — the table makes that portability explicit.
 */
export default function CapabilityMatrix(): ReactNode {
  return (
    <figure className={styles.wrap} aria-label="Capability support by provider">
      <table className={styles.matrix}>
        <thead>
          <tr>
            <th className={styles.capHead}>Capability</th>
            {PROVIDERS.map((p) => (
              <th key={p.provider} className={styles.provHead}>
                <span className={styles.provLabel}>{p.label}</span>
                <span className={styles.provMeta}>{p.meta}</span>
                <Badge tone={p.onDevice ? 'ok' : 'warn'}>
                  {p.onDevice ? 'on-device' : 'off-device'}
                </Badge>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CAPABILITIES.map((cap) => (
            <tr key={cap.key}>
              <th scope="row" className={styles.capCell}>
                {cap.label}
              </th>
              {PROVIDERS.map((p) => (
                <td key={p.provider} className={styles.cell}>
                  <Cell on={p.supports[cap.key] ?? false} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className={styles.caption}>
        Core features (structured output, <code>streamObject</code>, task helpers) are
        provider-agnostic — they work wherever text generation does. On-device engines still gate at
        runtime; always check <code>getCapabilities()</code>.
      </figcaption>
    </figure>
  );
}
