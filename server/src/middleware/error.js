import mongoose from 'mongoose';
import multer from 'multer';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { message: `Route ${req.method} ${req.originalUrl} not found`, code: 'NOT_FOUND', requestId: req.id },
  });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let body = { message: 'Internal server error', code: 'INTERNAL' };

  if (err instanceof AppError) {
    status = err.status;
    body = { message: err.message, code: err.code, ...(err.details && { details: err.details }) };
  } else if (err instanceof mongoose.Error.VersionError) {
    status = 409;
    body = { message: 'The order was changed by someone else. Refresh and try again.', code: 'CONCURRENT_UPDATE' };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    body = { message: `Invalid ${err.path}`, code: 'BAD_REQUEST' };
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    body = {
      message: 'Validation failed',
      code: 'BAD_REQUEST',
      details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    };
  } else if (err?.code === 11000) {
    status = 409;
    body = { message: `Duplicate value for ${Object.keys(err.keyValue || {}).join(', ')}`, code: 'DUPLICATE' };
  } else if (err instanceof multer.MulterError) {
    status = 400;
    body = { message: err.message, code: 'UPLOAD_ERROR' };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    body = { message: 'Malformed JSON body', code: 'BAD_REQUEST' };
  }

  if (status === 500) console.error(JSON.stringify({ level: 'error', msg: 'unhandled', id: req.id, error: err.message, stack: err.stack }));

  const withId = { ...body, requestId: req.id };
  res.status(status).json({ error: withId });
}
