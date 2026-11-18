import { Badge, Card, CardHeader, Icon, InfoTooltip, StatusPill } from '../ui/index.js';
import { dateTime, money, plural } from '../../utils/format.js';
import styles from './OwnerOrderBrief.module.css';

const cx = (...c) => c.filter(Boolean).join(' ');

/** The kitchen's at-a-glance ticket: what to cook, the customer's note, and where it goes. */
export default function OwnerOrderBrief({ order }) {
  const items = order.items || [];
  const active = items.filter((i) => !i.removed);
  const count = active.reduce((n, i) => n + i.quantity, 0);
  const payment = order.paymentMethod === 'CASH_ON_COLLECTION' ? 'Cash on collection' : 'Payment at collection';

  return (
    <Card as="section" className={styles.card}>
      <CardHeader
        title="Order ticket"
        hint="Everything the kitchen needs to prepare this order. The customer’s note is highlighted because it is easy to miss."
        actions={<Badge tone="neutral">{plural(count, 'item')}</Badge>}
      />

      {order.customerNote ? (
        <div className={styles.note}>
          <span className={styles.noteLabel}>
            <Icon name="message" size={15} />
            Customer note
            <InfoTooltip
              label="Why this note is highlighted"
              content="Special requests and delivery instructions are easy to overlook. Read this before you start cooking."
              size={14}
            />
          </span>
          <blockquote>“{order.customerNote}”</blockquote>
        </div>
      ) : (
        <p className={styles.noNote}>
          <Icon name="info" size={15} />
          No special note from the customer.
        </p>
      )}

      <ul className={styles.items}>
        {items.map((item) => (
          <li key={item._id} className={cx(styles.item, item.removed && styles.removed)}>
            <span className={styles.qty}>{item.quantity}×</span>
            <div className={styles.itemText}>
              <span className={styles.name}>{item.name}</span>
              {item.note && (
                <span className={styles.itemNote}>
                  <Icon name="message" size={12} />
                  {item.note}
                </span>
              )}
              <span className={styles.flags}>
                {item.removed && <Badge tone="neutral">Removed</Badge>}
                {!item.removed && item.unavailable && <Badge tone="warning">Unavailable</Badge>}
              </span>
            </div>
            <span className={styles.lineTotal}>{money(item.price * item.quantity)}</span>
          </li>
        ))}
      </ul>

      <div className={styles.foot}>
        <dl className={styles.totals}>
          <div>
            <dt>Subtotal</dt>
            <dd>{money(order.subtotal)}</dd>
          </div>
          <div>
            <dt>Delivery fee</dt>
            <dd>{money(order.deliveryFee)}</dd>
          </div>
          <div className={styles.grand}>
            <dt>Total</dt>
            <dd>{money(order.total)}</dd>
          </div>
          <div>
            <dt>Payment</dt>
            <dd className={styles.payment}>
              <span>{payment}</span>
              <StatusPill kind="payment" status={order.paymentStatus} />
            </dd>
          </div>
        </dl>

        <div className={styles.hub}>
          <span className={styles.hubIcon} aria-hidden="true">
            <Icon name="mapPin" size={18} />
          </span>
          <div>
            <span className={styles.kicker}>Drone lands at</span>
            <strong>{order.hub?.name || 'Pickup hub'}</strong>
            <span className={styles.address}>{order.hub?.address}</span>
          </div>
          <InfoTooltip
            label="About the pickup hub"
            content="The drone lands here, not at the customer’s door. The customer shows a code to the hub operator and pays in cash."
            size={14}
          />
        </div>
      </div>

      <p className={styles.placed}>
        <Icon name="clock" size={14} />
        Placed {dateTime(order.createdAt)}
      </p>
    </Card>
  );
}
