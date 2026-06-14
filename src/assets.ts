/** Static, dependency-free assets served by the board (PWA polish). */

/** Web app manifest so "Add to Home Screen" gives a real app icon + name. */
export const MANIFEST = {
  name: "Agent Andon",
  short_name: "Andon",
  description: "Traffic-light status board for your AI coding agents",
  start_url: "/",
  display: "fullscreen",
  orientation: "any",
  background_color: "#0c0d10",
  theme_color: "#0c0d10",
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
  <rect width="64" height="64" rx="12" fill="#0c0d10"/>
  <rect x="25" y="11" width="14" height="14" rx="2" fill="#d8453d"/>
  <rect x="25" y="25" width="14" height="14" rx="2" fill="#e0a032"/>
  <rect x="25" y="39" width="14" height="14" rx="2" fill="#3aa86b"/>
</svg>`;
