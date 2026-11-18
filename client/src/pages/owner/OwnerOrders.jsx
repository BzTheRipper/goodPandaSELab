import { useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader.jsx';
import OwnerOrderCard from '../../components/owner/OwnerOrderCard.jsx';
import { Badge, Button, EmptyState, ErrorState, InfoTooltip, Skeleton, useToast } from '../../components/ui/index.js';
import { useOrderList } from '../../hooks/useOrder.js';
import { shortId } from '../../utils/format.js';
import styles from './OwnerOrders.module.css';

const GROUPS = [
  {
    id: 'new',
    label: 'New',
    statuses: ['PLACED'],
    hint: 'Just placed by a customer. Accept it or reject it with a reason.',
  },
  {
    id: 'progress',
    label: 'In progress',
    statuses: ['ACCEPTED', 'PREPARING'],
    hint: 'The kitchen is working on these. You can update the status or ask the customer to confirm a change.',
  },
  {
    id: 'waiting',
    label: 'Waiting for customer',
    statuses: ['NEEDS_CUSTOMER_CONFIRMATION'],
    hint: 'The order is paused until the customer chooses to continue or cancel.',
  },
  {
    id: 'drone',
    label: 'Ready / Drone',
    statuses: ['READY_FOR_DRONE', 'IN_FLIGHT', 'ARRIVED_AT_HUB'],
    hint: 'Packed, in the air, or landed at the hub. Load and dispatch from the order page.',
  },
  {
    id: 'done',
    label: 'Completed',
    statuses: ['COLLECTED', 'CANCELLED', 'REJECTED'],
    hint: 'Finished orders, including those that were cancelled or rejected.',
  },
];

function BoardSkeleton() {
  return (
    <div className={styles.groups} aria-busy="true" aria-label="Loading orders">
      {[0, 1].map((g) => (
        <section key={g} className={styles.group}>
          <Skeleton width={160} height={20} />
          <div className={styles.grid}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={260} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Live board grouped by where each order currently sits. */
export default function OwnerOrders() {
  const { orders, loading, error, reload } = useOrderList();
  const toast = useToast();
  const [justArrived, setJustArrived] = useState(() => new Set());
  const [overrides, setOverrides] = useState({});
  const seen = useRef(null);
  const timers = useRef([]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  useEffect(() => {
    if (loading) return;
    const ids = orders.map((o) => String(o._id));
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const fresh = orders.filter((o) => !seen.current.has(String(o._id)));
    seen.current = new Set(ids);
    if (!fresh.length) return;

    setJustArrived((prev) => new Set([...prev, ...fresh.map((o) => String(o._id))]));
    fresh.forEach((o) => toast.info(`${shortId(o._id)} from ${o.customer?.name || 'a customer'} is waiting.`, { title: 'New order' }));
    const timer = window.setTimeout(() => {
      setJustArrived((prev) => {
        const next = new Set(prev);
        fresh.forEach((o) => next.delete(String(o._id)));
        return next;
      });
    }, 8000);
    timers.current.push(timer);
  }, [orders, loading, toast]);

  const merged = useMemo(
    () =>
      orders.map((o) => {
        const local = overrides[String(o._id)];
        return local && new Date(local.updatedAt) >= new Date(o.updatedAt) ? local : o;
      }),
    [orders, overrides],
  );

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        items: merged.filter((o) => group.statuses.includes(o.status)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      })).filter((group) => group.items.length > 0),
    [merged],
  );

  const newCount = merged.filter((o) => o.status === 'PLACED').length;
  const onChange = (updated) => setOverrides((prev) => ({ ...prev, [String(updated._id)]: updated }));

  return (
    <div className={styles.page}>
      <PageHeader
        title="Incoming orders"
        subtitle="Live updates from every customer order at your restaurant."
        hint="Orders move between groups as their status changes. New orders are highlighted until you act on them."
        badge={
          newCount > 0 ? (
            <Badge tone="brand" dot>
              {newCount} new
            </Badge>
          ) : null
        }
      />

      {loading && <BoardSkeleton />}

      {!loading && error && (
        <ErrorState
          title="We couldn’t load your orders"
          error={error}
          onRetry={reload}
          action={
            <Button variant="secondary" to="/owner">
              Go to restaurant profile
            </Button>
          }
        />
      )}

      {!loading && !error && merged.length === 0 && (
        <EmptyState
          icon="inbox"
          title="No orders yet"
          action={
            <Button variant="secondary" to="/owner/menu">
              Review your menu
            </Button>
          }
        >
          When a customer places an order, it appears here straight away.
        </EmptyState>
      )}

      {!loading && !error && merged.length > 0 && (
        <div className={styles.groups}>
          {grouped.map((group) => (
            <section key={group.id} className={styles.group} aria-labelledby={`group-${group.id}`}>
              <div className={styles.groupHead}>
                <h2 id={`group-${group.id}`} className={styles.groupTitle}>
                  {group.label}
                  <span className={styles.count}>{group.items.length}</span>
                </h2>
                <InfoTooltip content={group.hint} label={`About ${group.label.toLowerCase()} orders`} size={15} />
              </div>
              <div className={styles.grid}>
                {group.items.map((order) => (
                  <OwnerOrderCard key={order._id} order={order} onChange={onChange} justArrived={justArrived.has(String(order._id))} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
