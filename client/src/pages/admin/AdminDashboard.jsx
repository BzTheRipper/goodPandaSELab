import { Link } from 'react-router-dom';
import { adminApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { Button, Card, CardHeader, EmptyState, ErrorState, FormError, Icon, StatusPill } from '../../components/ui/index.js';
import { useSocketEvent } from '../../context/SocketContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useOrderList } from '../../hooks/useOrder.js';
import { dateTime, money, shortId } from '../../utils/format.js';
import { DRONE_STATUS, ORDER_STATUS, statusMeta } from '../../utils/status.js';
import { AdminError, AdminListSkeleton } from './AdminShared.jsx';
import styles from './Admin.module.css';

const DRONE_KEYS = Object.keys(DRONE_STATUS);
const ORDER_KEYS = Object.keys(ORDER_STATUS);

function StatCard({ to, icon, value, label, hint, danger, money: isMoney }) {
  return (
    <Card to={to} className={styles.statCard}>
      <div className={styles.statTop}>
        <span className={styles.statIcon}>
          <Icon name={icon} size={20} />
        </span>
      </div>
      <div className={`${styles.statValue} ${danger ? styles.statValueDanger : ''} ${isMoney ? styles.statValueMoney : ''}`}>
        {value ?? 0}
      </div>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statHint}>{hint}</div>
    </Card>
  );
}

export default function AdminDashboard() {
  const { data, loading, error, reload } = useAsync(() => adminApi.dashboard(), []);
  const { orders, loading: ordersLoading, error: ordersError, reload: reloadOrders } = useOrderList({}, { pageSize: 5 });

  useSocketEvent('order:updated', reload);
  useSocketEvent('drone:updated', reload);

  if (loading && !data) return <AdminListSkeleton rows={6} />;
  if (error && !data) return <AdminError error={error} onRetry={reload} />;

  const counts = data?.ordersByStatus || {};
  const totalOrders = ORDER_KEYS.reduce((n, key) => n + (counts[key] || 0), 0);
  const recent = orders.slice(0, 5);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Dashboard"
        subtitle="A live snapshot of orders, approvals and the drone fleet."
        hint="Counts refresh automatically when an order or drone changes. Open a metric to see the filtered list."
        actions={
          <Button to="/admin/pickup" variant="primary" icon="cash">
            Verify pickup
          </Button>
        }
      />

      <FormError error={error} />

      <section className={styles.statsGrid} aria-label="Key metrics">
        <StatCard
          to="/admin/orders"
          icon="receipt"
          value={totalOrders}
          label="Orders tracked"
          hint="All orders still stored in the platform"
        />
        <StatCard
          to="/admin/drones"
          icon="drone"
          value={data?.activeDrones ?? 0}
          label="Active drones"
          hint="Loaded or in flight right now"
        />
        <StatCard
          to="/admin/restaurants?status=PENDING"
          icon="store"
          value={data?.pendingRestaurants ?? 0}
          label="Pending approvals"
          hint="Restaurants waiting to go public"
        />
        <StatCard
          to="/admin/orders?needsIntervention=true"
          icon="alertTriangle"
          value={data?.ordersNeedingIntervention ?? 0}
          label="Needs intervention"
          hint="Drone failures that need a decision"
          danger={Boolean(data?.ordersNeedingIntervention)}
        />
        <StatCard
          to="/admin/orders?status=COLLECTED"
          icon="cash"
          value={money(data?.grossSales)}
          label="Gross sales"
          hint="Food and delivery paid on collected orders"
          money
        />
        <StatCard
          to="/admin/settings"
          icon="drone"
          value={money(data?.deliveryFeeRevenue)}
          label="Delivery fee revenue"
          hint="GoodPanda's share from delivery fees"
          money
        />
      </section>

      <div className={styles.split}>
        <div className={styles.sectionStack}>
          <Card as="section">
            <CardHeader title="Orders by status" hint="Choose a status to open its filtered order list." />
            <div className={styles.statusGrid}>
              {ORDER_KEYS.map((status) => (
                <Link key={status} to={`/admin/orders?status=${status}`} className={styles.statusChip}>
                  <StatusPill status={status} />
                  <span className={styles.statusCount}>{counts[status] || 0}</span>
                </Link>
              ))}
            </div>
          </Card>

          <Card as="section">
            <CardHeader
              title="Recent orders"
              hint="The five newest orders, updated live."
              actions={
                <Button to="/admin/orders" variant="ghost" size="sm" iconRight="chevronRight">
                  All orders
                </Button>
              }
            />
            {ordersLoading && orders.length === 0 ? (
              <AdminListSkeleton rows={5} />
            ) : ordersError && orders.length === 0 ? (
              <ErrorState compact title="Couldn’t load recent orders" error={ordersError} onRetry={reloadOrders} />
            ) : recent.length === 0 ? (
              <EmptyState compact icon="receipt" title="No orders yet">
                New orders appear here as customers place them.
              </EmptyState>
            ) : (
              <div className={styles.recentList}>
                {recent.map((order) => (
                  <div key={order._id} className={styles.recentRow}>
                    <div className={styles.recentMain}>
                      <Link to={`/orders/${order._id}`} className={styles.recentTitle}>
                        <span>{shortId(order._id)}</span>
                        <StatusPill status={order.status} />
                        {order.needsAdminIntervention && <span className={styles.attention}>Needs help</span>}
                      </Link>
                      <div className={styles.recentMeta}>
                        {order.restaurant?.name || 'Restaurant'} → {order.hub?.name || 'Hub'} · {dateTime(order.createdAt)}
                      </div>
                    </div>
                    <div className={styles.recentTotal}>{money(order.total)}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className={styles.sectionStack}>
          <Card as="section">
            <CardHeader title="Fleet at a glance" hint="Live drone counts from the last fleet update." />
            <div className={styles.fleetSummary}>
              {DRONE_KEYS.map((status) => {
                const meta = statusMeta('drone', status);
                return (
                  <div key={status} className={styles.fleetStat}>
                    <span>{meta.label}</span>
                    <strong>{data?.dronesByStatus?.[status] || 0}</strong>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card as="section">
            <CardHeader title="Quick actions" hint="Shortcuts to the tasks admins do most often." />
            <div className={styles.actionsCell}>
              <Button to="/admin/restaurants?status=PENDING" icon="store" size="sm">
                Review approvals
              </Button>
              <Button to="/admin/orders?needsIntervention=true" icon="alertTriangle" size="sm">
                Resolve flagged orders
              </Button>
              <Button to="/admin/pickup" icon="cash" size="sm">
                Verify a pickup
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
