import { useState } from 'react';
import { Badge, Icon, InfoTooltip, StatusPill } from '../ui/index.js';
import { money, plural } from '../../utils/format.js';
import styles from './OrderSummaryCard.module.css';

const cx = (...c) => c.filter(Boolean).join(' ');

/** Compact, collapsible receipt. Open on desktop, tucked away on phones. */
export default function OrderSummaryCard({ order }) {
  const [open, setOpen] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia('(min-width: 768px)').matches));
  const activeItems = order.items.filter((i) => !i.removed);
  const itemCount = activeItems.reduce((n, i) => n + i.quantity, 0);
  const payment = order.paymentMethod === 'CASH_ON_COLLECTION' ? 'Cash on collection' : 'Payment at collection';

  return (
    <details className={styles.details} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={styles.summary}>
        <span className={styles.summaryIcon} aria-hidden="true">
          <Icon name="receipt" size={18} />
        </span>
        <span className={styles.summaryText}>
          <span className={styles.summaryTitle}>Order summary</span>
          <span className={styles.summarySub}>
            {plural(itemCount, 'item')} · {order.restaurant?.name}
          </span>
        </span>
        <span className={styles.summaryTotal}>{money(order.total)}</span>
        <Icon name="chevronDown" size={18} className={styles.chevron} />
      </summary>

      <div className={styles.body}>
        <ul className={styles.items}>
          {order.items.map((item) => (
            <li key={item._id} className={cx(styles.item, item.removed && styles.removed)}>
              <span className={styles.qty} aria-label={`${item.quantity} ×`}>
                {item.quantity}×
              </span>
              <div className={styles.itemText}>
                <span className={styles.itemName}>{item.name}</span>
                {item.note && (
                  <span className={styles.itemNote}>
                    <Icon name="message" size={12} />
                    {item.note}
                  </span>
                )}
                <span className={styles.itemFlags}>
                  {item.removed && <Badge tone="neutral">Removed</Badge>}
                  {!item.removed && item.unavailable && <Badge tone="warning">Unavailable</Badge>}
                </span>
              </div>
              <span className={styles.linePrice}>{money(item.price * item.quantity)}</span>
            </li>
          ))}
        </ul>

        {order.customerNote && (
          <div className={styles.note}>
            <span className={styles.noteLabel}>
              <Icon name="message" size={14} />
              Note for the restaurant
            </span>
            <p>{order.customerNote}</p>
          </div>
        )}

        <dl className={styles.totals}>
          <div className={styles.totalRow}>
            <dt>Subtotal</dt>
            <dd>{money(order.subtotal)}</dd>
          </div>
          <div className={styles.totalRow}>
            <dt className={styles.withTip}>
              Drone delivery fee
              <InfoTooltip
                label="About the delivery fee"
                content="The flat fee GoodPanda charges for flying your order from the restaurant to the hub."
                size={14}
              />
            </dt>
            <dd>{money(order.deliveryFee)}</dd>
          </div>
          <div className={cx(styles.totalRow, styles.grandTotal)}>
            <dt>Total</dt>
            <dd>{money(order.total)}</dd>
          </div>
          <div className={cx(styles.totalRow, styles.paymentRow)}>
            <dt>Payment</dt>
            <dd className={styles.paymentValue}>
              <span>{payment}</span>
              <StatusPill kind="payment" status={order.paymentStatus} />
            </dd>
          </div>
        </dl>

        <div className={styles.hub}>
          <span className={styles.hubIcon}>
            <Icon name="mapPin" size={17} />
          </span>
          <div className={styles.hubText}>
            <span className={styles.hubKicker}>Collect from</span>
            <span className={styles.hubName}>{order.hub?.name}</span>
            <span className={styles.hubAddress}>{order.hub?.address}</span>
          </div>
          <InfoTooltip
            label="About the pickup hub"
            content="Drones land at hubs, not at your door. Collect your food at this hub with the pickup code shown on this page."
            size={15}
          />
        </div>
      </div>
    </details>
  );
}
