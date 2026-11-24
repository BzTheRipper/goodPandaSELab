import { describe, expect, it } from 'vitest';
import { dayLabel, money, plural, shortId, timeAgo } from '../utils/format.js';
import { priceDeliveryFee, routeKm, droneSuitability } from '../utils/drone.js';

describe('format helpers', () => {
  it('formats money in BDT with two decimals', () => {
    expect(money(1250)).toBe('৳1250.00');
    expect(money('60.5')).toBe('৳60.50');
    expect(money(undefined)).toBe('৳0.00');
  });

  it('pluralises counts and shortens ids', () => {
    expect(plural(1, 'item')).toBe('1 item');
    expect(plural(3, 'item')).toBe('3 items');
    expect(shortId('64b7f0c2a1b2c3d4e5f60718')).toBe('#F60718');
  });

  it('labels recent times and days', () => {
    expect(timeAgo(new Date())).toBe('just now');
    expect(timeAgo(new Date(Date.now() - 2 * 3600 * 1000))).toBe('2 h ago');
    expect(dayLabel(new Date())).toBe('Today');
  });
});

describe('drone helpers', () => {
  it('measures zero distance for the same point and a real distance otherwise', () => {
    const p = { lat: 23.79, lng: 90.4 };
    expect(routeKm(p, p)).toBeCloseTo(0, 5);
    const d = routeKm({ lat: 23.7461, lng: 90.3742 }, { lat: 23.7937, lng: 90.4066 });
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(8);
    expect(routeKm(null, p)).toBeNull();
  });

  it('prices flat and distance fees, capped at the maximum', () => {
    expect(priceDeliveryFee({ deliveryFee: 60, mode: 'flat' }, 10)).toBe(60);
    expect(priceDeliveryFee({ deliveryFee: 60, mode: 'distance', perKm: 10, max: 300 }, 4)).toBe(100);
    expect(priceDeliveryFee({ deliveryFee: 60, mode: 'distance', perKm: 10, max: 120 }, 40)).toBe(120);
    expect(priceDeliveryFee(null, 4)).toBeNull();
  });

  it('explains why a drone cannot take an order', () => {
    const order = {
      items: [{ quantity: 4 }, { quantity: 2 }],
      restaurant: { location: { lat: 23.74, lng: 90.37 } },
      hub: { name: 'Banani', location: { lat: 23.79, lng: 90.4 } },
    };
    const good = { status: 'IDLE', battery: 100, capacityUnits: 12, location: { lat: 23.8, lng: 90.4 } };
    expect(droneSuitability(good, order).ok).toBe(true);

    expect(droneSuitability({ ...good, status: 'IN_FLIGHT' }, order)).toMatchObject({ ok: false });
    expect(droneSuitability({ ...good, currentOrder: 'abc' }, order).ok).toBe(false);
    expect(droneSuitability({ ...good, capacityUnits: 3 }, order).reason).toMatch(/larger drone/);
    expect(droneSuitability({ ...good, battery: 10 }, order).reason).toMatch(/minimum/);
  });
});
