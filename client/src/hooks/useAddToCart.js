import { useCallback } from 'react';
import { useToast } from '../components/ui/index.js';
import { useCart } from '../context/CartContext.jsx';

/**
 * Adds a menu item to the cart. The cart may mix restaurants; checkout splits it into one order
 * per restaurant, so there is no "start a new cart?" prompt any more.
 */
export function useAddToCart() {
  const { addItem } = useCart();
  const toast = useToast();

  return useCallback(
    async (restaurant, item) => {
      addItem(restaurant, item);
      toast.success(`${item.name} added to your cart`, { title: restaurant.name });
      return true;
    },
    [addItem, toast]
  );
}
