import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'gp_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const http = axios.create({ baseURL: `${API_URL}/api` });

http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Hosted images (ImgBB) are absolute; legacy local uploads are paths on the API origin.
export const assetUrl = (path) => {
  if (!path) return '';
  return /^https?:\/\//i.test(path) ? path : `${API_URL}${path}`;
};

// Server field paths (e.g. "items.0.note") → words a customer would use.
const FIELD_NAMES = {
  hubId: 'pickup hub',
  restaurantId: 'restaurant',
  items: 'cart items',
  quantity: 'item quantity',
  note: 'item note',
  customerNote: 'order note',
  name: 'name',
  email: 'email',
  password: 'password',
  phone: 'phone number',
  address: 'address',
  price: 'price',
};

const BY_CODE = {
  RESTAURANT_CLOSED: 'This restaurant has just closed, so it can’t take orders right now.',
  CONCURRENT_UPDATE: 'Someone else updated this order a moment ago. Refresh and try again.',
  INTERNAL: 'Something went wrong on our side. Please try again in a moment.',
};

const fieldName = (path = '') => {
  const parts = String(path).split('.').filter((p) => !/^\d+$/.test(p));
  return FIELD_NAMES[parts.at(-1)] || FIELD_NAMES[parts[0]] || parts.at(-1) || 'form';
};

export const errorCode = (err) => err?.response?.data?.error?.code;

/** Maps the server's `{ error: { message, code, details } }` (or a network failure) to a friendly sentence. */
export function errorMessage(err) {
  if (err?.response === undefined && err?.isAxiosError) return 'Can’t reach GoodPanda. Check your connection and try again.';
  const e = err?.response?.data?.error;
  if (!e) return err?.response?.status >= 500 ? BY_CODE.INTERNAL : err?.message || 'Something went wrong';
  if (BY_CODE[e.code]) return BY_CODE[e.code];
  if (e.details?.length) {
    const fields = [...new Set(e.details.map((d) => fieldName(d.path)))];
    return `Please check the ${fields.join(', ')} and try again.`;
  }
  if (e.code === 'DUPLICATE') return 'That is already in use. Try a different value.';
  if (e.code === 'NOT_FOUND' && e.message.startsWith('Route ')) return 'That isn’t available any more.';
  if (e.code === 'BAD_REQUEST' && /^Invalid \w+$/.test(e.message)) return 'That link looks broken. Go back and try again.';
  return e.message;
}

const data = (p) => p.then((r) => r.data);

// Builds multipart bodies for endpoints that accept images; skips empty values.
export function toFormData(fields) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    fd.append(k, Array.isArray(v) ? v.join(',') : v);
  });
  return fd;
}

export const get = (url, params) => data(http.get(url, { params }));
export const post = (url, body) => data(http.post(url, body));
export const patch = (url, body) => data(http.patch(url, body));
export const put = (url, body) => data(http.put(url, body));
export const del = (url, config) => data(http.delete(url, config));
