// Relevé photo : réseau d'abord (les mises à jour arrivent toutes seules), copie gardée pour le hors connexion. Version 20261128-1754
const NOM="releve-photo-20261128-1754";
self.addEventListener("install",e=>{e.waitUntil(caches.open(NOM).then(c=>c.addAll(["./","index.html","manifest.webmanifest","icone-192.png","icone-512.png","opencv.js","three.min.js"])).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith("releve-photo")&&x!==NOM).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{if(e.request.method!=="GET"||new URL(e.request.url).origin!==location.origin)return;e.respondWith(fetch(e.request,{cache:"no-cache"}).then(r=>{const c=r.clone();caches.open(NOM).then(k=>k.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match("index.html"))))});
