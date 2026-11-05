/* Plan B: no web push. Service worker is a no-op cache skip. */
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
