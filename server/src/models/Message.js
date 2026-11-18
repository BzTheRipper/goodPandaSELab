import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: String,
    text: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Message = mongoose.model('Message', messageSchema);
