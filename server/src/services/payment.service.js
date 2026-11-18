import { PAYMENT_METHODS, PAYMENT_STATUS } from '../constants.js';
import { badRequest } from '../utils/errors.js';

// Payment is isolated here so an online gateway can be added as another method later.
const methods = {
  [PAYMENT_METHODS.CASH_ON_COLLECTION]: {
    // Nothing to charge up-front: the customer pays at the hub.
    initiate: () => ({ paymentStatus: PAYMENT_STATUS.PENDING }),
    onCollected: () => ({ paymentStatus: PAYMENT_STATUS.PAID }),
    onCancelled: () => ({ paymentStatus: PAYMENT_STATUS.VOID }),
  },
};

function method(name) {
  const m = methods[name];
  if (!m) throw badRequest(`Unsupported payment method ${name}`);
  return m;
}

export const initiatePayment = (order) => Object.assign(order, method(order.paymentMethod).initiate(order));
export const settleOnCollection = (order) => Object.assign(order, method(order.paymentMethod).onCollected(order));
export const voidPayment = (order) => Object.assign(order, method(order.paymentMethod).onCancelled(order));
