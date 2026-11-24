import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorCode, errorMessage } from '../../api/http.js';
import { couponApi, hubApi, orderApi, restaurantApi, settingsApi } from '../../api/index.js';
import CartLine from '../../components/cart/CartLine.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  FormError,
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
import { priceDeliveryFee, routeKm } from '../../utils/drone.js';
import styles from './Checkout.module.css';

const NOTE_MAX = 500;
const ITEM_NOTE_MAX = 200;
const QUICK_NOTES = ['Less spicy', 'Serve hot', 'Serve cold', '0-calorie sugar'];
// The restaurant needs a little warning; the server rejects past times too.
const MIN_SCHEDULE_LEAD_MS = 15 * 60 * 1000;

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in the browser's own timezone. */
const toLocalInputValue = (date) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

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

  // One order per restaurant, however many restaurants the cart holds.
  const groups = useMemo(() => {
    const map = new Map();
    for (const item of cart.items) {
      if (!map.has(item.restaurantId)) {
        map.set(item.restaurantId, { restaurantId: item.restaurantId, restaurantName: item.restaurantName, items: [] });
      }
      map.get(item.restaurantId).items.push(item);
    }
    return [...map.values()];
  }, [cart.items]);
  const groupsKey = groups.map((g) => g.restaurantId).join(',');
  const single = groups.length === 1;
  const restaurantId = single ? groups[0].restaurantId : null;

  // Validate every restaurant's menu, in parallel.
  const live = useAsync(
    () =>
      groups.length
        ? Promise.all(groups.map((g) => loadLive(g.restaurantId).then((data) => ({ restaurantId: g.restaurantId, ...data }))))
        : Promise.resolve([]),
    [groupsKey]
  );
  const hubs = useAsync(() => hubApi.listActive(), []);
  const pricing = useAsync(() => settingsApi.public(), []);
  const [hubId, setHubId] = useState('');
  const [hubError, setHubError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH_ON_COLLECTION');
  const [scheduledFor, setScheduledFor] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [useCredit, setUseCredit] = useState(false);
  const [creditBalance, setCreditBalance] = useState(0);
  const firstHubRef = useRef(null);

  useEffect(() => {
    const loadCredit = async () => {
      try {
        const refs = await authApi.referrals();
        setCreditBalance(refs.creditBalance || 0);
      } catch {
        setCreditBalance(0);
      }
    };
    if (user?.role === 'customer') loadCredit();
  }, [user?.role]);

  // A coupon is tied to one restaurant's cart; any change to the restaurant mix invalidates it.
  useEffect(() => {
    setCoupon(null);
    setCouponCode('');
    setCouponError('');
  }, [groupsKey]);

  // Split orders are cash-only: each restaurant would need its own payment session.
  useEffect(() => {
    if (!single) setPaymentMethod('CASH_ON_COLLECTION');
  }, [single]);

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

  const liveByRestaurant = new Map((live.data || []).map((d) => [d.restaurantId, d]));
  // Prefer live prices so the summary matches what the server will charge.
  const grouped = groups.map((group) => {
    const data = liveByRestaurant.get(group.restaurantId);
    const menu = data?.menu ? new Map(data.menu.map((m) => [m._id, m])) : null;
    const gone = Boolean(data) && !data.restaurant;
    const closed = Boolean(data?.restaurant) && !data.restaurant.isOpen;
    const lines = group.items.map((item) => {
      const liveItem = menu?.get(item.menuItemId);
      return {
        ...item,
        price: liveItem ? liveItem.price : item.price,
        unavailable: Boolean(menu && !gone && !liveItem),
      };
    });
    const unavailableCount = lines.filter((l) => l.unavailable).length;
    const subtotal = lines.filter((l) => !l.unavailable).reduce((sum, l) => sum + l.price * l.quantity, 0);
    return { ...group, restaurant: data?.restaurant, gone, closed, lines, unavailableCount, subtotal };
  });

  const itemCount = grouped.reduce(
    (n, g) => n + g.lines.filter((l) => !l.unavailable).reduce((m, l) => m + l.quantity, 0),
    0
  );
  const subtotal = grouped.reduce((sum, g) => sum + g.subtotal, 0);
  const selectedHub = hubs.data?.find((h) => h._id === hubId);
  // Online payment is single-restaurant only (one Checkout Session per order).
  const onlinePaymentEnabled = Boolean(pricing.data?.onlinePaymentEnabled) && single;
  const fees = grouped.map((g) => ({
    restaurantId: g.restaurantId,
    name: g.restaurant?.name || g.restaurantName || 'Restaurant',
    fee: selectedHub ? priceDeliveryFee(pricing.data, routeKm(g.restaurant?.location, selectedHub.location)) : null,
  }));
  const deliveryTotal = selectedHub ? fees.reduce((sum, f) => sum + (f.fee || 0), 0) : null;
  const discount = coupon?.discount || 0;
  const grandTotal = subtotal - discount + (deliveryTotal ?? 0);
  const wrongRole = user && user.role !== 'customer';
  const blocked =
    live.loading ||
    Boolean(live.error) ||
    wrongRole ||
    !hubs.data?.length ||
    grouped.some((g) => g.gone || g.closed || g.unavailableCount > 0);

  const note = cart.customerNote || '';

  const applyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return setCouponError('Enter a coupon code.');
    if (!single) return setCouponError('Coupons work on single-restaurant orders only.');
    setCouponBusy(true);
    setCouponError('');
    try {
      const quote = await couponApi.validate({ code, restaurantId, subtotal });
      setCoupon(quote);
      setCouponCode(quote.code);
    } catch (err) {
      setCoupon(null);
      setCouponError(errorMessage(err));
    }
    setCouponBusy(false);
  };

  const removeCoupon = () => {
    setCoupon(null);
    setCouponCode('');
    setCouponError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!user) return navigate('/login', { state: { from: '/checkout' } });
    if (blocked || busy) return;
    if (!hubId) {
      setHubError('Choose the hub where you’ll collect your orders.');
      firstHubRef.current?.focus();
      return;
    }
    const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
    if (scheduledDate && (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() - Date.now() < MIN_SCHEDULE_LEAD_MS)) {
      setScheduleError('Choose a time at least 15 minutes from now, or leave it empty to order now.');
      return;
    }
    setScheduleError('');
    setBusy(true);
    setSubmitError('');
    const payloadItems = (items) => items.map(({ menuItemId, quantity, note: n }) => ({ menuItemId, quantity, note: n }));
    try {
      if (!single) {
        const result = await orderApi.createGroup({
          hubId,
          customerNote: note,
          scheduledFor: scheduledDate ? scheduledDate.toISOString() : undefined,
          groups: grouped.map((g) => ({ restaurantId: g.restaurantId, items: payloadItems(g.items) })),
        });
        clear();
        toast.success(
          `${result.orders.length} orders placed — one per restaurant. Each arrives at the hub separately with its own pickup code.`,
          { title: scheduledDate ? 'Orders scheduled' : 'Orders placed' }
        );
        navigate(`/orders/${result.orders[0]._id}`);
        return;
      }

      const order = await orderApi.create({
        restaurantId,
        hubId,
        customerNote: note,
        paymentMethod,
        ...(coupon?.code && { couponCode: coupon.code }),
        ...(useCredit && creditBalance > 0 && { useCredit: true }),
        scheduledFor: scheduledDate ? scheduledDate.toISOString() : undefined,
        items: payloadItems(grouped[0].items),
      });
      clear();
      // Online payment leaves the app for Stripe Checkout; the webhook is what marks it paid.
      if (order.paymentUrl) {
        window.location.assign(order.paymentUrl);
        return;
      }
      toast.success(
        scheduledDate
          ? `Your order is scheduled for ${scheduledDate.toLocaleString()}. We’ll send it to the restaurant then.`
          : 'Your order is with the restaurant. We’ll let you know when it’s accepted.',
        { title: scheduledDate ? 'Order scheduled' : 'Order placed' }
      );
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

  const restaurantLink = single && restaurantId ? `/restaurants/${restaurantId}` : '/';

  return (
    <form className={styles.page} onSubmit={submit} noValidate>
      <PageHeader title="Checkout" back={{ to: restaurantLink, label: 'Back to menu' }} />

      <div className={styles.layout}>
        <div className={styles.main}>
          <Card padding="none" className={styles.card} aria-busy={live.loading || undefined}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>
                {single ? (
                  <>
                    Your order from <Link to={restaurantLink}>{grouped[0].restaurant?.name || grouped[0].restaurantName}</Link>
                  </>
                ) : (
                  <>Your orders · {grouped.length} restaurants</>
                )}
              </h2>
              {live.loading && <Spinner size={16} label="Checking the latest menus" />}
              <InfoTooltip
                label="About item notes"
                content="Use “Add note” under a dish for requests about that dish only, like “no onions”. The restaurant sees it with the item."
              />
            </div>
            {!single && (
              <p className={styles.groupIntro}>
                Each restaurant gets its own order and drone, so items arrive at the hub separately with separate pickup
                codes.
              </p>
            )}
            {grouped.map((group) => (
              <section key={group.restaurantId} className={styles.orderGroup} aria-label={group.restaurant?.name || group.restaurantName}>
                {!single && (
                  <div className={styles.groupHead}>
                    <h3 className={styles.groupName}>
                      {group.restaurant ? (
                        <Link to={`/restaurants/${group.restaurantId}`}>{group.restaurant.name}</Link>
                      ) : (
                        group.restaurantName || 'Restaurant'
                      )}
                    </h3>
                    {group.closed && <Badge tone="warning">Closed</Badge>}
                    {group.gone && <Badge tone="danger">Unavailable</Badge>}
                    {group.unavailableCount > 0 && <Badge tone="warning">{group.unavailableCount} unavailable</Badge>}
                  </div>
                )}
                <ul className={styles.lines}>
                  {group.lines.map((l) => (
                    <CartLine key={l.menuItemId} item={l} unavailable={l.unavailable} onQuantity={(q) => setQuantity(l.menuItemId, q)}>
                      {!l.unavailable && <ItemNote item={l} onChange={(v) => setItemNote(l.menuItemId, v)} />}
                    </CartLine>
                  ))}
                </ul>
              </section>
            ))}
          </Card>

          <Card className={styles.card}>
            <div className={styles.labelRow}>
              <label htmlFor="order-note" className={styles.sectionLabel}>
                {single ? 'Note for the restaurant' : 'Note for the restaurants'}
              </label>
              <span className={styles.optional}>(optional)</span>
              <InfoTooltip
                label="About the order note"
                content="This note covers every restaurant in this checkout. Tap a suggestion to add or remove it, or type your own."
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

          <Card className={styles.card}>
            <div className={styles.labelRow}>
              <label htmlFor="schedule" className={styles.sectionLabel}>
                Schedule for later
              </label>
              <span className={styles.optional}>(optional)</span>
              <InfoTooltip
                label="About scheduled orders"
                content="Leave this empty to send the order now. A scheduled order is held back and only reaches the restaurant at the time you choose, so it is fresh when you collect it."
              />
            </div>
            <Input
              id="schedule"
              type="datetime-local"
              value={scheduledFor}
              min={toLocalInputValue(new Date(Date.now() + MIN_SCHEDULE_LEAD_MS))}
              aria-describedby="schedule-hint"
              onChange={(e) => {
                setScheduledFor(e.target.value);
                setScheduleError('');
              }}
            />
            <p id="schedule-hint" className={styles.optional}>
              {single
                ? 'The restaurant receives the order at this time. Leave empty to order now.'
                : 'Each restaurant receives its order at this time. Leave empty to order now.'}
            </p>
            <FormError error={scheduleError} />
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
                  Delivery fee{!single && ' (per restaurant)'}
                  <InfoTooltip
                    label="About the delivery fee"
                    content="Set when you place the order. Distance-based pricing adds a per-kilometre amount from the restaurant to your hub, capped at a maximum. Each restaurant in a split order has its own delivery."
                    size={15}
                  />
                </dt>
                <dd className={styles.muted}>
                  {deliveryTotal != null ? (
                    <>
                      {single ? (
                        money(deliveryTotal)
                      ) : (
                        <span className={styles.feeLines}>
                          {fees.map((f) => (
                            <span key={f.restaurantId}>
                              {f.name}: {money(f.fee || 0)}
                            </span>
                          ))}
                        </span>
                      )}
                    </>
                  ) : (
                    'Added at order'
                  )}
                </dd>
              </div>
              {coupon && (
                <div className={styles.row}>
                  <dt>
                    Coupon <strong>{coupon.code}</strong>
                    <button type="button" className={styles.couponRemove} onClick={removeCoupon}>
                      Remove
                    </button>
                  </dt>
                  <dd className={styles.discount}>−{money(coupon.discount)}</dd>
                </div>
              )}
              {creditBalance > 0 && single && (
                <div className={styles.row}>
                  <dt>
                    Use store credit
                    <InfoTooltip label="Store credit" content="Your referral and loyalty credit is applied before paying cash at the hub." size={14} />
                  </dt>
                  <dd className={styles.discount}>
                    <label className={styles.useCreditLabel}>
                      <input
                        type="checkbox"
                        checked={useCredit}
                        onChange={(e) => setUseCredit(e.target.checked)}
                        onMouseDown={(e) => e.preventDefault()}
                      />
                      Apply up to {money(Math.min(creditBalance, grandTotal - discount))}
                    </label>
                  </dd>
                </div>
              )}
              <div className={`${styles.row} ${styles.total}`}>
                <dt>Total</dt>
                <dd>
                  {deliveryTotal != null ? money(grandTotal) : `${money(subtotal - discount)} + fee`}
                </dd>
              </div>
            </dl>

            {single && !coupon && creditBalance === 0 && (
              <div className={styles.couponBox}>
                <Field label="Coupon code" optional>
                  <div className={styles.couponRow}>
                    <Input
                      value={couponCode}
                      maxLength={24}
                      placeholder="e.g. SAVE20"
                      onChange={(e) => {
                        setCouponCode(e.target.value.toUpperCase());
                        setCouponError('');
                      }}
                    />
                    <Button type="button" variant="secondary" loading={couponBusy} onClick={applyCoupon}>
                      Apply
                    </Button>
                  </div>
                </Field>
                <FormError error={couponError} />
              </div>
            )}
            {!single && (
              <p className={styles.optional}>
                Coupons work on single-restaurant orders. Place these separately to use one.
              </p>
            )}

            <div className={styles.payment}>
              <div className={styles.paymentOptions}>
                <label className={styles.paymentOption}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="CASH_ON_COLLECTION"
                    checked={paymentMethod === 'CASH_ON_COLLECTION'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  <Icon name="cash" size={20} />
                  <span>Cash on collection</span>
                </label>
                {pricing.data && (
                  <label className={styles.paymentOption}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="ONLINE_PAYMENT"
                      checked={paymentMethod === 'ONLINE_PAYMENT'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      disabled={!onlinePaymentEnabled}
                    />
                    <Icon name="creditCard" size={20} />
                    <span>Pay online</span>
                    {!onlinePaymentEnabled && (
                      <span className={styles.paymentDisabled}>{single ? 'Not configured' : 'Single-restaurant orders only'}</span>
                    )}
                  </label>
                )}
              </div>
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
