const CACHE = 'hi-health-v793';
const STATIC_ASSETS = [
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// 설치: 정적 자산만 캐시 (HTML 제외)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

// 활성화: 이전 캐시 정리 후 즉시 제어권만 가져오기
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 요청 가로채기: HTML은 네트워크 우선, 나머지는 캐시 우선
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isHtmlRequest = e.request.destination === 'document' || url.pathname.endsWith('.html');

  // HTML 파일 / 아바타 이미지: 항상 네트워크에서 최신 버전 가져오기
  if (isHtmlRequest || url.pathname.includes('/images/avatars/')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // 외부 API 데이터는 캐시 우선으로 두면 관리자 변경사항이 늦게 반영될 수 있어 네트워크 우선으로 처리
  if (!isSameOrigin || url.pathname.includes('/rest/v1/') || url.pathname.includes('/functions/v1/')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // 나머지: 캐시 우선, 실패 시 네트워크
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
        return res;
      });
    })
  );
});

function normalizeNotificationPayload(raw = {}) {
  const title = String(raw.title || 'HI Health');
  const body = String(raw.body || '새 알림이 도착했어요.');
  const url = String(raw.url || './index.html?tab=community');
  return {
    title,
    options: {
      body,
      icon: './icons/icon-192.png?v=10',
      badge: './icons/icon-192.png?v=10',
      tag: String(raw.tag || 'hi-health-notice'),
      renotify: Boolean(raw.renotify),
      requireInteraction: Boolean(raw.requireInteraction),
      data: {
        url,
        sentAt: raw.sentAt || new Date().toISOString(),
      },
    },
  };
}

self.addEventListener('message', e => {
  if (e.data?.type !== 'SHOW_LOCAL_NOTIFICATION') return;
  const payload = normalizeNotificationPayload(e.data.payload || {});
  e.waitUntil(self.registration.showNotification(payload.title, payload.options));
});

self.addEventListener('push', e => {
  let raw = {};
  try {
    raw = e.data ? e.data.json() : {};
  } catch (_) {
    raw = { body: e.data ? e.data.text() : '새 알림이 도착했어요.' };
  }
  const payload = normalizeNotificationPayload(raw || {});
  e.waitUntil(self.registration.showNotification(payload.title, payload.options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = new URL(
    e.notification?.data?.url || './index.html',
    self.registration?.scope || self.location.href
  ).href;
  e.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      const sameOrigin = new URL(client.url).origin === self.location.origin;
      if (!sameOrigin) continue;
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(targetUrl);
        return;
      }
    }
    await clients.openWindow(targetUrl);
  })());
});
