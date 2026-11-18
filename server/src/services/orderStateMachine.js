import { FINAL_STATUSES, ORDER_STATUS as S, ROLES } from '../constants.js';
import { AppError } from '../utils/errors.js';

const { CUSTOMER, OWNER, ADMIN, SYSTEM } = ROLES;

// from -> { to: [roles allowed] }. Anything not listed is an invalid transition.
export const TRANSITIONS = {
  [S.PLACED]: {
    [S.ACCEPTED]: [OWNER],
    [S.REJECTED]: [OWNER],
    [S.NEEDS_CUSTOMER_CONFIRMATION]: [OWNER],
    [S.CANCELLED]: [CUSTOMER, ADMIN],
  },
  [S.ACCEPTED]: {
    [S.PREPARING]: [OWNER],
    [S.NEEDS_CUSTOMER_CONFIRMATION]: [OWNER],
    [S.CANCELLED]: [ADMIN],
  },
  [S.PREPARING]: {
    [S.READY_FOR_DRONE]: [OWNER],
    [S.NEEDS_CUSTOMER_CONFIRMATION]: [OWNER],
    [S.CANCELLED]: [ADMIN],
  },
  // Returning from confirmation is only allowed to the status recorded in confirmationRequest.previousStatus.
  [S.NEEDS_CUSTOMER_CONFIRMATION]: {
    [S.PLACED]: [CUSTOMER],
    [S.ACCEPTED]: [CUSTOMER],
    [S.PREPARING]: [CUSTOMER],
    [S.CANCELLED]: [CUSTOMER, OWNER, ADMIN],
  },
  [S.READY_FOR_DRONE]: {
    [S.IN_FLIGHT]: [OWNER],
    [S.CANCELLED]: [ADMIN],
  },
  [S.IN_FLIGHT]: {
    [S.ARRIVED_AT_HUB]: [SYSTEM],
    // Admin recovery after a drone failure: send the order back so the owner can re-dispatch.
    [S.READY_FOR_DRONE]: [ADMIN],
    [S.CANCELLED]: [ADMIN],
  },
  [S.ARRIVED_AT_HUB]: {
    [S.COLLECTED]: [ADMIN],
    [S.CANCELLED]: [ADMIN],
  },
};

export const isFinal = (status) => FINAL_STATUSES.includes(status);

// The owner may cancel an order the customer already agreed to continue after a confirmation request.
const ownerMayCancelAfterAgreement = (order, to, role) =>
  role === OWNER &&
  to === S.CANCELLED &&
  [S.ACCEPTED, S.PREPARING].includes(order.status) &&
  order.confirmationRequest?.resolution === 'CONTINUED';

/** Throws an AppError (409 invalid transition / 403 role not allowed) if the transition is not permitted. */
export function assertTransition(order, to, role) {
  const from = order.status;
  if (isFinal(from)) {
    throw new AppError(409, `Order is already ${from} and can no longer change`, 'INVALID_TRANSITION');
  }
  if (ownerMayCancelAfterAgreement(order, to, role)) return;

  const allowedRoles = TRANSITIONS[from]?.[to];
  if (!allowedRoles) {
    throw new AppError(409, `Cannot change order from ${from} to ${to}`, 'INVALID_TRANSITION');
  }
  if (from === S.NEEDS_CUSTOMER_CONFIRMATION && to !== S.CANCELLED && to !== order.confirmationRequest?.previousStatus) {
    throw new AppError(409, `Order can only resume to ${order.confirmationRequest?.previousStatus}`, 'INVALID_TRANSITION');
  }
  if (!allowedRoles.includes(role)) {
    const hint =
      role === CUSTOMER && to === S.CANCELLED
        ? 'You can only cancel before the restaurant accepts the order. After that, use the order chat.'
        : `A ${role} cannot move an order from ${from} to ${to}`;
    throw new AppError(403, hint, 'TRANSITION_FORBIDDEN');
  }
}

/** Validates and applies a transition in place, recording it in statusHistory. */
export function applyTransition(order, to, actor, note) {
  assertTransition(order, to, actor.role);
  order.status = to;
  order.statusHistory.push({ status: to, at: new Date(), actor: actor.id ?? null, actorRole: actor.role, note });
  return order;
}
