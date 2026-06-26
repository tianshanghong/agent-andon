// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// The marketing site + docs. i18n locales are FROZEN here (the contract every later
// unit builds against). en is the default and lives at `/`; the others at `/{lang}/`.
// Starlight (docs) is added in its own PR and mirrors this locale list.
export default defineConfig({
  site: "https://agentandon.com",
  trailingSlash: "always",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "zh-CN", "ja", "ko", "es", "de", "fr"],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [sitemap()],
});
