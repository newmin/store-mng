// Online-only data: never cache API responses, authentication, or customer data.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>말랑콩떡 · 연결 확인</title><body style="font-family:system-ui;padding:48px;background:#faf5e9;color:#895f36"><h1>인터넷 연결을 확인해 주세요</h1><p>주문과 재고를 안전하게 공유하려면 연결이 필요합니다.</p><button onclick="location.reload()">다시 연결</button></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}})));});
