import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const reviewSchema = new mongoose.Schema(
  {
    order: { type: ObjectId, ref: 'Order', required: true, unique: true },
    restaurant: { type: ObjectId, ref: 'Restaurant', required: true, index: true },
    customer: { type: ObjectId, ref: 'User', required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', maxlength: 1000 },
    reply: {
      text: { type: String, maxlength: 1000 },
      at: Date,
    },
  },
  { timestamps: true }
);

export const Review = mongoose.model('Review', reviewSchema);
