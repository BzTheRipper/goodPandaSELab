import { orderApi } from '../../api/index.js';
import ReasonButton from '../ReasonButton.jsx';
import { Badge, Button, Card, FormError, Icon, StatusPill, useToast } from '../ui/index.js';
import { RequestChangeButton } from './ConfirmationRequest.jsx';
import { useAction } from '../../hooks/useAsync.js';
import { dateTime, money, shortId, timeAgo } from '../../utils/format.js';
import { statusMeta } from '../../utils/status.js';
import styles from './OwnerOrderCard.module.css';

const cx = (...c) => c.filter(Boolean).join(' ');

const NEXT = {
  PLACED: { status: 'ACCEPTED', label: 'Accept', icon: 'check', toast: 'Order accepted.' },
  ACCEPTED: { status: 'PREPARING', label: 'Start preparing', icon: 'utensils', toast: 'The customer can see that cooking started.' },
  PREPARING: { status: 'READY_FOR_DRONE', label: 'Mark ready', icon: 'drone', toast: 'Marked ready. Load it onto a drone next.' },
};

/** One order on the live board. Only the actions valid for its current status are rendered. */
export default function OwnerOrderCard({ order, onChange, justArrived = false }) {
  const toast = useToast();
  const { busy, error, run } = useAction();
  const next = NEXT[order.status];
  const details = `/orders/${order._id}`;
  const items = (order.items || []).filter((i) => !i.removed);
  const visibleItems = items.slice(0, 3);
  const extra = items.length - visibleItems.length;

  const advance = async () => {
    const updated = await run(() => orderApi.setStatus(order._id, next.status));
    if (updated) {
      onChange(updated);
      toast.success(next.toast);
    }
  };

  const reject = async (reason) => {
    const updated = await orderApi.setStatus(order._id, 'REJECTED', reason);
    onChange(updated);
    toast.info('Order rejected. The customer has been told.', { title: 'Order updated' });
  };

  return (
    <Card
      as="article"
      className={cx(styles.card, order.status === 'PLACED' && styles.newCard, justArrived && styles.justArrived)}
      aria-label={`Order ${shortId(order._id)}`}
    >
      <div className={styles.top}>
        <div className={styles.heading}>
          <span className={styles.id}>{shortId(order._id)}</span>
          <span className={styles.customer}>
            <Icon name="user" size={13} />
            {order.customer?.name || 'Customer'}
          </span>
        </div>
        <div className={styles.pills}>
          {order.status === 'PLACED' && (
            <Badge tone="brand" dot>
              New
            </Badge>
          )}
          <StatusPill kind="order" status={order.status} />
        </div>
      </div>

      <div className={styles.timeRow}>
        <Icon name="clock" size={13} />
        <time dateTime={order.createdAt} title={dateTime(order.createdAt)}>
          {timeAgo(order.createdAt)}
        </time>
      </div>

      <ul className={styles.items}>
        {visibleItems.map((item) => (
          <li key={item._id}>
            <span className={styles.qty}>{item.quantity}×</span>
            <span className={styles.itemName}>{item.name}</span>
            {item.note && (
              <span className={styles.itemNote}>
                <Icon name="message" size={11} />
                {item.note}
              </span>
            )}
          </li>
        ))}
        {extra > 0 && <li className={styles.more}>+ {extra} more</li>}
      </ul>

      {order.customerNote ? (
        <div className={styles.note}>
          <span className={styles.noteLabel}>
            <Icon name="message" size={13} />
            Customer note
          </span>
          <p>“{order.customerNote}”</p>
        </div>
      ) : (
        <p className={styles.noNote}>No note from the customer</p>
      )}

      <div className={styles.metaRow}>
        <span className={styles.hub}>
          <Icon name="mapPin" size={14} />
          {order.hub?.name || 'Hub'}
        </span>
        <strong className={styles.total}>{money(order.total)}</strong>
      </div>

      {order.status === 'NEEDS_CUSTOMER_CONFIRMATION' && (
        <p className={styles.waiting}>
          <Icon name="alertTriangle" size={14} />
          Waiting for the customer’s decision.
        </p>
      )}

      {order.drone && ['READY_FOR_DRONE', 'IN_FLIGHT', 'ARRIVED_AT_HUB'].includes(order.status) && (
        <p className={styles.drone}>
          <Icon name="drone" size={14} />
          {order.drone.identifier} · {statusMeta('drone', order.drone.status).label}
        </p>
      )}

      <div className={styles.actions}>
        {next && (
          <Button size="sm" variant="primary" icon={next.icon} loading={busy} onClick={advance}>
            {next.label}
          </Button>
        )}
        {order.status === 'PLACED' && (
          <ReasonButton
            label="Reject"
            size="sm"
            title="Reject this order?"
            description="The customer is told immediately. If the order could still go ahead with changes, use a confirmation request instead."
            placeholder="e.g. We’re closing early tonight because of a kitchen issue."
            confirmLabel="Reject order"
            onConfirm={reject}
          />
        )}
        {['ACCEPTED', 'PREPARING'].includes(order.status) && <RequestChangeButton order={order} onChange={onChange} />}
        {order.status === 'READY_FOR_DRONE' && (
          <Button size="sm" variant="secondary" icon="drone" to={details}>
            {order.drone ? 'Dispatch drone' : 'Load drone'}
          </Button>
        )}
        {['PLACED', 'ACCEPTED', 'PREPARING', 'NEEDS_CUSTOMER_CONFIRMATION'].includes(order.status) && (
          <Button size="sm" variant="ghost" iconRight="chevronRight" to={details}>
            Open
          </Button>
        )}
        {['IN_FLIGHT', 'ARRIVED_AT_HUB', 'COLLECTED', 'CANCELLED', 'REJECTED'].includes(order.status) && (
          <Button size="sm" variant="ghost" iconRight="chevronRight" to={details}>
            View
          </Button>
        )}
      </div>

      <FormError error={error} />
    </Card>
  );
}
