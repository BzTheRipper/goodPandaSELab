import fs from 'node:fs/promises';
import path from 'node:path';

const IMGBB_API_KEY = 'b5945e4e7735bf42c4c313bfdf25ea5b';
const IMGBB_ENDPOINT = 'https://api.imgbb.com/1/upload';

// Food-related images from reliable sources
// picsum.photos with food-related keywords; placehold.co for logos
const IMAGES = [
  { name: 'biryani-cover', url: 'https://picsum.photos/1200/600?random=biryani-cover' },
  { name: 'greenleaf-cover', url: 'https://picsum.photos/1200/600?random=salad-cover' },
  { name: 'biryani-logo', url: 'https://placehold.co/400x400/e74c3c/ffffff?text=Biryani' },
  { name: 'greenleaf-logo', url: 'https://placehold.co/400x400/2ecc71/ffffff?text=Leaf' },
  { name: 'kacchi-biryani', url: 'https://picsum.photos/800/800?random=kacchi-biryani' },
  { name: 'chicken-tehari', url: 'https://picsum.photos/800/800?random=chicken-tehari' },
  { name: 'beef-bhuna', url: 'https://picsum.photos/800/800?random=beef-bhuna' },
  { name: 'borhani', url: 'https://picsum.photos/800/800?random=borhani' },
  { name: 'firni', url: 'https://picsum.photos/800/800?random=firni' },
  { name: 'caesar-salad', url: 'https://picsum.photos/800/800?random=caesar-salad' },
  { name: 'chicken-wrap', url: 'https://picsum.photos/800/800?random=chicken-wrap' },
  { name: 'quinoa-bowl', url: 'https://picsum.photos/800/800?random=quinoa-bowl' },
  { name: 'iced-lemon-tea', url: 'https://picsum.photos/800/800?random=iced-tea' },
  { name: 'orange-juice', url: 'https://picsum.photos/800/800?random=orange-juice' },
];

async function uploadToImgbb(buffer, filename, mimeType) {
  const form = new FormData();
  form.append('key', IMGBB_API_KEY);
  form.append('image', new Blob([buffer], { type: mimeType }), filename);
  form.append('name', filename);

  const res = await fetch(`${IMGBB_ENDPOINT}?key=${encodeURIComponent(IMGBB_API_KEY)}`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!json.success) throw new Error(`ImgBB error: ${json.error?.message}`);
  return json.data.display_url;
}

async function main() {
  const results = {};
  for (const img of IMAGES) {
    try {
      const res = await fetch(img.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const mimeType = res.headers.get('content-type') || 'image/jpeg';
      const ext = mimeType.includes('png') ? '.png' : mimeType.includes('webp') ? '.webp' : '.jpg';
      const buffer = Buffer.from(await res.arrayBuffer());
      const url = await uploadToImgbb(buffer, `${img.name}${ext}`, mimeType);
      results[img.name] = url;
      console.log(`✓ ${img.name}: ${url}`);
    } catch (err) {
      console.error(`✗ ${img.name}: ${err.message}`);
    }
  }

  await fs.writeFile(path.resolve('image-urls.json'), JSON.stringify(results, null, 2));
  console.log('\nSaved image URLs to image-urls.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
