// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";

// The marketing site + docs. i18n locales are FROZEN here (the contract every later
// unit builds against). en is the default and lives at `/`; the others at `/{lang}/`.
// The custom landing is a file route (src/pages); Starlight owns the docs under /docs/.
export default defineConfig({
  site: "https://agentandon.com",
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "Agent Andon",
      // Cloudflare Web Analytics on the docs pages — the same beacon as the landing + blog
      // (src/components/Analytics.astro); keep the token in sync. Marketing pages only, never
      // the board: Starlight injects this into every docs <head>, and the board isn't a docs page.
      head: [
        {
          tag: "script",
          attrs: {
            defer: true,
            src: "https://static.cloudflareinsights.com/beacon.min.js",
            "data-cf-beacon": '{"token": "face8bfb7b284ce2acd8fec0bb9c206b"}',
          },
        },
      ],
      disable404Route: true,
      pagination: false,
      customCss: ["./src/styles/docs.css"],
      // One dark code-block theme (no light variant) so code stays dark for every visitor,
      // matching the dark-only landing — ExpressiveCode's light variant is keyed to the OS
      // theme and the --sl-color overrides don't reach it.
      expressiveCode: { themes: ["github-dark"] },
      // Docs i18n: `root` = English at /docs/ (no prefix); the six translations at /{locale}/docs/.
      // Untranslated pages fall back to English (Starlight's built-in fallback). Mirrors the
      // top-level Astro i18n locales above; makes the sidebar + in-page links locale-aware.
      defaultLocale: "root",
      locales: {
        root: { label: "English", lang: "en" },
        "zh-cn": { label: "简体中文", lang: "zh-CN" },
        ja: { label: "日本語", lang: "ja" },
        ko: { label: "한국어", lang: "ko" },
        es: { label: "Español", lang: "es" },
        de: { label: "Deutsch", lang: "de" },
        fr: { label: "Français", lang: "fr" },
      },
      sidebar: [
        {
          label: "Guide",
          items: [
            { label: "Running Andon", link: "/docs/running/" },
            { label: "Commands & events", link: "/docs/commands/" },
            { label: "Configuration & security", link: "/docs/configuration/" },
            { label: "Notifications", link: "/docs/notifications/" },
          ],
        },
        {
          label: "The board from anywhere",
          items: [
            { label: "Hosted Andon", link: "/docs/hosted/" },
            { label: "Deploying a relay", link: "/docs/deploy-relay/" },
          ],
        },
        {
          label: "More",
          items: [
            { label: "Troubleshooting & FAQ", link: "/docs/troubleshooting/" },
            { label: "Developing Andon", link: "/docs/develop/" },
          ],
        },
      ],
    }),
    sitemap(),
  ],
});
