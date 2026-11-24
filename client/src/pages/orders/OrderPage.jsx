import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/http.js';
import { orderApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import BrowserNotificationsPrompt from '../../components/order/BrowserNotificationsPrompt.jsx';
import ConfirmationBanner from '../../components/order/ConfirmationBanner.jsx';
import DroneFlightPanel from '../../components/order/DroneFlightPanel.jsx';
import OrderChat from '../../components/order/OrderChat.jsx';
import OrderJourney from '../../components/order/OrderJourney.jsx';
import OrderSummaryCard from '../../components/order/OrderSummaryCard.jsx';
import OwnerOrderBrief from '../../components/owner/OwnerOrderBrief.jsx';
import PickupCodeCard from '../../components/order/PickupCodeCard.jsx';
import ReportProblem from '../../components/order/ReportProblem.jsx';
import { Alert, Button, Card, CountBadge, Drawer, ErrorState, PhoneLink, Skeleton, useToast } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useChatUnread } from '../../hooks/useChatUnread.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { useChat, useOrder } from '../../hooks/useOrder.js';
import { dateTime, plural, shortId } from '../../utils/format.js';
import { statusMeta } from '../../utils/status.js';
import AdminActions from './AdminActions.jsx';
import CustomerActions from './CustomerActions.jsx';
import OwnerActions from './OwnerActions.jsx';
import styles from './OrderPage.module.css';

const ACTIONS = { customer: CustomerActions, owner: OwnerActions, admin: AdminActions, hub_operator: AdminActions };

const BACK = {
  customer: { to: '/orders', label: 'My orders' },
  owner: { to: '/owner/orders', label: 'Incoming orders' },
  admin: { to: '/admin/orders', label: 'All orders' },
  hub_operator: { to: '/hub', label: 'Hub queue' },
};

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Unpaid online orders can start (or restart) a Stripe Checkout session from here. */
function OnlinePaymentBanner({ order }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (order.paymentMethod !== 'ONLINE_PAYMENT' || order.paymentStatus !== 'PENDING') return null;

  const pay = async () => {
    setBusy(true);
    try {
      const { url } = await orderApi.paymentLink(order._id);
      if (url) return window.location.assign(url);
      toast.error('Payment is not available right now.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <Alert
      tone="warning"
      title="Payment pending"
      action={
        <Button size="sm" variant="primary" icon="creditCard" loading={busy} onClick={pay}>
          Pay now
        </Button>
      }
    >
      This order is not paid yet. Complete the payment to keep it confirmed.
    </Alert>
  );
}

function OrderSkeleton({ back, withChat }) {
  return (
    <div className={styles.page}>
      <PageHeader title="Order" subtitle="Loading the latest update…" back={back} />
      <div className={styles.layout}>
        <div className={styles.main} aria-busy="true" aria-label="Loading order">
          <Card className={styles.loadCard}>
            <div className={styles.loadRow}>
              <Skeleton variant="circle" width={48} height={48} />
              <div className={styles.loadText}>
                <Skeleton height={22} width="55%" />
                <Skeleton height={14} width="85%" />
              </div>
            </div>
            <Skeleton height={2} />
            <div className={styles.loadSteps}>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} height={14} />
              ))}
            </div>
          </Card>
          <Card>
            <Skeleton height={112} />
          </Card>
          <Card>
            <Skeleton height={168} />
          </Card>
        </div>
        {withChat && (
          <div className={styles.rail}>
            <Card>
              <Skeleton height={420} />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrderPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const desktopChat = useMediaQuery('(min-width: 1200px)');
  const { order, setOrder, loading, error, reload, telemetry } = useOrder(id);
  const chat = useChat(order?._id || id);
  const [chatOpen, setChatOpen] = useState(false);
  const chatUnread = useChatUnread(chat.messages, {
    orderId: order?._id || id,
    userId: user?._id,
    visible: desktopChat || chatOpen,
  });

  const chatAsideRef = useRef(null);
  const lastStatus = useRef({ id: null, status: null });
  const suppressUntil = useRef(0);
  const [flash, setFlash] = useState(false);
  const [params, setParams] = useSearchParams();

  // Stripe sends the customer back here; the webhook does the actual state change.
  useEffect(() => {
    const result = params.get('payment');
    if (!result) return undefined;
    if (result === 'success') {
      toast.info('Payment received — confirming it now. This page updates automatically.', { title: 'Thanks!' });
      const timer = window.setTimeout(() => reload(), 1500);
      const next = new URLSearchParams(params);
      next.delete('payment');
      setParams(next, { replace: true });
      return () => window.clearTimeout(timer);
    }
    if (result === 'cancelled') {
      toast.info('Payment cancelled. You can pay again from this page.');
      const next = new URLSearchParams(params);
      next.delete('payment');
      setParams(next, { replace: true });
    }
    return undefined;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const back = BACK[user?.role] || { to: '/', label: 'Home' };
  const match = order && String(order._id) === String(id);

  /**
   * Local actions already show their own toast. The socket update can reach us a few
   * milliseconds before the HTTP response, so remember a short suppression window instead
   * of a one-shot flag and delay remote toasts just enough to see the local result.
   */
  const applyChange = useCallback(
    (next) => {
      if (next?._id && String(next._id) === String(id)) suppressUntil.current = Date.now() + 2000;
      setOrder(next);
    },
    [id, setOrder],
  );

  useEffect(() => {
    if (!match) return undefined;
    const status = order.status;
    if (lastStatus.current.id !== String(id)) {
      lastStatus.current = { id: String(id), status };
      return undefined;
    }
    if (lastStatus.current.status === status) return undefined;
    lastStatus.current.status = status;
    setFlash(true);
    const flashTimer = window.setTimeout(() => setFlash(false), 1600);

    const meta = statusMeta('order', status);
    const hub = order.hub?.name || 'the hub';
    const TITLES = {
      PLACED: 'Order placed',
      ACCEPTED: 'Order accepted',
      PREPARING: 'Cooking started',
      READY_FOR_DRONE: 'Ready for the drone',
    };

    const announce = () => {
      if (Date.now() < suppressUntil.current) return;
      if (status === 'NEEDS_CUSTOMER_CONFIRMATION') {
        if (user?.role === 'customer') toast.warning('The restaurant needs a decision from you.', { title: 'Action needed' });
        else toast.info('The order is waiting for the customer to confirm.', { title: 'Customer decision needed' });
      } else if (status === 'ARRIVED_AT_HUB') {
        toast.success(
          user?.role === 'customer'
            ? `Your food is waiting at ${hub}. Your pickup code is below.`
            : `Order ${shortId(order._id)} arrived at ${hub}.`,
          { title: 'Ready to collect' },
        );
      } else if (status === 'IN_FLIGHT') {
        toast.info(
          user?.role === 'customer' ? `A drone is flying your order to ${hub}.` : `Order ${shortId(order._id)} is flying to ${hub}.`,
          { title: 'In flight' },
        );
      } else if (status === 'COLLECTED') {
        toast.success(user?.role === 'customer' ? 'Collected and paid. Enjoy your meal!' : 'Order collected and paid.', {
          title: 'All done',
        });
      } else if (status === 'CANCELLED' || status === 'REJECTED') {
        toast.info(`This order is now ${meta.label.toLowerCase()}.`, { title: 'Order closed' });
      } else {
        const message =
          user?.role === 'customer'
            ? {
                ACCEPTED: `${order.restaurant?.name || 'The restaurant'} accepted your order.`,
                PREPARING: 'Your food is being prepared now.',
                READY_FOR_DRONE: 'Your order is packed and waiting for a drone.',
              }[status] || `Order is now ${meta.label.toLowerCase()}.`
            : `Order ${shortId(order._id)} is now ${meta.label.toLowerCase()}.`;
        toast.info(message, { title: TITLES[status] || meta.label });
      }
    };
    const toastTimer = window.setTimeout(announce, 450);

    return () => {
      window.clearTimeout(flashTimer);
      window.clearTimeout(toastTimer);
    };
  }, [order?.status, match, id, user?.role, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const openChat = useCallback(() => {
    if (!desktopChat) {
      setChatOpen(true);
      return;
    }
    chatAsideRef.current?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
    document.getElementById('chat-message')?.focus({ preventScroll: true });
  }, [desktopChat]);

  if (!match && loading) return <OrderSkeleton back={back} withChat={desktopChat} />;

  if (!match) {
    return (
      <div className={styles.page}>
        <PageHeader title="Order" back={back} />
        <Card>
          <ErrorState
            title="We couldn’t load this order"
            error={error || 'This order isn’t available any more.'}
            onRetry={reload}
            action={
              <Button variant="secondary" to={back.to}>
                Back to {back.label.toLowerCase()}
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const Actions = ACTIONS[user?.role] || (() => null);
  const itemCount = order.items.reduce((n, i) => n + (i.removed ? 0 : i.quantity), 0);
  const scheduledForLater =
    order.status === 'PLACED' && order.scheduledFor && new Date(order.scheduledFor).getTime() > Date.now();
  const contact =
    user?.role === 'customer'
      ? { phone: order.restaurant?.phone, label: 'restaurant' }
      : { phone: order.customer?.phone, label: 'customer' };

  return (
    <div className={styles.page}>
      <PageHeader
        back={back}
        title={`Order ${shortId(order._id)}`}
        subtitle={`${order.restaurant?.name || 'Restaurant'} → ${order.hub?.name || 'Hub'} · ${plural(itemCount, 'item')} · placed ${dateTime(order.createdAt)}${order.checkoutGroup ? ' · part of a multi-restaurant order' : ''}`}
        actions={
          <>
            {contact.phone && <PhoneLink label={contact.label} hideNumber phone={contact.phone} className={styles.callLink} />}
            {!desktopChat && (
              <Button variant="secondary" icon="message" onClick={() => setChatOpen(true)} aria-haspopup="dialog">
                Chat
                <CountBadge count={chatUnread} tone="brand" />
              </Button>
            )}
          </>
        }
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          {scheduledForLater && (
            <Alert tone="info" title="Scheduled order">
              This order is held until {dateTime(order.scheduledFor)}. The restaurant receives it then, so it is
              freshly made when you collect it.
            </Alert>
          )}
          {user?.role === 'customer' && <OnlinePaymentBanner order={order} />}
          <OrderJourney order={order} flash={flash} role={user?.role} />

          {user?.role === 'customer' && (
            <ConfirmationBanner order={order} onChange={applyChange} onChat={openChat} chatUnread={chatUnread} />
          )}

          {user?.role === 'customer' && <PickupCodeCard order={order} onRefresh={reload} />}

          {user?.role === 'customer' && <ReportProblem order={order} />}

          {user?.role === 'customer' && order.status === 'IN_FLIGHT' && <BrowserNotificationsPrompt />}

          <DroneFlightPanel order={order} telemetry={telemetry} role={user?.role} />

          <Actions order={order} onChange={applyChange} onChat={openChat} />

          {user?.role === 'owner' ? <OwnerOrderBrief order={order} /> : <OrderSummaryCard order={order} />}
        </div>

        {desktopChat && (
          <aside ref={chatAsideRef} className={styles.rail} aria-label="Order chat">
            <OrderChat order={order} user={user} chat={chat} mode="card" visible={desktopChat} unread={0} />
          </aside>
        )}
      </div>

      {!desktopChat && (
        <Drawer open={chatOpen} onClose={() => setChatOpen(false)} title="Order chat" side="right" size="md">
          <OrderChat order={order} user={user} chat={chat} mode="sheet" visible={chatOpen} unread={chatUnread} />
        </Drawer>
      )}
    </div>
  );
}
