import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Zeitvertreib Wiki',
  favicon: 'favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  url: 'https://docs.zeitvertreib.vip',
  baseUrl: '/',

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'de',
    locales: ['de'],
  },

  staticDirectories: ['static', '../frontend/public/assets'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/alexinabox/zeitvertreib-website/tree/dev/documentation/',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'logos/logo_full_color_16to9.png',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Zeitvertreib Wiki',
      logo: {
        src: 'logos/logo_full_1to1.svg',
        srcDark: 'logos/inverted/logo_full_1to1.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'basicSidebar',
          position: 'left',
          label: 'SCP: SL?',
        },
        {
          type: 'docSidebar',
          sidebarId: 'basicSidebar',
          position: 'left',
          label: 'Website?',
        },
        {
          href: 'https://github.com/alexinabox/zeitvertreib-website',
          label: 'GitHub',
          position: 'left',
        },
        {
          href: 'https://dsc.gg/zeit',
          label: 'Discord',
          position: 'right',
        },
        {
          href: 'https://ko-fi.com/zeitvertreib',
          label: 'Ko-fi',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Community',
          items: [
            {
              label: 'Discord',
              href: 'https://dsc.gg/zeit',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/alexinabox/zeitvertreib-website',
            },
            {
              label: 'Ko-fi',
              href: 'https://ko-fi.com/zeitvertreib',
            },
          ],
        },
        {
          title: 'Legal',
          items: [
            {
              label: 'Impressum',
              href: 'https://zeitvertreib.vip/imprint.txt',
            },
            {
              label: 'Datenschutzerklärung',
              href: 'https://zeitvertreib.vip/privacy-policy.txt',
            },
          ],
        },
      ],
      //copyright: `Copyright © ${new Date().getFullYear()} Zeitvertreib`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
