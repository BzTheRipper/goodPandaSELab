export class AppError extends Error {
  constructor(status, message, code = 'ERROR', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'You do not have permission to do this') => new AppError(403, msg, 'FORBIDDEN');
export const notFound = (what = 'Resource') => new AppError(404, `${what} not found`, 'NOT_FOUND');
export const conflict = (msg, code = 'CONFLICT') => new AppError(409, msg, code);
