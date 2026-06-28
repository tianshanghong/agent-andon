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
          translations: { "zh-CN": "指南", ja: "ガイド", ko: "가이드", es: "Guía", de: "Anleitung", fr: "Guide" },
          items: [
            {
              label: "Running Andon",
              translations: { "zh-CN": "运行 Andon", ja: "Andon を動かす", ko: "Andon 실행하기", es: "Ejecutar Andon", de: "Andon betreiben", fr: "Exécuter Andon" },
              link: "/docs/running/",
            },
            {
              label: "Commands & events",
              translations: { "zh-CN": "命令与事件", ja: "コマンドとイベント", ko: "명령과 이벤트", es: "Comandos y eventos", de: "Befehle & Events", fr: "Commandes et événements" },
              link: "/docs/commands/",
            },
            {
              label: "Configuration & security",
              translations: { "zh-CN": "配置与安全", ja: "設定とセキュリティ", ko: "설정과 보안", es: "Configuración y seguridad", de: "Konfiguration & Sicherheit", fr: "Configuration et sécurité" },
              link: "/docs/configuration/",
            },
            {
              label: "Notifications",
              translations: { "zh-CN": "通知", ja: "通知", ko: "알림", es: "Notificaciones", de: "Benachrichtigungen", fr: "Notifications" },
              link: "/docs/notifications/",
            },
          ],
        },
        {
          label: "The board from anywhere",
          translations: { "zh-CN": "随处可用的看板", ja: "どこからでもボードを", ko: "어디서나 보는 보드", es: "El tablero desde cualquier lugar", de: "Das Board von überall", fr: "Votre tableau de bord, où que vous soyez" },
          items: [
            {
              label: "Hosted Andon",
              translations: { "zh-CN": "托管 Andon", ja: "ホスト型 Andon", ko: "Hosted Andon", es: "Andon alojado", de: "Hosted Andon", fr: "Andon hébergé" },
              link: "/docs/hosted/",
            },
            {
              label: "Deploying a relay",
              translations: { "zh-CN": "部署中继", ja: "リレーをデプロイする", ko: "릴레이 배포하기", es: "Desplegar un relay", de: "Ein Relay bereitstellen", fr: "Déployer un relais" },
              link: "/docs/deploy-relay/",
            },
          ],
        },
        {
          label: "More",
          translations: { "zh-CN": "更多", ja: "さらに", ko: "더 보기", es: "Más", de: "Mehr", fr: "Plus" },
          items: [
            {
              label: "Troubleshooting & FAQ",
              translations: { "zh-CN": "故障排查与 FAQ", ja: "トラブルシューティングと FAQ", ko: "문제 해결 및 FAQ", es: "Resolución de problemas y preguntas frecuentes", de: "Fehlerbehebung & FAQ", fr: "Dépannage et FAQ" },
              link: "/docs/troubleshooting/",
            },
            {
              label: "Developing Andon",
              translations: { "zh-CN": "开发 Andon", ja: "Andon を開発する", ko: "Andon 개발하기", es: "Desarrollar Andon", de: "Andon weiterentwickeln", fr: "Développer Andon" },
              link: "/docs/develop/",
            },
          ],
        },
      ],
    }),
    sitemap(),
  ],
});
