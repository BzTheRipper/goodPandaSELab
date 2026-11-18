import { useCallback } from 'react';
import { useConfirm, useToast } from '../components/ui/index.js';
import { useCart } from '../context/CartContext.jsx';

/** Adds a menu item, asking before a cart from another restaurant is replaced (single-restaurant rule). */
export function useAddToCart() {
  const { cart, addItem, conflictsWith } = useCart();
  const confirm = useConfirm();
  const toast = useToast();

  return useCallback(
    async (restaurant, item) => {
      if (!conflictsWith(restaurant._id)) return addItem(restaurant, item);
      const ok = await confirm({
        title: 'Start a new cart?',
        message: `Your cart has items from ${cart.restaurant.name}. You can order from one restaurant at a time, so adding ${item.name} will remove them.`,
        confirmLabel: 'Start new cart',
        cancelLabel: 'Keep my cart',
        tone: 'primary',
      });
      if (!ok) return false;
      addItem(restaurant, item, { replace: true });
      toast.info(`New cart started from ${restaurant.name}`);
      return true;
    },
    [cart.restaurant, addItem, conflictsWith, confirm, toast],
  );
}
