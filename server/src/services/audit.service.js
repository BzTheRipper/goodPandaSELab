import { AuditLog } from '../models/index.js';

/**
 * Records a privileged action. Never throws: auditing must not break the operation it describes.
 * `metadata` should hold ids and before/after values worth reviewing, never secrets.
 */
export async function audit({ actor, action, targetType, target, summary = '', metadata, ip }) {
  try {
    await AuditLog.create({
      actor: actor?._id ?? actor ?? null,
      actorRole: actor?.role,
      action,
      targetType,
      target: target ?? null,
      summary,
      metadata,
      ip,
    });
  } catch (err) {
    console.error('[audit] failed to record', action, err.message);
  }
}

/** Newest-first log, optionally filtered by action or target type. */
export function listAuditLogs({ action, targetType, limit = 100 } = {}) {
  const filter = {};
  if (action) filter.action = action;
  if (targetType) filter.targetType = targetType;
  return AuditLog.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 100, 500)).populate('actor', 'name email role');
}
