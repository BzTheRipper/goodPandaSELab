import crypto from 'node:crypto';

const SILENT = process.env.NODE_ENV === 'test' || process.env.LOG_REQUESTS === 'false';

/**
 * Dependency-free structured request log: one JSON line per request with a correlation id.
 * The same id is returned in the `X-Request-Id` header and in error payloads, so a user report
 * can be traced back to the exact request.
 */
export function requestLogger(req, res, next) {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  if (SILENT) return next();

  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const line = {
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      msg: 'request',
      id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(ms * 10) / 10,
      ...(req.user && { userId: String(req.user._id), role: req.user.role }),
    };
    console.log(JSON.stringify(line));
  });
  next();
}
