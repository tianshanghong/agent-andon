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
  i18n: {
    defaultLocale: "en",
    locales: ["en", "zh-CN", "ja", "ko", "es", "de", "fr"],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    starlight({
      title: "Agent Andon",
      disable404Route: true,
      pagination: false,
      customCss: ["./src/styles/docs.css"],
      // One dark code-block theme (no light variant) so code stays dark for every visitor,
      // matching the dark-only landing — ExpressiveCode's light variant is keyed to the OS
      // theme and the --sl-color overrides don't reach it.
      expressiveCode: { themes: ["github-dark"] },
      // Docs are English-only for now. Astro's i18n still emits locale-prefixed doc URLs that
      // fall back to this English content; Starlight has no `locales` here yet, so sidebar links
      // are root-relative (/docs/…). PR-4 adds docs i18n + locale-aware nav.
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
