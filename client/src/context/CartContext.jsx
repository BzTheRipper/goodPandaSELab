import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);
const KEY = 'gp_cart';
const empty = { restaurant: null, items: [], customerNote: '' };
export const MAX_QUANTITY = 50;

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || empty;
  } catch {
    return empty;
  }
};

/** Client-side cart, limited to one restaurant. Prices here are for display only; the server recalculates. */
export function CartProvider({ children }) {
  const [cart, setCart] = useState(load);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => localStorage.setItem(KEY, JSON.stringify(cart)), [cart]);

  const openCart = useCallback(() => setDrawerOpen(true), []);
  const closeCart = useCallback(() => setDrawerOpen(false), []);

  const value = useMemo(() => {
    const updateItem = (menuItemId, patch) =>
      setCart((c) => ({ ...c, items: c.items.map((i) => (i.menuItemId === menuItemId ? { ...i, ...patch } : i)) }));

    return {
      cart,
      count: cart.items.reduce((n, i) => n + i.quantity, 0),
      subtotal: cart.items.reduce((s, i) => s + i.price * i.quantity, 0),
      quantityOf: (menuItemId) => cart.items.find((i) => i.menuItemId === menuItemId)?.quantity || 0,
      /** True when adding from `restaurantId` would replace a cart from another restaurant. */
      conflictsWith: (restaurantId) => Boolean(cart.restaurant && cart.restaurant._id !== restaurantId && cart.items.length),
      /** Returns false when the item belongs to another restaurant and the caller didn't confirm replacing the cart. */
      addItem(restaurant, item, { replace = false } = {}) {
        if (cart.restaurant && cart.restaurant._id !== restaurant._id && !replace) return false;
        setCart((c) => {
          const base = c.restaurant?._id === restaurant._id ? c : { ...empty, restaurant: { _id: restaurant._id, name: restaurant.name } };
          const existing = base.items.find((i) => i.menuItemId === item._id);
          const items = existing
            ? base.items.map((i) => (i.menuItemId === item._id ? { ...i, quantity: Math.min(MAX_QUANTITY, i.quantity + 1) } : i))
            : [
                ...base.items,
                { menuItemId: item._id, name: item.name, price: item.price, imageUrl: item.imageUrl || '', quantity: 1, note: '' },
              ];
          return { ...base, items };
        });
        return true;
      },
      /** Replaces the whole cart, e.g. when re-ordering a past order. */
      fillCart: (restaurant, lines) =>
        setCart({
          ...empty,
          restaurant: { _id: restaurant._id, name: restaurant.name },
          items: lines.map(({ item, quantity, note = '' }) => ({
            menuItemId: item._id,
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
              return items.length ? { ...c, items } : empty;
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
