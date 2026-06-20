import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
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
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

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
        {to: '/changelog', label: 'Changelog', position: 'left'},
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
            {label: 'Introduction', to: '/docs/intro'},
            {label: 'Installation', to: '/docs/getting-started/installation'},
            {label: 'Quick start', to: '/docs/getting-started/quick-start'},
          ],
        },
        {
          title: 'Packages',
          items: [
            {label: 'expo-ai-core', to: '/docs/packages/core'},
            {label: 'Apple Foundation Models', to: '/docs/packages/apple-foundation-models'},
            {label: 'Android AICore', to: '/docs/packages/android-aicore'},
            {label: 'Cloud fallback', to: '/docs/packages/cloud'},
          ],
        },
        {
          title: 'More',
          items: [
            {label: 'Changelog', to: '/changelog'},
            {label: 'GitHub', href: GITHUB_REPO},
            {label: 'npm', href: 'https://www.npmjs.com/package/@stewmore/expo-ai-core'},
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
  } satisfies Preset.ThemeConfig,
};

export default config;
