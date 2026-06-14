/** Static, dependency-free assets served by the board (PWA polish). */

/** Web app manifest so "Add to Home Screen" gives a real app icon + name. */
export const MANIFEST = {
  name: "Agent Andon",
  short_name: "Andon",
  description: "Traffic-light status board for your AI coding agents",
  start_url: "/",
  display: "fullscreen",
  orientation: "any",
  background_color: "#0a0c10",
  theme_color: "#0a0c10",
  icons: [
    {
      src: "/favicon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any maskable",
    },
  ],
};

/** A tiny self-contained "andon lamp" SVG icon — three stacked signal dots. */
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0a0c10"/>
  <circle cx="32" cy="17" r="7" fill="#ff5d5d"/>
  <circle cx="32" cy="32" r="7" fill="#f6a623"/>
  <circle cx="32" cy="47" r="7" fill="#2fd47a"/>
</svg>`;
