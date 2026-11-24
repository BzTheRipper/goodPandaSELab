import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);
const KEY = 'gp_cart';
const empty = { items: [], customerNote: '' };
export const MAX_QUANTITY = 50;

/** Reads the stored cart and upgrades the old single-restaurant shape in place. */
const load = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY));
    if (!stored || !Array.isArray(stored.items)) return empty;
    const legacy = stored.restaurant;
    const items = stored.items
      .filter((i) => i && i.menuItemId)
      .map((i) => ({
        ...i,
        restaurantId: i.restaurantId || legacy?._id || '',
        restaurantName: i.restaurantName || legacy?.name || '',
      }));
    return { items, customerNote: stored.customerNote || '' };
  } catch {
    return empty;
  }
};

/**
 * Client-side cart. It may hold items from several restaurants; checkout splits them into one
 * order per restaurant. Prices here are for display only — the server recalculates everything.
 */
export function CartProvider({ children }) {
  const [cart, setCart] = useState(load);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => localStorage.setItem(KEY, JSON.stringify(cart)), [cart]);

  const openCart = useCallback(() => setDrawerOpen(true), []);
  const closeCart = useCallback(() => setDrawerOpen(false), []);

  const value = useMemo(() => {
    const updateItem = (menuItemId, patch) =>
      setCart((c) => ({ ...c, items: c.items.map((i) => (i.menuItemId === menuItemId ? { ...i, ...patch } : i)) }));

    const restaurants = [
      ...new Map(cart.items.map((i) => [i.restaurantId, i.restaurantName])).entries(),
    ].map(([id, name]) => ({ _id: id, name }));

    return {
      cart,
      // Kept for screens that are still single-restaurant (a cart with one restaurant, or none).
      restaurant: restaurants.length === 1 ? restaurants[0] : null,
      restaurants,
      count: cart.items.reduce((n, i) => n + i.quantity, 0),
      subtotal: cart.items.reduce((s, i) => s + i.price * i.quantity, 0),
      quantityOf: (menuItemId) => cart.items.find((i) => i.menuItemId === menuItemId)?.quantity || 0,
      countForRestaurant: (restaurantId) =>
        cart.items.filter((i) => i.restaurantId === restaurantId).reduce((n, i) => n + i.quantity, 0),
      subtotalForRestaurant: (restaurantId) =>
        cart.items.filter((i) => i.restaurantId === restaurantId).reduce((s, i) => s + i.price * i.quantity, 0),
      /** Adds an item. `replace` clears the cart first (used by "start a new cart"). */
      addItem(restaurant, item, { replace = false } = {}) {
        setCart((c) => {
          const base = replace ? { ...empty } : c;
          const existing = base.items.find((i) => i.menuItemId === item._id);
          const items = existing
            ? base.items.map((i) =>
                i.menuItemId === item._id ? { ...i, quantity: Math.min(MAX_QUANTITY, i.quantity + 1) } : i
              )
            : [
                ...base.items,
                {
                  menuItemId: item._id,
                  restaurantId: restaurant._id,
                  restaurantName: restaurant.name,
                  name: item.name,
                  price: item.price,
                  imageUrl: item.imageUrl || '',
                  quantity: 1,
                  note: '',
                },
              ];
          return { ...base, items };
        });
        return true;
      },
      /** Replaces the whole cart, e.g. when re-ordering a past order. */
      fillCart: (restaurant, lines) =>
        setCart({
          ...empty,
          items: lines.map(({ item, quantity, note = '' }) => ({
            menuItemId: item._id,
            restaurantId: restaurant._id,
            restaurantName: restaurant.name,
            name: item.name,
            price: item.price,
            imageUrl: item.imageUrl || '',
            quantity: Math.min(MAX_QUANTITY, quantity),
            note,
          })),
        }),
      setQuantity: (id, quantity) =>
        quantity < 1
          ? setCart((c) => {
              const items = c.items.filter((i) => i.menuItemId !== id);
              return { ...c, items };
            })
          : updateItem(id, { quantity: Math.min(MAX_QUANTITY, quantity) }),
      setItemNote: (id, note) => updateItem(id, { note }),
      setCustomerNote: (customerNote) => setCart((c) => ({ ...c, customerNote })),
      clear: () => setCart(empty),
      drawerOpen,
      openCart,
      closeCart,
    };
  }, [cart, drawerOpen, openCart, closeCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
