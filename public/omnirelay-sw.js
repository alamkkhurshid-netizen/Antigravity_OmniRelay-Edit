/*
 * OmniRelay PWA shell. No patient or workspace response is cached here.
 * A later consented Web Push delivery slice may post the same privacy-safe
 * serious-action payload that the signed-in dashboard already displays.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === "string" ? payload.title : "OmniRelay action required";
  const body = typeof payload.body === "string" ? payload.body : "Review the clinic action in OmniRelay.";
  const href = typeof payload.href === "string" && payload.href.startsWith("/") ? payload.href : "/app/action-centre";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/omnirelay-app-icon.png",
    badge: "/omnirelay-app-icon.png",
    tag: typeof payload.tag === "string" ? payload.tag : "omnirelay-serious-action",
    renotify: true,
    data: { href },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/app/action-centre";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const matching = clients.find((client) => "focus" in client);
    if (matching) return matching.focus().then(() => matching.navigate(href));
    return self.clients.openWindow(href);
  }));
});
