import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CartProvider, MAX_QUANTITY, useCart } from './CartContext.jsx';

const RESTAURANT = { _id: 'r1', name: 'Panda Biryani' };
const RIVAL = { _id: 'r2', name: 'Green Leaf' };
const ITEM = { _id: 'm1', name: 'Kacchi Biryani', price: 350 };
const SALAD = { _id: 'm2', name: 'Caesar Salad', price: 300 };

let api;
function Probe() {
  api = useCart();
  return (
    <div>
      <span data-testid="count">{api.count}</span>
      <span data-testid="subtotal">{api.subtotal}</span>
      <span data-testid="quantity">{api.quantityOf('m1')}</span>
      <span data-testid="restaurants">{api.restaurants.map((r) => r.name).join('|')}</span>
      <span data-testid="primary">{api.restaurant?.name || 'mixed'}</span>
      <span data-testid="r2count">{api.countForRestaurant('r2')}</span>
    </div>
  );
}

const setup = () =>
  render(
    <CartProvider>
      <Probe />
    </CartProvider>
  );

describe('CartContext', () => {
  it('adds items, sums the subtotal and clamps quantity to the API limit', () => {
    setup();
    act(() => api.addItem(RESTAURANT, ITEM));
    act(() => api.addItem(RESTAURANT, ITEM));
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('subtotal').textContent).toBe('700');
    expect(screen.getByTestId('quantity').textContent).toBe('2');

    act(() => api.setQuantity('m1', 999));
    expect(screen.getByTestId('quantity').textContent).toBe(String(MAX_QUANTITY));
    expect(screen.getByTestId('subtotal').textContent).toBe(String(ITEM.price * MAX_QUANTITY));
  });

  it('keeps items from several restaurants together', () => {
    setup();
    act(() => api.addItem(RESTAURANT, ITEM));
    act(() => api.addItem(RIVAL, SALAD));
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('subtotal').textContent).toBe('650');
    expect(screen.getByTestId('restaurants').textContent).toBe('Panda Biryani|Green Leaf');
    expect(screen.getByTestId('primary').textContent).toBe('mixed');
    expect(screen.getByTestId('r2count').textContent).toBe('1');
  });

  it('can replace the cart explicitly and remove lines', () => {
    setup();
    act(() => api.addItem(RESTAURANT, ITEM));
    act(() => api.addItem(RIVAL, SALAD, { replace: true }));
    expect(screen.getByTestId('restaurants').textContent).toBe('Green Leaf');
    expect(screen.getByTestId('count').textContent).toBe('1');

    act(() => api.setQuantity('m2', 0));
    expect(screen.getByTestId('count').textContent).toBe('0');
    act(() => api.addItem(RESTAURANT, ITEM));
    act(() => api.clear());
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('persists the cart and upgrades the old single-restaurant shape', () => {
    setup();
    act(() => api.addItem(RESTAURANT, ITEM));
    const stored = JSON.parse(localStorage.getItem('gp_cart'));
    expect(stored.items[0]).toMatchObject({ menuItemId: 'm1', restaurantId: 'r1', restaurantName: 'Panda Biryani' });
    expect(stored.restaurant).toBeUndefined();

    // Cart written by an older client: items have no restaurant stamp.
    localStorage.setItem(
      'gp_cart',
      JSON.stringify({
        restaurant: { _id: 'r9', name: 'Old Place' },
        items: [{ menuItemId: 'm9', name: 'Legacy dish', price: 100, quantity: 1, note: '' }],
        customerNote: '',
      })
    );
    render(
      <CartProvider>
        <Probe />
      </CartProvider>
    );
    expect(screen.getAllByTestId('restaurants').at(-1).textContent).toBe('Old Place');
  });
});
