import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorCode, errorMessage } from '../../api/http.js';
import { hubApi, orderApi, restaurantApi } from '../../api/index.js';
import CartLine from '../../components/cart/CartLine.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Alert,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  InfoTooltip,
  Input,
  Skeleton,
  Spinner,
  Textarea,
  useToast,
} from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { money } from '../../utils/format.js';
import styles from './Checkout.module.css';

const NOTE_MAX = 500;
const ITEM_NOTE_MAX = 200;
const QUICK_NOTES = ['Less spicy', 'Serve hot', 'Serve cold', '0-calorie sugar'];

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phraseRx = (p) => new RegExp(`(^|,\\s*)${escapeRx(p)}(?=\\s*(,|$))`, 'i');
const hasPhrase = (text, p) => phraseRx(p).test(text);
const togglePhrase = (text, p) => {
  if (hasPhrase(text, p))
    return text
      .replace(phraseRx(p), '')
      .replace(/^\s*,\s*/, '')
      .trim();
  const base = text.trim().replace(/,\s*$/, '');
  return base ? `${base}, ${p}` : p;
};

/** Live menu check: null restaurant = the restaurant no longer exists. */
const loadLive = (id) =>
  restaurantApi.detail(id).catch((err) => {
    if (['NOT_FOUND', 'BAD_REQUEST'].includes(errorCode(err))) return { restaurant: null, menu: [] };
    throw err;
  });

function ItemNote({ item, onChange }) {
  const [open, setOpen] = useState(Boolean(item.note));
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && !item.note) inputRef.current?.focus();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open)
    return (
      <button type="button" className={styles.noteLink} aria-expanded="false" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} />
        Add note
      </button>
    );

  return (
    <div className={styles.itemNote}>
      <label className="visually-hidden" htmlFor={`note-${item.menuItemId}`}>
        Note for {item.name}
      </label>
      <Input
        ref={inputRef}
        id={`note-${item.menuItemId}`}
        size="sm"
        value={item.note}
        maxLength={ITEM_NOTE_MAX}
        placeholder="e.g. No onions"
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => !item.note.trim() && setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && !item.note.trim() && setOpen(false)}
      />
    </div>
  );
}

function HubPicker({ hubs, value, onChange, error, firstRef }) {
  if (hubs.loading)
    return (
      <div className={styles.hubGrid} aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={76} />
        ))}
      </div>
    );
  if (hubs.error) return <ErrorState compact title="We couldn’t load pickup hubs" error={hubs.error} onRetry={hubs.reload} />;
  if (!hubs.data?.length)
    return (
      <Alert tone="warning" title="No pickup hubs available">
        Ordering is paused until a hub is back online.
      </Alert>
    );

  return (
    <>
      <div className={styles.hubGrid}>
        {hubs.data.map((h, i) => (
          <label key={h._id} className={styles.hub}>
            <input
              ref={i === 0 ? firstRef : undefined}
              type="radio"
              name="hub"
              value={h._id}
              checked={value === h._id}
              onChange={() => onChange(h._id)}
              aria-describedby={error ? 'hub-error' : undefined}
              aria-invalid={error ? true : undefined}
            />
            <span className={styles.hubCard}>
              <Icon name="mapPin" size={18} />
              <span className={styles.hubText}>
                <span className={styles.hubName}>{h.name}</span>
                <span className={styles.hubAddress}>{h.address}</span>
              </span>
            </span>
            <span className={styles.check} aria-hidden="true">
              <Icon name="check" size={12} />
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id="hub-error" className={styles.fieldError} role="alert">
          <Icon name="alertCircle" size={14} />
          {error}
        </p>
      )}
    </>
  );
}

export default function Checkout() {
  const { user } = useAuth();
  const { cart, setQuantity, setItemNote, setCustomerNote, clear } = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const restaurantId = cart.restaurant?._id;

  const live = useAsync(() => (restaurantId ? loadLive(restaurantId) : Promise.resolve(null)), [restaurantId]);
  const hubs = useAsync(() => hubApi.listActive(), []);
  const [hubId, setHubId] = useState('');
  const [hubError, setHubError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const firstHubRef = useRef(null);

  useEffect(() => {
    if (hubId && hubs.data && !hubs.data.some((h) => h._id === hubId)) setHubId('');
  }, [hubs.data, hubId]);

  if (!cart.items.length)
    return (
      <div className={styles.page}>
        <PageHeader title="Checkout" />
        <Card>
          <EmptyState
            icon="cart"
            title="Your cart is empty"
            action={
              <Button variant="primary" to="/">
                Browse restaurants
              </Button>
            }
          >
            Add a few dishes from a restaurant to check out.
          </EmptyState>
        </Card>
      </div>
    );

  const liveMenu = live.data?.menu ? new Map(live.data.menu.map((m) => [m._id, m])) : null;
  const liveRestaurant = live.data?.restaurant;
  const gone = live.data && !liveRestaurant;
  const closed = liveRestaurant && !liveRestaurant.isOpen;
  // Prefer live prices so the summary matches what the server will charge.
  const lines = cart.items.map((i) => {
    const m = liveMenu?.get(i.menuItemId);
    return { ...i, price: m ? m.price : i.price, unavailable: Boolean(liveMenu && !gone && !m) };
  });
  const unavailableCount = lines.filter((l) => l.unavailable).length;
  const orderable = lines.filter((l) => !l.unavailable);
  const itemCount = orderable.reduce((n, l) => n + l.quantity, 0);
  const subtotal = orderable.reduce((s, l) => s + l.price * l.quantity, 0);
  const wrongRole = user && user.role !== 'customer';
  const blocked = live.loading || Boolean(live.error) || gone || closed || unavailableCount > 0 || wrongRole || !hubs.data?.length;

  const note = cart.customerNote || '';

  const submit = async (e) => {
    e.preventDefault();
    if (!user) return navigate('/login', { state: { from: '/checkout' } });
    if (blocked || busy) return;
    if (!hubId) {
      setHubError('Choose the hub where you’ll collect your order.');
      firstHubRef.current?.focus();
      return;
    }
    setBusy(true);
    setSubmitError('');
    try {
      const order = await orderApi.create({
        restaurantId,
        hubId,
        customerNote: note,
        paymentMethod: 'CASH_ON_COLLECTION',
        items: cart.items.map(({ menuItemId, quantity, note: n }) => ({ menuItemId, quantity, note: n })),
      });
      clear();
      toast.success('Your order is with the restaurant. We’ll let you know when it’s accepted.', { title: 'Order placed' });
      navigate(`/orders/${order._id}`);
    } catch (err) {
      const message = errorMessage(err);
      setSubmitError(message);
      toast.error(message, { title: 'Couldn’t place your order' });
      const code = errorCode(err);
      if (['ITEM_UNAVAILABLE', 'RESTAURANT_CLOSED', 'NOT_FOUND'].includes(code) || /menu/i.test(message)) live.reload();
      if (/hub/i.test(message)) hubs.reload();
      setBusy(false);
    }
  };

  const restaurantLink = restaurantId ? `/restaurants/${restaurantId}` : '/';

  return (
    <form className={styles.page} onSubmit={submit} noValidate>
      <PageHeader title="Checkout" back={{ to: restaurantLink, label: 'Back to menu' }} />

      <div className={styles.layout}>
        <div className={styles.main}>
          <Card padding="none" className={styles.card} aria-busy={live.loading || undefined}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>
                Your order from <Link to={restaurantLink}>{cart.restaurant.name}</Link>
              </h2>
              {live.loading && <Spinner size={16} label="Checking the latest menu" />}
              <InfoTooltip
                label="About item notes"
                content="Use “Add note” under a dish for requests about that dish only, like “no onions”. The restaurant sees it with the item."
              />
            </div>
            <ul className={styles.lines}>
              {lines.map((l) => (
                <CartLine key={l.menuItemId} item={l} unavailable={l.unavailable} onQuantity={(q) => setQuantity(l.menuItemId, q)}>
                  {!l.unavailable && <ItemNote item={l} onChange={(v) => setItemNote(l.menuItemId, v)} />}
                </CartLine>
              ))}
            </ul>
          </Card>

          <Card className={styles.card}>
            <div className={styles.labelRow}>
              <label htmlFor="order-note" className={styles.sectionLabel}>
                Note for the restaurant
              </label>
              <span className={styles.optional}>(optional)</span>
              <InfoTooltip
                label="About the order note"
                content="This note covers the whole order. Tap a suggestion to add or remove it, or type your own."
              />
            </div>
            <div className={styles.chips} role="group" aria-label="Quick notes">
              {QUICK_NOTES.map((p) => {
                const on = hasPhrase(note, p);
                const wouldOverflow = !on && togglePhrase(note, p).length > NOTE_MAX;
                return (
                  <Chip key={p} selected={on} disabled={wouldOverflow} onClick={() => setCustomerNote(togglePhrase(note, p))}>
                    {p}
                  </Chip>
                );
              })}
            </div>
            <Textarea
              id="order-note"
              rows={3}
              value={note}
              maxLength={NOTE_MAX}
              placeholder="Anything else the restaurant should know?"
              aria-describedby="order-note-count"
              onChange={(e) => setCustomerNote(e.target.value)}
            />
            <div id="order-note-count" className={styles.counter}>
              {note.length}/{NOTE_MAX}
            </div>
          </Card>

          <Card className={styles.card}>
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>
                <span className={styles.sectionLabel}>Pickup hub</span>
                <InfoTooltip
                  label="What is a pickup hub?"
                  content="A drone flies your order from the restaurant to the hub you choose. You collect it there with your pickup code."
                />
              </legend>
              <HubPicker
                hubs={hubs}
                value={hubId}
                error={hubError}
                firstRef={firstHubRef}
                onChange={(id) => {
                  setHubId(id);
                  setHubError('');
                }}
              />
            </fieldset>
          </Card>
        </div>

        <aside className={styles.aside} aria-label="Order summary">
          <Card className={styles.summary}>
            <h2 className={styles.cardTitle}>Summary</h2>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt>
                  Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                </dt>
                <dd>{money(subtotal)}</dd>
              </div>
              <div className={styles.row}>
                <dt className={styles.withTip}>
                  Delivery fee
                  <InfoTooltip
                    label="About the delivery fee"
                    content="A flat drone delivery fee is added when the order is placed. You’ll see it on your order before you pay."
                    size={15}
                  />
                </dt>
                <dd className={styles.muted}>Added at order</dd>
              </div>
              <div className={`${styles.row} ${styles.total}`}>
                <dt>Total</dt>
                <dd>{money(subtotal)} + fee</dd>
              </div>
            </dl>

            <div className={styles.payment}>
              <Icon name="cash" size={20} />
              <span>Cash on collection</span>
              <InfoTooltip
                label="About payment"
                content="Pay in cash at the hub when you collect your order with your pickup code. Nothing is charged now."
                size={15}
              />
            </div>

            {live.error && (
              <Alert
                tone="danger"
                title="We couldn’t check the menu"
                action={
                  <Button size="sm" variant="secondary" onClick={live.reload}>
                    Try again
                  </Button>
                }
              >
                {live.error}
              </Alert>
            )}
            {gone && (
              <Alert
                tone="danger"
                title="Restaurant unavailable"
                action={
                  <Button size="sm" variant="secondary" onClick={clear}>
                    Clear cart
                  </Button>
                }
              >
                This restaurant is no longer on GoodPanda.
              </Alert>
            )}
            {closed && (
              <Alert tone="warning" icon="clock" title="Closed right now">
                {liveRestaurant.name} isn’t taking orders. Try again when it opens.
              </Alert>
            )}
            {unavailableCount > 0 && (
              <Alert tone="warning" title={unavailableCount === 1 ? 'An item is unavailable' : `${unavailableCount} items are unavailable`}>
                Remove them to continue.
              </Alert>
            )}
            {wrongRole && <Alert tone="info">Only customer accounts can place orders.</Alert>}
            {submitError && <Alert tone="danger">{submitError}</Alert>}

            {!wrongRole && (
              <Button
                type="submit"
                variant="primary"
                size="lg"
                block
                loading={busy}
                disabled={Boolean(user) && blocked}
                icon={user ? undefined : 'user'}
              >
                {user ? (busy ? 'Placing order…' : 'Place order') : 'Log in to place order'}
              </Button>
            )}
          </Card>
        </aside>
      </div>
    </form>
  );
}
