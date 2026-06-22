import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const GITHUB_REPO = 'https://github.com/stewmore/expo-ai-runtime';
const EDIT_BASE = `${GITHUB_REPO}/tree/main/website/`;

const config: Config = {
  title: 'Expo AI Runtime',
  tagline: 'On-device-first AI for Expo & React Native.',
  favicon: 'img/favicon.svg',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Production url and base path (GitHub Pages project site).
  url: 'https://stewmore.github.io',
  baseUrl: '/expo-ai-runtime/',
  trailingSlash: false,

  // GitHub pages deployment config.
  organizationName: 'stewmore',
  projectName: 'expo-ai-runtime',

  onBrokenLinks: 'throw',

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  themes: [
    // Render ```mermaid code blocks as diagrams, themed to the navy identity
    // below (themeConfig.mermaid).
    '@docusaurus/theme-mermaid',
    // Offline, build-time search index — no Algolia/DocSearch server. Serves
    // the Algolia-style search UI entirely from the static bundle.
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      /** @type {import('@easyops-cn/docusaurus-search-local').PluginOptions} */
      {
        hashed: true,
        indexDocs: true,
        indexBlog: true,
        // The "blog" plugin is repurposed as the Changelog (see presets below):
        // point the indexer at both its source dir and its URL route.
        blogDir: ['changelog'],
        blogRouteBasePath: '/changelog',
        docsRouteBasePath: '/docs',
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
        searchResultLimits: 8,
      },
    ],
  ],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: EDIT_BASE,
        },
        blog: {
          // Repurpose the blog plugin as a Changelog / Releases feed.
          path: 'changelog',
          routeBasePath: 'changelog',
          blogTitle: 'Changelog',
          blogDescription: 'Releases and notable changes to the Expo AI Runtime.',
          blogSidebarTitle: 'Releases',
          showReadingTime: false,
          editUrl: EDIT_BASE,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'ignore',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/expo-ai-runtime-social-card.svg',
    // Dark-only: the runtime's identity is dark navy. Hide the toggle.
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Expo AI Runtime',
      logo: {
        alt: 'Expo AI Runtime',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        { to: '/changelog', label: 'Changelog', position: 'left' },
        {
          href: GITHUB_REPO,
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Introduction', to: '/docs/intro' },
            { label: 'Installation', to: '/docs/getting-started/installation' },
            { label: 'Quick start', to: '/docs/getting-started/quick-start' },
          ],
        },
        {
          title: 'Packages',
          items: [
            { label: 'expo-ai-core', to: '/docs/packages/core' },
            { label: 'Apple Foundation Models', to: '/docs/packages/apple-foundation-models' },
            { label: 'Android AICore', to: '/docs/packages/android-aicore' },
            { label: 'Cloud fallback', to: '/docs/packages/cloud' },
          ],
        },
        {
          title: 'More',
          items: [
            { label: 'Changelog', to: '/changelog' },
            { label: 'GitHub', href: GITHUB_REPO },
            { label: 'npm', href: 'https://www.npmjs.com/package/@stewmore/expo-ai-core' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Stewart Moreland. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.oceanicNext,
      darkTheme: prismThemes.oceanicNext,
      additionalLanguages: ['swift', 'kotlin', 'bash', 'json'],
    },
    // Mermaid diagrams inherit the runtime's dark-navy identity: nodes read as
    // the app's status cards (--eai-card on --eai-border), edges in a calm
    // steel-blue derived from the accent. Dark-only, so light === dark.
    mermaid: {
      theme: { light: 'base', dark: 'base' },
      options: {
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        themeVariables: {
          darkMode: true,
          background: '#0b1020',
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          fontSize: '15px',

          // Nodes = status cards.
          mainBkg: '#151b2e',
          primaryColor: '#151b2e',
          primaryTextColor: '#eef2ff',
          primaryBorderColor: '#26304b',
          nodeBorder: '#26304b',
          nodeTextColor: '#eef2ff',

          // Secondary / tertiary fills (subgraph + alt shapes).
          secondaryColor: '#1d2540',
          secondaryTextColor: '#eef2ff',
          secondaryBorderColor: '#26304b',
          tertiaryColor: '#11182b',
          tertiaryTextColor: '#9aa6c4',
          tertiaryBorderColor: '#26304b',

          // Edges: steel-blue from the accent, labels on the page bg.
          lineColor: '#5a76b8',
          textColor: '#eef2ff',
          edgeLabelBackground: '#0b1020',

          // Subgraph clusters.
          clusterBkg: '#11182b',
          clusterBorder: '#26304b',
          titleColor: '#eef2ff',

          // Notes (if used).
          noteBkgColor: '#1d2540',
          noteTextColor: '#eef2ff',
          noteBorderColor: '#26304b',
        },
        flowchart: {
          curve: 'basis',
          padding: 18,
          nodeSpacing: 44,
          rankSpacing: 56,
          useMaxWidth: true,
        },
      },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
