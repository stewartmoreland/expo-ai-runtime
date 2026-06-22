import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting started',
      collapsed: false,
      items: ['getting-started/installation', 'getting-started/quick-start'],
    },
    {
      type: 'category',
      label: 'Concepts',
      items: [
        'concepts/architecture',
        'concepts/providers',
        'concepts/capabilities',
        'concepts/sessions',
        'concepts/structured-output',
        'concepts/privacy',
        'concepts/errors',
      ],
    },
    {
      type: 'category',
      label: 'Packages',
      items: [
        'packages/core',
        'packages/react',
        'packages/apple-foundation-models',
        'packages/android-aicore',
        'packages/cloud',
        'packages/evals',
      ],
    },
    {
      type: 'category',
      label: 'Recipes',
      items: [
        'recipes/streaming-chat',
        'recipes/structured-streaming',
        'recipes/capability-gated-ui',
        'recipes/cloud-fallback',
      ],
    },
    {
      type: 'category',
      label: 'Examples',
      items: ['examples/overview', 'examples/reference-server'],
    },
    {
      type: 'category',
      label: 'Reference',
      items: ['reference/roadmap'],
    },
  ],
};

export default sidebars;
