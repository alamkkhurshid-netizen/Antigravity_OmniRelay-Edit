/*
 * OmniRelay PWA service worker.
 * - Handles Web Push notifications.
 * - No patient or workspace response is cached here.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === "string" ? payload.title : "OmniRelay action required";
  const body = typeof payload.body === "string" ? payload.body : "Review the action in OmniRelay.";
  const href = typeof payload.href === "string" && payload.href.startsWith("/") ? payload.href : "/app";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/omnirelay-app-icon.png",
    badge: "/omnirelay-app-icon.png",
    tag: typeof payload.tag === "string" ? payload.tag : "omnirelay-action",
    renotify: true,
    data: { href },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/app";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const matching = clients.find((client) => "focus" in client);
    if (matching) return matching.focus().then(() => matching.navigate(href));
    return self.clients.openWindow(href);
  }));
});
