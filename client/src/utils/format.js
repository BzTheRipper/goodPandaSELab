export const money = (n) => `৳${Number(n || 0).toFixed(2)}`;
export const dateTime = (d) => (d ? new Date(d).toLocaleString() : '');
export const shortId = (id) => `#${String(id).slice(-6).toUpperCase()}`;
export const coords = (p) => (p ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : '—');

/** Compact time for timelines and chat bubbles, e.g. "10:42 AM". */
export const timeShort = (d) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');

/** "Today", "Yesterday" or a short date — used for chat day separators. */
export const dayLabel = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function timeAgo(d) {
  if (!d) return '';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(d).toLocaleDateString();
}
