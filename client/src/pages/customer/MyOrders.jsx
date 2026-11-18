import { useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Alert,
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  Select,
  Skeleton,
  Stars,
  StatusPill,
  Tabs,
  useToast,
} from '../../components/ui/index.js';
import { useOrderList } from '../../hooks/useOrder.js';
import { useReorder } from '../../hooks/useReorder.js';
import { money, plural, shortId, timeAgo } from '../../utils/format.js';
import { isFinalOrder, ORDER_STATUS, statusMeta } from '../../utils/status.js';
import styles from './MyOrders.module.css';

const cx = (...c) => c.filter(Boolean).join(' ');

function OrderCardSkeleton() {
  return (
    <Card className={styles.orderCard}>
      <div className={styles.top}>
        <Skeleton variant="circle" width={42} height={42} />
        <div className={styles.heading}>
          <Skeleton height={16} width="60%" />
          <Skeleton height={12} width="42%" />
        </div>
      </div>
      <Skeleton height={12} width="75%" />
      <Skeleton height={12} width="45%" />
      <div className={styles.foot}>
        <Skeleton height={12} width={90} />
        <Skeleton height={12} width={70} />
      </div>
    </Card>
  );
}

function OrderCard({ order, onReorder, reordering }) {
  const itemCount = (order.items || []).reduce((n, i) => n + (i.removed ? 0 : i.quantity), 0);
  const needsAction = order.status === 'NEEDS_CUSTOMER_CONFIRMATION';
  const ready = order.status === 'ARRIVED_AT_HUB';
  const finished = isFinalOrder(order.status);
  const rating = order.review?.rating;

  return (
    <li className={styles.item}>
      <Card
        to={`/orders/${order._id}`}
        className={cx(styles.orderCard, needsAction && styles.attention, ready && styles.ready, finished && styles.withAction)}
      >
        <span className={styles.top}>
          <Avatar name={order.restaurant?.name} square size={42} />
          <span className={styles.heading}>
            <span className={styles.restaurant}>{order.restaurant?.name || 'Restaurant'}</span>
            <span className={styles.meta}>
              {shortId(order._id)} · {plural(itemCount, 'item')}
            </span>
          </span>
          <StatusPill status={order.status} />
        </span>

        <span className={styles.mid}>
          <span className={styles.hub}>
            <Icon name="mapPin" size={15} />
            {order.hub?.name || 'Pickup hub'}
          </span>
          <span className={styles.total}>{money(order.total)}</span>
        </span>

        {needsAction && (
          <span className={styles.callout}>
            <Icon name="alertTriangle" size={16} />
            <span>Action needed — the restaurant has a question about this order.</span>
          </span>
        )}
        {ready && (
          <span className={cx(styles.callout, styles.calloutSuccess)}>
            <Icon name="checkCircle" size={16} />
            <span>Ready to collect — show your pickup code at {order.hub?.name || 'the hub'}.</span>
          </span>
        )}

        {order.status === 'COLLECTED' && (
          <span className={styles.rating}>
            {rating ? (
              <>
                <Stars value={rating} size={14} /> You rated this order
              </>
            ) : (
              <>
                <Icon name="star" size={15} /> Rate this order
              </>
            )}
          </span>
        )}

        <span className={styles.foot}>
          <span className={styles.placed}>Placed {timeAgo(order.createdAt)}</span>
          <span className={styles.open}>
            View order
            <Icon name="chevronRight" size={16} />
          </span>
        </span>
      </Card>
      {finished && (
        <Button
          size="sm"
          variant="secondary"
          icon="repeat"
          loading={reordering}
          onClick={() => onReorder(order)}
          className={styles.reorder}
        >
          Order again
        </Button>
      )}
    </li>
  );
}

export default function MyOrders() {
  const { orders, loading, error, reload } = useOrderList();
  const toast = useToast();
  const { reorder, busyId } = useReorder();
  const [tab, setTab] = useState('active');
  const [status, setStatus] = useState('');
  const seen = useRef(new Map());

  const counts = useMemo(
    () => ({
      active: orders.filter((o) => !isFinalOrder(o.status)).length,
      past: orders.filter((o) => isFinalOrder(o.status)).length,
      all: orders.length,
    }),
    [orders],
  );

  const attention = orders.filter((o) => o.status === 'NEEDS_CUSTOMER_CONFIRMATION').length;
  const tabs = [
    { value: 'active', label: 'Active', count: counts.active },
    { value: 'past', label: 'Past', count: counts.past },
    { value: 'all', label: 'All', count: counts.all },
  ];

  // Subtle live feedback while the list is open. The order page has the detailed updates.
  useEffect(() => {
    if (loading) return;
    const next = new Map(orders.map((o) => [o._id, o.status]));
    if (seen.current.size === 0) {
      seen.current = next;
      return;
    }
    orders.forEach((o) => {
      const before = seen.current.get(o._id);
      if (!before || before === o.status) return;
      if (o.status === 'NEEDS_CUSTOMER_CONFIRMATION') {
        toast.warning(`${o.restaurant?.name || 'The restaurant'} has a question about ${shortId(o._id)}.`, { title: 'Action needed' });
      } else if (o.status === 'ARRIVED_AT_HUB') {
        toast.success(`Order ${shortId(o._id)} is waiting at ${o.hub?.name || 'the hub'}.`, { title: 'Ready to collect' });
      } else if (o.status === 'IN_FLIGHT') {
        toast.info(`Order ${shortId(o._id)} is on its way to ${o.hub?.name || 'the hub'}.`, { title: 'In flight' });
      } else if (o.status === 'COLLECTED') {
        toast.success(`Order ${shortId(o._id)} was collected. Enjoy your meal!`, { title: 'All done' });
      } else if (o.status === 'CANCELLED' || o.status === 'REJECTED') {
        toast.info(`Order ${shortId(o._id)} is now ${statusMeta('order', o.status).label.toLowerCase()}.`, { title: 'Order closed' });
      }
    });
    seen.current = next;
  }, [orders, loading, toast]);

  const changeStatus = (value) => {
    setStatus(value);
    if (value && tab !== 'all') setTab(isFinalOrder(value) ? 'past' : 'active');
  };

  const shown = orders.filter((o) => {
    if (tab === 'active' && isFinalOrder(o.status)) return false;
    if (tab === 'past' && !isFinalOrder(o.status)) return false;
    return !status || o.status === status;
  });

  const empty = status
    ? {
        icon: 'search',
        title: `No ${statusMeta('order', status).label.toLowerCase()} orders`,
        text: 'Try another status, or clear the filter to see everything.',
        action: (
          <Button variant="secondary" icon="x" onClick={() => setStatus('')}>
            Clear filter
          </Button>
        ),
      }
    : tab === 'past'
      ? {
          icon: 'clock',
          title: 'No past orders yet',
          text: 'Collected, cancelled and rejected orders appear here.',
          action: (
            <Button variant="secondary" onClick={() => setTab('active')}>
              See active orders
            </Button>
          ),
        }
      : {
          icon: 'receipt',
          title: 'No active orders',
          text: 'When you place an order, it shows up here with live tracking and your pickup code.',
          action: (
            <Button variant="primary" to="/" icon="store">
              Browse restaurants
            </Button>
          ),
        };

  return (
    <div className={styles.page}>
      <PageHeader
        title="My orders"
        subtitle={
          attention
            ? attention === 1
              ? '1 order needs your attention.'
              : `${attention} orders need your attention.`
            : 'Track live orders and revisit past ones.'
        }
        actions={
          <Button variant="secondary" to="/" icon="store">
            Browse restaurants
          </Button>
        }
      />

      {loading && orders.length === 0 ? (
        <div className={styles.grid} aria-busy="true" aria-label="Loading your orders">
          {[0, 1, 2, 3].map((i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </div>
      ) : error && orders.length === 0 ? (
        <Card>
          <ErrorState title="We couldn’t load your orders" error={error} onRetry={reload} />
        </Card>
      ) : orders.length === 0 ? (
        <Card>
          <EmptyState
            icon="receipt"
            title="No orders yet"
            action={
              <Button variant="primary" to="/" icon="store">
                Browse restaurants
              </Button>
            }
          >
            When you place an order, it shows up here with live tracking and your pickup code.
          </EmptyState>
        </Card>
      ) : (
        <>
          {error && (
            <Alert
              tone="danger"
              title="Live updates are paused"
              action={
                <Button size="sm" variant="secondary" icon="refresh" onClick={reload}>
                  Retry
                </Button>
              }
            >
              {error}
            </Alert>
          )}

          <Tabs tabs={tabs} value={tab} onChange={setTab} label="Order lists" variant="pills">
            <div className={styles.filters}>
              <span className={styles.count}>{plural(shown.length, 'order')}</span>
              <div className={styles.filter}>
                <label htmlFor="order-status-filter" className="visually-hidden">
                  Filter by status
                </label>
                <Select id="order-status-filter" value={status} onChange={(e) => changeStatus(e.target.value)}>
                  <option value="">All statuses</option>
                  {Object.entries(ORDER_STATUS).map(([value, { label }]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {shown.length === 0 ? (
              <Card>
                <EmptyState icon={empty.icon} title={empty.title} action={empty.action}>
                  {empty.text}
                </EmptyState>
              </Card>
            ) : (
              <ul className={styles.grid}>
                {shown.map((o) => (
                  <OrderCard key={o._id} order={o} onReorder={reorder} reordering={busyId === o._id} />
                ))}
              </ul>
            )}
          </Tabs>
        </>
      )}
    </div>
  );
}
