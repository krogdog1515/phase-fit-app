/**
 * Phase Fit service worker — installability + future push notifications.
 * Pass-through fetch only (no caching) to avoid interfering with auth/API.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

// Future push notifications:
// self.addEventListener("push", (event) => { ... });
// self.addEventListener("notificationclick", (event) => { ... });
