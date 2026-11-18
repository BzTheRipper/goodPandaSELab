import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

const localStorage = {
  async save(file) {
    const dir = path.resolve(env.uploadDir);
    await fs.mkdir(dir, { recursive: true });
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${EXT[file.mimetype] || ''}`;
    await fs.writeFile(path.join(dir, filename), file.buffer);
    return `/uploads/${filename}`;
  },
  async remove(url) {
    if (!url?.startsWith('/uploads/')) return;
    await fs.unlink(path.resolve(env.uploadDir, path.basename(url))).catch(() => {});
  },
};

const IMGBB_ENDPOINT = 'https://api.imgbb.com/1/upload';

const imgbbStorage = {
  async save(file) {
    const name = `goodpanda-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const body = new FormData();
    body.append('image', new Blob([file.buffer], { type: file.mimetype }), `${name}${EXT[file.mimetype] || ''}`);
    body.append('name', name);
    let json;
    try {
      const res = await fetch(`${IMGBB_ENDPOINT}?key=${encodeURIComponent(env.imgbbApiKey)}`, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(30_000),
      });
      json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message || `ImgBB responded ${res.status}`);
    } catch (err) {
      console.error('Image upload to ImgBB failed:', err.message);
      throw new AppError(502, 'We could not upload the image right now. Please try again.', 'UPLOAD_FAILED');
    }
    return json.data.display_url || json.data.url;
  },
  // The ImgBB API has no delete endpoint; replaced images simply stop being referenced.
  async remove(url) {
    return localStorage.remove(url);
  },
};

export const storage = env.imgbbApiKey ? imgbbStorage : localStorage;
