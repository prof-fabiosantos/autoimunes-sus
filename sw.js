// Service worker: deixa o app funcionando sem internet.
// Os pesos dos modelos LFM ficam no cache "transformers-cache", gerenciado pelo Transformers.js.
const VERSAO = "app-v0.1.1";
const RUNTIME = "app-runtime";
const CASCA = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/config.js", "js/triagem.js", "js/cartilha.js", "js/busca.js", "js/llm-worker.js",
  "data/regras-les.json", "data/cartilha-les.md", "data/casos-simulados.json",
  "vendor/transformers/transformers.min.js",
  "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("app-v") && k !== VERSAO) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // modelos remotos: Transformers.js cuida

  // Runtime do ONNX (dezenas de MB): baixa só quando usado e guarda.
  if (url.pathname.includes("/vendor/ort/")) {
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }

  // Casca do app: cache primeiro, atualiza em segundo plano.
  e.respondWith(caches.open(VERSAO).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const rede = fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || rede;
  }));
});
