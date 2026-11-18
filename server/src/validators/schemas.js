import { z } from 'zod';
import { ORDER_STATUS } from '../constants.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const phone = z.string().trim().regex(/^\+?[\d\s-]{6,20}$/, 'Invalid phone number');
// Multipart forms send everything as strings; accept "true"/"false".
const boolish = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean());
const csvList = z.preprocess(
  (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
  z.array(z.string().trim().min(1).max(40)).max(10)
);
const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(6).max(100),
  phone,
  address: z.string().trim().max(200).optional().default(''),
  role: z.enum(['customer', 'owner']).default('customer'),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    phone,
    address: z.string().trim().max(200),
  })
  .partial();

export const restaurantSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().default(''),
  phone,
  address: z.string().trim().min(3).max(200),
  categories: csvList.optional().default([]),
  lat: lat.optional(),
  lng: lng.optional(),
});
export const restaurantUpdateSchema = restaurantSchema.partial();

export const openStatusSchema = z.object({ isOpen: z.boolean() });

export const menuItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().default(''),
  price: z.coerce.number().min(0).max(100000),
  category: z.string().trim().max(40).optional().default('General'),
  isAvailable: boolish.optional().default(true),
});
export const menuItemUpdateSchema = menuItemSchema.partial();
export const availabilitySchema = z.object({ isAvailable: z.boolean() });

export const restaurantQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  category: z.string().trim().max(40).optional(),
  sort: z.enum(['recommended', 'rating', 'name']).optional().default('recommended'),
  openNow: z.enum(['true', 'false']).optional(),
});

export const createOrderSchema = z.object({
  restaurantId: objectId,
  hubId: objectId,
  customerNote: z.string().trim().max(500).optional().default(''),
  paymentMethod: z.literal('CASH_ON_COLLECTION').optional().default('CASH_ON_COLLECTION'),
  items: z
    .array(
      z.object({
        menuItemId: objectId,
        quantity: z.number().int().min(1).max(50),
        note: z.string().trim().max(200).optional().default(''),
      })
    )
    .min(1, 'Cart is empty')
    .max(50),
});

// Only "simple" transitions go through the generic status endpoint; the rest have dedicated endpoints.
export const statusUpdateSchema = z.object({
  status: z.enum([
    ORDER_STATUS.ACCEPTED,
    ORDER_STATUS.REJECTED,
    ORDER_STATUS.PREPARING,
    ORDER_STATUS.READY_FOR_DRONE,
    ORDER_STATUS.CANCELLED,
  ]),
  reason: z.string().trim().max(300).optional(),
});

export const confirmationRequestSchema = z.object({
  type: z.enum(['ITEM_UNAVAILABLE', 'NOTE_UNMET']),
  message: z.string().trim().min(3).max(500),
  itemIds: z.array(objectId).optional().default([]),
});

export const confirmationResponseSchema = z.object({
  decision: z.enum(['CONTINUE', 'CANCEL']),
});

export const loadDroneSchema = z.object({ droneId: objectId });
export const collectSchema = z.object({ pickupCode: z.string().trim().regex(/^\d{4,6}$/, 'Invalid pickup code') });
export const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export const messageSchema = z.object({ text: z.string().trim().min(1).max(2000) });

export const hubSchema = z.object({
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().min(3).max(200),
  lat,
  lng,
  isActive: z.boolean().optional().default(true),
});
export const hubUpdateSchema = hubSchema.partial();

export const droneSchema = z.object({
  identifier: z.string().trim().min(2).max(40),
  lat: lat.optional(),
  lng: lng.optional(),
  battery: z.number().min(0).max(100).optional(),
});
export const droneUpdateSchema = droneSchema.partial().extend({
  status: z.enum(['IDLE', 'MAINTENANCE']).optional(),
});

export const userActiveSchema = z.object({ isActive: z.boolean() });
export const restaurantStatusSchema = z.object({ status: z.enum(['APPROVED', 'SUSPENDED']) });
export const settingsSchema = z.object({ deliveryFee: z.number().min(0).max(10000) });

export const orderQuerySchema = z.object({
  status: z.enum(Object.values(ORDER_STATUS)).optional(),
  needsIntervention: z.enum(['true', 'false']).optional(),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().default(''),
});
export const reviewReplySchema = z.object({ text: z.string().trim().max(1000) });

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6).max(100),
  })
  .refine((d) => d.currentPassword !== d.newPassword, { path: ['newPassword'], message: 'Choose a different password' });
