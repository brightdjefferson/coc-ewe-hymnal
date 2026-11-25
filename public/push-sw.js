// Added to the app's service worker: shows the daily Hymn of the Day
// notification and opens the hymn when it is tapped.
self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch {
    d = {}
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'Hymn of the Day', {
      body: d.body || 'Open the hymnal for today’s hymn.',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: 'hymn-of-the-day',
      data: { url: d.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        if (new URL(w.url).origin !== self.location.origin) continue
        try {
          await w.focus()
          await w.navigate(url)
          return
        } catch {
          // fall through and open a new window
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
