import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext.jsx';
import { money } from '../../utils/format.js';
import { Button, Drawer, EmptyState, InfoTooltip, useConfirm } from '../ui/index.js';
import CartLine from './CartLine.jsx';
import styles from './CartDrawer.module.css';

/** Slide-in cart, opened from the header on any shopper page. */
export default function CartDrawer() {
  const { cart, count, subtotal, restaurants, setQuantity, clear, drawerOpen, closeCart } = useCart();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const confirm = useConfirm();
  const isEmpty = !cart.items.length;

  useEffect(() => closeCart(), [pathname, closeCart]);

  const clearCart = async () => {
    if (await confirm({ title: 'Clear your cart?', message: 'Every item in your cart will be removed.', confirmLabel: 'Clear cart' }))
      clear();
  };

  return (
    <Drawer
      open={drawerOpen}
      onClose={closeCart}
      side="right"
      size="md"
      title={isEmpty ? 'Your cart' : `Your cart (${count})`}
      footer={
        !isEmpty && (
          <div className={styles.footer}>
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>
                Subtotal
                <InfoTooltip content="The drone delivery fee is added when you place the order." label="About the subtotal" size={14} />
              </span>
              <strong>{money(subtotal)}</strong>
            </div>
            <Button
              variant="primary"
              size="lg"
              block
              iconRight="chevronRight"
              onClick={() => navigate('/checkout')}
              disabled={pathname === '/checkout'}
            >
              {pathname === '/checkout' ? 'You’re at checkout' : 'Go to checkout'}
            </Button>
          </div>
        )
      }
    >
      {isEmpty ? (
        <EmptyState
          icon="cart"
          title="Your cart is empty"
          action={
            <Button variant="primary" to="/" onClick={closeCart}>
              Browse restaurants
            </Button>
          }
        />
      ) : (
        <>
          <div className={styles.from}>
            <span className={styles.fromLabel}>From</span>
            {restaurants.length > 1 ? (
              <span className={styles.fromName}>{restaurants.length} restaurants · one order each</span>
            ) : (
              <Link to={`/restaurants/${restaurants[0]._id}`} className={styles.fromName}>
                {restaurants[0].name}
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={clearCart} className={styles.clear}>
              Clear
            </Button>
          </div>
          {restaurants.map((r) => (
            <section key={r._id} className={styles.group} aria-label={r.name}>
              {restaurants.length > 1 && (
                <h3 className={styles.groupName}>
                  <Link to={`/restaurants/${r._id}`}>{r.name}</Link>
                </h3>
              )}
              <ul className={styles.list}>
                {cart.items
                  .filter((i) => i.restaurantId === r._id)
                  .map((i) => (
                    <CartLine key={i.menuItemId} item={i} onQuantity={(q) => setQuantity(i.menuItemId, q)} />
                  ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </Drawer>
  );
}
