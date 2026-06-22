import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import Badge, { type BadgeTone } from '@site/src/components/Badge';
import styles from './styles.module.css';

type Pkg = {
  name: string;
  npm: string;
  description: string;
  platform: string;
  tone: BadgeTone;
  to: string;
};

const PACKAGES: Pkg[] = [
  {
    name: 'expo-ai-core',
    npm: '@stewmore/expo-ai-core',
    description:
      'The pure-TS heart: the ExpoAI API, adapter contract, provider router, capability registry, sessions, structured output, privacy and normalized errors.',
    platform: 'TypeScript',
    tone: 'info',
    to: '/docs/packages/core',
  },
  {
    name: 'apple-foundation-models',
    npm: '@stewmore/expo-ai-apple-foundation-models',
    description:
      'iOS adapter wrapping Apple’s on-device FoundationModels framework. Requires iOS 26+ with Apple Intelligence.',
    platform: 'iOS',
    tone: 'ok',
    to: '/docs/packages/apple-foundation-models',
  },
  {
    name: 'android-aicore',
    npm: '@stewmore/expo-ai-android-aicore',
    description:
      'Android adapter for Gemini Nano via ML Kit GenAI / AICore, including on-device model download.',
    platform: 'Android',
    tone: 'ok',
    to: '/docs/packages/android-aicore',
  },
  {
    name: 'cloud',
    npm: '@stewmore/expo-ai-cloud',
    description:
      'Opt-in cloud fallback client adapter. POSTs to a configurable backend with streaming, for prompts that aren’t marked sensitive.',
    platform: 'TypeScript',
    tone: 'warn',
    to: '/docs/packages/cloud',
  },
  {
    name: 'evals',
    npm: '@stewmore/expo-ai-evals',
    description:
      'Node-first eval harness: provider comparison, schema validity, latency, fallback frequency and privacy-boundary checks.',
    platform: 'Node',
    tone: 'neutral',
    to: '/docs/packages/evals',
  },
];

export default function Packages(): ReactNode {
  return (
    <div className={styles.grid}>
      {PACKAGES.map((pkg) => (
        <Link key={pkg.name} to={pkg.to} className={styles.card}>
          <div className={styles.cardHead}>
            <h3 className={styles.name}>{pkg.name}</h3>
            <Badge tone={pkg.tone}>{pkg.platform}</Badge>
          </div>
          <code className={styles.npm}>{pkg.npm}</code>
          <p className={styles.description}>{pkg.description}</p>
        </Link>
      ))}
    </div>
  );
}
