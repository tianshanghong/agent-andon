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

/**
 * The service worker for Web Push. Self-contained, served at the root scope so it
 * controls "/". The push service delivers the payload already decrypted (the
 * browser handles RFC 8291), so this just shows it. It ALWAYS shows a
 * notification — iOS silently revokes the push subscription if a push event
 * displays nothing — falling back to a generic banner if the payload is missing.
 */
export const SERVICE_WORKER = `// Agent Andon — Web Push service worker
self.addEventListener("install", function(){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function(event){
  event.waitUntil((async function(){
    var d = { title: "Agent Andon", body: "an agent needs you", url: "/" };
    try { if (event.data) d = event.data.json(); } catch (e) {}
    await self.registration.showNotification(d.title || "Agent Andon", {
      body: d.body || "",
      tag: "andon",
      renotify: true,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: { url: d.url || "/" }
    });
  })());
});
self.addEventListener("notificationclick", function(event){
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/";
  try { if (url !== "/" && new URL(url, self.location.origin).origin !== self.location.origin) url = "/"; } catch (e) { url = "/"; }
  event.waitUntil((async function(){
    var wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (var i = 0; i < wins.length; i++) { try { return wins[i].focus(); } catch (e) {} }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
`;

/** A tiny self-contained "andon lamp" SVG icon — three stacked signal dots. */
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#0c0d10"/>
  <rect x="25" y="11" width="14" height="14" rx="2" fill="#d8453d"/>
  <rect x="25" y="25" width="14" height="14" rx="2" fill="#e0a032"/>
  <rect x="25" y="39" width="14" height="14" rx="2" fill="#3aa86b"/>
</svg>`;
