const version = "makan-shell-v13";

const generic = "/s/0000000";
const genericBoard = `${generic}/board`;

const shell = [
  "/",
  "/new",
  generic,
  genericBoard,
  "/fonts/chivo.woff2",
  "/fonts/jetbrains-mono.woff2",
];

const fallbackFor = (pathname) =>
  pathname.endsWith("/board") ? genericBoard : generic;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(version)
      .then((cache) => cache.addAll(shell))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== version)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const serve = async (request) => {
  const cache = await caches.open(version);
  const hit = await cache.match(request);
  if (hit) return hit;

  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (unreachable) {
    const fallback =
      request.mode === "navigate"
        ? await cache.match(fallbackFor(new URL(request.url).pathname))
        : undefined;
    if (fallback) return fallback;
    throw unreachable;
  }
};

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(serve(event.request));
});
