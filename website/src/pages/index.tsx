import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import CodeBlock from '@theme/CodeBlock';
import ProviderRouting from '@site/src/components/ProviderRouting';
import Packages from '@site/src/components/Packages';

import styles from './index.module.css';

const QUICK_START = `import { ExpoAI } from "@stewmore/expo-ai-core";

const { text, provider, privacy } = await ExpoAI.generate({
  prompt: "Summarize this in one sentence.",
});

// text     -> the model output
// provider -> which engine answered (e.g. "apple-foundation-models")
// privacy  -> { isOnDevice, sendsPromptOffDevice, privacyMode }`;

function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Expo AI Runtime</p>
          <Heading as="h1" className={styles.title}>
            One AI API. On-device first, cloud when it counts.
          </Heading>
          <p className={styles.subtitle}>
            A mobile-native AI runtime for Expo &amp; React Native. It detects
            what each device can run, routes to the best provider, and tells you
            the privacy implications of every response.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryBtn} to="/docs/intro">
              Get started
            </Link>
            <Link
              className={styles.secondaryBtn}
              href="https://github.com/stewmore/expo-ai-runtime">
              GitHub
            </Link>
          </div>
        </div>
        <div className={styles.heroSignature}>
          <ProviderRouting />
        </div>
      </div>
    </header>
  );
}

function QuickStart() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <Heading as="h2" className={styles.sectionTitle}>
          Two lines to your first generation
        </Heading>
        <p className={styles.sectionLede}>
          The same call works across Apple Foundation Models, Android Gemini
          Nano and your cloud backend. Capability detection and fallback are
          handled for you.
        </p>
      </div>
      <div className={styles.codeWrap}>
        <CodeBlock language="ts">{QUICK_START}</CodeBlock>
      </div>
    </section>
  );
}

function PackagesSection() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <Heading as="h2" className={styles.sectionTitle}>
          The packages
        </Heading>
        <p className={styles.sectionLede}>
          A pure-TypeScript core plus thin native adapters. Import only what
          your app needs.
        </p>
      </div>
      <Packages />
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="On-device-first AI for Expo and React Native — unified provider routing, privacy metadata, structured output and cloud fallback.">
      <Hero />
      <main className={styles.main}>
        <QuickStart />
        <PackagesSection />
      </main>
    </Layout>
  );
}
