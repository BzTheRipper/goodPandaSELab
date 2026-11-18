import multer from 'multer';
import { badRequest } from '../utils/errors.js';

// Files are kept in memory and handed to the storage service, so the backend (disk/S3/Cloudinary) is swappable.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(badRequest('Only PNG, JPG, WEBP or GIF images are allowed'));
  },
});
