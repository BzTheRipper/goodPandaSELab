import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/** Append-only record of privileged actions, so admin/hub operations can be reviewed after the fact. */
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: ObjectId, ref: 'User', index: true },
    actorRole: String,
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true, index: true },
    target: { type: ObjectId },
    summary: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
