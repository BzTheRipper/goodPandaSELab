import { useCallback, useState } from 'react';
import { errorMessage } from '../api/http.js';
import { restaurantApi } from '../api/index.js';
import { useConfirm, useToast } from '../components/ui/index.js';
import { useCart } from '../context/CartContext.jsx';

/** Refills the cart with the still-available items of a past order and opens it. */
export function useReorder() {
  const { cart, count, fillCart, openCart } = useCart();
  const confirm = useConfirm();
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);

  const reorder = useCallback(
    async (order) => {
      const restaurantId = order.restaurant?._id ?? order.restaurant;
      setBusyId(order._id);
      try {
        const { restaurant, menu } = await restaurantApi.detail(restaurantId);
        if (!restaurant.isOpen) {
          toast.info(`${restaurant.name} is closed right now. Try again when it opens.`, { title: 'Can’t reorder yet' });
          return;
        }
        const byId = new Map(menu.map((m) => [String(m._id), m]));
        const wanted = order.items.filter((i) => !i.removed);
        const lines = wanted
          .map((i) => ({ item: byId.get(String(i.menuItem?._id ?? i.menuItem)), quantity: i.quantity, note: i.note || '' }))
          .filter((l) => l.item);
        if (!lines.length) {
          toast.info('None of the items from this order are on the menu right now.', { title: 'Nothing to add' });
          return;
        }
        if (count > 0) {
          const ok = await confirm({
            title: 'Replace your cart?',
            message: 'Your cart already has items. Reordering will replace them with this order.',
            confirmLabel: 'Replace cart',
            cancelLabel: 'Keep my cart',
            tone: 'primary',
          });
          if (!ok) return;
        }
        fillCart(restaurant, lines);
        openCart();
        const missing = wanted.length - lines.length;
        if (missing > 0)
          toast.info(`${missing} item${missing > 1 ? 's are' : ' is'} no longer available and ${missing > 1 ? 'were' : 'was'} left out.`);
        else toast.success('Items added to your cart');
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [count, fillCart, openCart, confirm, toast],
  );

  return { reorder, busyId };
}
