/* Dev-friendly placeholder: some browsers retry /sw.js if an old registration
 * used this URL on localhost. A valid script avoids noisy 404/update loops. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", () => {
  /* passthrough — no caching */
});
