import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Notification = mongoose.model('Notification', notificationSchema);
