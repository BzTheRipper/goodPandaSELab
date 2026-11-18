import { useId } from 'react';
import { Badge, Card, Icon } from '../ui/index.js';
import { statusMeta } from '../../utils/status.js';
import OrderTimeline from './OrderTimeline.jsx';
import styles from './OrderJourney.module.css';

const cx = (...c) => c.filter(Boolean).join(' ');

const FAILED = new Set(['CANCELLED', 'REJECTED']);

function statusCopy(order, role = 'customer') {
  const hub = order.hub?.name || 'the pickup hub';
  const restaurant = order.restaurant?.name || 'The restaurant';
  const forCustomer = role === 'customer';

  switch (order.status) {
    case 'PLACED':
      return forCustomer
        ? 'We sent your order to the restaurant. Waiting for them to accept it.'
        : `${forCustomer ? 'Your order' : 'The order'} is waiting for ${restaurant} to accept it.`;
    case 'ACCEPTED':
      return forCustomer
        ? 'The restaurant accepted your order and will start cooking soon.'
        : `${restaurant} accepted the order and will start cooking soon.`;
    case 'PREPARING':
      return forCustomer
        ? 'Your food is being prepared fresh. You can chat or call the restaurant if anything changes.'
        : 'The kitchen is preparing this order. The customer can follow every update live.';
    case 'READY_FOR_DRONE':
      return order.drone ? 'Packed and loaded. The drone is waiting to take off.' : 'Packed and waiting for a drone to be assigned.';
    case 'IN_FLIGHT':
      return forCustomer ? `Your food is in the air on the way to ${hub}.` : `The order is in the air on the way to ${hub}.`;
    case 'ARRIVED_AT_HUB':
      return forCustomer
        ? `Your food is waiting for you at ${hub}. Your pickup code is below.`
        : `The food is waiting at ${hub} for the customer to collect.`;
    case 'COLLECTED':
      return forCustomer ? 'Collected and paid. Enjoy your meal!' : 'Collected and paid. This order is complete.';
    case 'NEEDS_CUSTOMER_CONFIRMATION':
      return forCustomer
        ? 'The restaurant needs a quick decision from you before this order can continue.'
        : 'The order is paused while the customer decides whether to continue or cancel.';
    case 'CANCELLED':
      return 'This order was cancelled and will not be delivered. No payment is due.';
    case 'REJECTED':
      return 'The restaurant declined this order. No payment is due.';
    default:
      return statusMeta('order', order.status).hint || '';
  }
}

const reasonFor = (order) =>
  order.status === 'CANCELLED' ? order.cancellationReason : order.status === 'REJECTED' ? order.rejectionReason : '';

/** The emotional centre of tracking: plain-language status plus the step-by-step journey. */
export default function OrderJourney({ order, flash, role = 'customer' }) {
  const meta = statusMeta('order', order.status);
  const titleId = useId();
  const reason = reasonFor(order);
  const live = Boolean(meta.live);

  return (
    <Card as="section" className={cx(styles.card, flash && styles.flash, flash && styles[meta.tone])} aria-labelledby={titleId}>
      <div className={styles.hero}>
        <span className={cx(styles.iconWrap, styles[meta.tone])}>
          <Icon name={meta.icon || 'receipt'} size={24} />
        </span>
        <div className={styles.heroText}>
          <div className={styles.titleRow}>
            <h2 id={titleId} className={styles.title}>
              {meta.label}
            </h2>
            {live && (
              <Badge tone={meta.tone} live>
                Live
              </Badge>
            )}
            {order.status === 'NEEDS_CUSTOMER_CONFIRMATION' && (
              <Badge tone="warning" dot>
                Action needed
              </Badge>
            )}
          </div>
          <p className={styles.copy}>{statusCopy(order, role)}</p>
          {FAILED.has(order.status) && reason && <p className={styles.reason}>“{reason}”</p>}
        </div>
      </div>

      <div className={styles.divider} />
      <OrderTimeline order={order} />
    </Card>
  );
}
