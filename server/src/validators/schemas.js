import { z } from 'zod';
import { CONFIRMATION_TYPES, ORDER_STATUS } from '../constants.js';

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
const page = z.coerce.number().int().min(1).max(10000).optional().default(1);
const pageSize = z.coerce.number().int().min(1).max(100).optional().default(20);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(6).max(100),
  phone,
  address: z.string().trim().max(200).optional().default(''),
  role: z.enum(['customer', 'owner']).default('customer'),
  referralCode: z.string().trim().max(16).optional(),
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

export const documentSchema = z.object({
  type: z.enum(['FOOD_LICENSE', 'TRADE_LICENSE', 'OWNER_ID', 'OTHER']),
  label: z.string().trim().max(80).optional().default(''),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

export const documentVerifySchema = z.object({
  verified: z.boolean(),
  note: z.string().trim().max(300).optional(),
});

export const restaurantQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  category: z.string().trim().max(40).optional(),
  sort: z.enum(['recommended', 'rating', 'name']).optional().default('recommended'),
  openNow: z.enum(['true', 'false']).optional(),
});

export const recommendedQuerySchema = z.object({ limit: pageSize });

export const createOrderSchema = z.object({
  restaurantId: objectId,
  hubId: objectId,
  customerNote: z.string().trim().max(500).optional().default(''),
  paymentMethod: z.enum(['CASH_ON_COLLECTION', 'ONLINE_PAYMENT']).optional().default('CASH_ON_COLLECTION'),
  scheduledFor: z.string().datetime({ offset: true }).optional(),
  couponCode: z.string().trim().max(24).optional(),
  useCredit: z.boolean().optional().default(false),
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
  type: z.enum([CONFIRMATION_TYPES.ITEM_UNAVAILABLE, CONFIRMATION_TYPES.NOTE_UNMET]),
  message: z.string().trim().min(3).max(500),
  itemIds: z.array(objectId).optional().default([]),
});

export const confirmationResponseSchema = z.object({
  decision: z.enum(['CONTINUE', 'CANCEL']),
});

export const cancelRequestSchema = z.object({
  message: z.string().trim().min(3).max(500),
});

export const cancelResponseSchema = z.object({
  decision: z.enum(['CONTINUE', 'CANCEL']),
  reason: z.string().trim().max(300).optional(),
});

export const loadDroneSchema = z.object({ droneId: objectId });
export const modifyOrderSchema = z.object({
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
  customerNote: z.string().trim().max(500).optional(),
});
// Codes are generated with six digits; the QR token is a 32-character hex secret.
export const collectSchema = z.object({
  pickupCode: z.string().trim().regex(/^\d{6}$/, 'Pickup codes are 6 digits').optional(),
  pickupToken: z.string().trim().regex(/^[a-f\d]{32}$/i, 'Invalid QR token').optional(),
}).refine((d) => d.pickupCode || d.pickupToken, { message: 'Provide a pickup code or scan the QR token' });

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});
export const pushUnsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) });

export const hubOperatorSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  phone,
  password: z.string().min(8).max(100),
  hubId: objectId,
});
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
  capacityUnits: z.number().int().min(1).max(200).optional(),
});
export const droneUpdateSchema = droneSchema.partial().extend({
  status: z.enum(['IDLE', 'MAINTENANCE']).optional(),
  // `null` clears a scheduled service; an ISO datetime (with offset) sets one.
  maintenanceDueAt: z.string().datetime({ offset: true }).nullable().optional(),
  maintenanceNote: z.string().trim().max(500).optional(),
  serviceNow: z.boolean().optional(),
});

export const userActiveSchema = z.object({ isActive: z.boolean() });
export const restaurantStatusSchema = z.object({ status: z.enum(['APPROVED', 'SUSPENDED']) });
export const settingsSchema = z.object({
  deliveryFee: z.number().min(0).max(10000).optional(),
  mode: z.enum(['flat', 'distance']).optional(),
  perKm: z.number().min(0).max(1000).optional(),
  max: z.number().min(0).max(10000).optional(),
  maxDeliveryDistanceKm: z.number().min(0).max(1000).optional(),
  platformCommissionPercent: z.number().min(0).max(100).optional(),
  // Platform-wide banner; an empty message clears it.
  announcement: z
    .object({
      message: z.string().trim().max(200),
      tone: z.enum(['info', 'warning', 'danger']).optional(),
      active: z.boolean().optional(),
    })
    .nullable()
    .optional(),
});

// Multi-restaurant checkout: one entry per restaurant, each with its own item list.
export const checkoutGroupSchema = createOrderSchema
  .omit({ restaurantId: true, items: true, couponCode: true, paymentMethod: true })
  .extend({
    paymentMethod: z.enum(['CASH_ON_COLLECTION']).optional().default('CASH_ON_COLLECTION'),
    couponCode: z.string().trim().max(24).optional(),
    groups: z
      .array(
        z.object({
          restaurantId: objectId,
          items: createOrderSchema.shape.items,
        })
      )
      .min(2, 'Choose items from at least two restaurants')
      .max(5),
  });

export const orderQuerySchema = z.object({  status: z.enum(Object.values(ORDER_STATUS)).optional(),
  needsIntervention: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(60).optional(),
  page: page,
  limit: pageSize,
});

export const auditQuerySchema = z.object({
  action: z.string().trim().max(60).optional(),
  targetType: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
});

export const payoutQuerySchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'VOID']).optional(),
  restaurantId: objectId.optional(),
  page,
  limit: pageSize,
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  hubRating: z.number().int().min(1).max(5).optional(),
  droneRating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(1000).optional().default(''),
});
export const reviewReplySchema = z.object({ text: z.string().trim().max(1000) });

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6).max(100),
  })
  .refine((d) => d.currentPassword !== d.newPassword, { path: ['newPassword'], message: 'Choose a different password' });

export const notificationQuerySchema = z.object({
  page,
  limit: pageSize,
});

export const CAMPAIGN_SEGMENTS = ['all_customers', 'active_customers', 'lapsed_30d', 'all_owners', 'all_users'];

export const campaignPreviewSchema = z.object({ segment: z.enum(CAMPAIGN_SEGMENTS) });

export const campaignSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(500),
  segment: z.enum(CAMPAIGN_SEGMENTS),
});

export const couponValidateSchema = z.object({
  code: z.string().trim().min(1).max(24),
  restaurantId: objectId,
  subtotal: z.number().min(0).max(1_000_000),
});

const couponFields = {
  description: z.string().trim().max(120).optional().default(''),
  type: z.enum(['PERCENT', 'FLAT']),
  value: z.number().min(0).max(100_000),
  minSubtotal: z.number().min(0).max(1_000_000).optional().default(0),
  maxDiscount: z.number().min(0).max(1_000_000).nullable().optional(),
  restaurant: objectId.nullable().optional(),
  active: z.boolean().optional().default(true),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).max(100).optional().default(1),
};

export const couponSchema = z
  .object({ code: z.string().trim().min(3).max(24), ...couponFields })
  .refine((d) => d.type !== 'PERCENT' || d.value <= 100, {
    path: ['value'],
    message: 'A percentage coupon cannot exceed 100%',
  })
  .refine((d) => !d.startsAt || !d.endsAt || new Date(d.startsAt) < new Date(d.endsAt), {
    path: ['endsAt'],
    message: 'The end date must be after the start date',
  });

export const couponUpdateSchema = z
  .object({
    description: z.string().trim().max(120).optional(),
    active: z.boolean().optional(),
    value: z.number().min(0).max(100_000).optional(),
    minSubtotal: z.number().min(0).max(1_000_000).optional(),
    maxDiscount: z.number().min(0).max(1_000_000).nullable().optional(),
    startsAt: z.string().datetime({ offset: true }).nullable().optional(),
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
    usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
    perCustomerLimit: z.number().int().min(1).max(100).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const DISPUTE_CATEGORIES = ['MISSING_ITEM', 'WRONG_ITEM', 'COLD_FOOD', 'NOT_COLLECTED', 'PAYMENT', 'OTHER'];

export const disputeSchema = z.object({
  category: z.enum(DISPUTE_CATEGORIES),
  description: z.string().trim().min(10, 'Describe what went wrong').max(1000),
});

export const disputeResolveSchema = z
  .object({
    status: z.enum(['RESOLVED', 'REJECTED']),
    resolution: z.enum(['REFUND', 'PARTIAL_REFUND', 'NO_ACTION']).optional(),
    refundAmount: z.number().min(0).max(1_000_000).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.status !== 'REJECTED' || !d.refundAmount, {
    path: ['refundAmount'],
    message: 'A rejected dispute cannot carry a refund',
  });

export const disputeQuerySchema = z.object({ status: z.enum(['OPEN', 'RESOLVED', 'REJECTED']).optional() });

export const notificationPrefsSchema = z
  .object({
    inApp: z.boolean().optional(),
    push: z.boolean().optional(),
    sms: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Choose at least one channel' });

/** Telemetry from real drone hardware; `seq` lets the API drop out-of-order reports. */
export const telemetrySchema = z.object({
  lat,
  lng,
  battery: z.number().min(0).max(100).optional(),
  status: z.enum(['IDLE', 'LOADED', 'IN_FLIGHT', 'MAINTENANCE']).optional(),
  seq: z.number().int().min(0).optional(),
});
