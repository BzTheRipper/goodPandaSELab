import { describe, expect, it } from 'vitest';
import { applyTransition, assertTransition } from '../src/services/orderStateMachine.js';

const order = (status, extra = {}) => ({ status, statusHistory: [], ...extra });
const code = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e.status;
  }
};

describe('order state machine', () => {
  it('follows the happy path and records history', () => {
    const o = order('PLACED');
    const steps = [
      ['ACCEPTED', 'owner'],
      ['PREPARING', 'owner'],
      ['READY_FOR_DRONE', 'owner'],
      ['IN_FLIGHT', 'owner'],
      ['ARRIVED_AT_HUB', 'system'],
      ['COLLECTED', 'admin'],
    ];
    steps.forEach(([to, role]) => applyTransition(o, to, { id: 'u1', role }));
    expect(o.status).toBe('COLLECTED');
    expect(o.statusHistory.map((h) => h.status)).toEqual(steps.map((s) => s[0]));
    expect(o.statusHistory[0]).toMatchObject({ actor: 'u1', actorRole: 'owner' });
  });

  it('rejects skipping states with 409', () => {
    expect(code(() => assertTransition(order('PLACED'), 'READY_FOR_DRONE', 'owner'))).toBe(409);
    expect(code(() => assertTransition(order('ACCEPTED'), 'COLLECTED', 'admin'))).toBe(409);
  });

  it('rejects any change once final', () => {
    for (const s of ['COLLECTED', 'CANCELLED', 'REJECTED']) {
      expect(code(() => assertTransition(order(s), 'CANCELLED', 'admin'))).toBe(409);
    }
  });

  it('lets the customer cancel only while PLACED', () => {
    expect(code(() => assertTransition(order('PLACED'), 'CANCELLED', 'customer'))).toBeNull();
    expect(code(() => assertTransition(order('ACCEPTED'), 'CANCELLED', 'customer'))).toBe(403);
    expect(code(() => assertTransition(order('READY_FOR_DRONE'), 'CANCELLED', 'customer'))).toBe(403);
    expect(code(() => assertTransition(order('IN_FLIGHT'), 'CANCELLED', 'customer'))).toBe(403);
  });

  it('enforces roles per transition', () => {
    expect(code(() => assertTransition(order('PLACED'), 'ACCEPTED', 'customer'))).toBe(403);
    expect(code(() => assertTransition(order('IN_FLIGHT'), 'ARRIVED_AT_HUB', 'owner'))).toBe(403);
    expect(code(() => assertTransition(order('ARRIVED_AT_HUB'), 'COLLECTED', 'owner'))).toBe(403);
    expect(code(() => assertTransition(order('PREPARING'), 'CANCELLED', 'admin'))).toBeNull();
  });

  it('only resumes a confirmation to the previous status', () => {
    const o = order('NEEDS_CUSTOMER_CONFIRMATION', { confirmationRequest: { previousStatus: 'PREPARING' } });
    expect(code(() => assertTransition(o, 'PREPARING', 'customer'))).toBeNull();
    expect(code(() => assertTransition(o, 'ACCEPTED', 'customer'))).toBe(409);
    expect(code(() => assertTransition(o, 'PREPARING', 'owner'))).toBe(403);
    expect(code(() => assertTransition(o, 'CANCELLED', 'customer'))).toBeNull();
    expect(code(() => assertTransition(o, 'CANCELLED', 'owner'))).toBeNull();
  });

  it('lets the owner cancel only after the customer agreed to continue', () => {
    expect(code(() => assertTransition(order('PREPARING'), 'CANCELLED', 'owner'))).toBe(403);
    const agreed = order('PREPARING', { confirmationRequest: { resolution: 'CONTINUED' } });
    expect(code(() => assertTransition(agreed, 'CANCELLED', 'owner'))).toBeNull();
  });
});
