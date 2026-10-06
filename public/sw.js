// nook Service Worker — Web Push 알림 전용 (오프라인 캐싱은 안 함).
// PWA 설치(또는 등록만) 후 푸시를 받아 OS 알림 센터에 띄우고, 사용자가 알림을
// 누르면 이미 떠있는 클라이언트로 포커스 전환 + 메시지 전달, 없으면 새 창 오픈.

self.addEventListener('install', (e) => {
  // 즉시 활성화 — 새 SW 가 배포되면 지체 없이 푸시를 받도록.
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: 'nook', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'nook'
  const opts = {
    body:  data.body || '',
    icon:  data.icon || '/icon.png',
    badge: data.badge || '/icon.png',
    tag:   data.tag,        // 같은 tag 면 시스템이 알림을 교체 (덮어쓰기)
    data:  { url: data.url || '/' },
    requireInteraction: false,
  }
  event.waitUntil(self.registration.showNotification(title, opts))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // 이미 떠있는 클라이언트가 있으면 포커스 + navigate 메시지 전송.
    for (const c of all) {
      if ('focus' in c) {
        try { await c.focus() } catch {}
        c.postMessage({ type: 'nook:navigate', url: target })
        return
      }
    }
    // 떠있는 게 없으면 새 창. 쿼리스트링은 main.jsx 가 부팅 시 읽음.
    if (self.clients.openWindow) await self.clients.openWindow(target)
  })())
})
