/* GoodPanda push service worker: shows notifications from the server even with the tab closed. */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'GoodPanda', body: event.data ? event.data.text() : 'You have a new update.' };
  }
  const title = payload.title || 'GoodPanda';
  const options = {
    body: payload.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: payload.url || '/orders' },
    tag: payload.order ? `order-${payload.order}` : `gp-${Date.now()}`,
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/orders';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) return existing.navigate(url).then(() => existing.focus());
      return self.clients.openWindow(url);
    })
  );
});
