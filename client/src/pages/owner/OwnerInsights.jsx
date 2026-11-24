import { useState } from 'react';
import { errorCode } from '../../api/http.js';
import { ownerApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Icon,
  Skeleton,
  Stars,
  StatusPill,
  Tabs,
} from '../../components/ui/index.js';
import { useSocketEvent } from '../../context/SocketContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { money } from '../../utils/format.js';
import { ORDER_STATUS } from '../../utils/status.js';
import styles from './OwnerInsights.module.css';

const loadInsights = () =>
  ownerApi.insights().catch((err) => {
    if (errorCode(err) === 'NOT_FOUND') return null;
    throw err;
  });

const dayName = (iso, opts) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, opts);

function Stat({ icon, label, value, hint }) {
  return (
    <Card className={styles.stat}>
      <span className={styles.statIcon}>
        <Icon name={icon} size={18} />
      </span>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
      {hint && <span className={styles.statHint}>{hint}</span>}
    </Card>
  );
}

function SalesChart({ days }) {
  const [metric, setMetric] = useState('revenue');
  const max = Math.max(...days.map((d) => d[metric]), 0);
  const fmt = metric === 'revenue' ? money : (n) => String(n);
  const total = days.reduce((n, d) => n + d[metric], 0);

  return (
    <Card as="section">
      <CardHeader title="Last 14 days" hint="Collected orders only, grouped by the day they were placed." />
      <Tabs
        tabs={[
          { value: 'revenue', label: 'Revenue' },
          { value: 'orders', label: 'Orders' },
        ]}
        value={metric}
        onChange={setMetric}
        label="Chart metric"
        variant="pills"
      >
        <p className={styles.chartTotal}>
          <strong>{fmt(total)}</strong> in the last 14 days
        </p>
        <div className={styles.chart} aria-hidden="true">
          {days.map((d) => (
            <div
              key={d.date}
              className={styles.barCol}
              title={`${dayName(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}: ${fmt(d[metric])}`}
            >
              <div className={styles.barTrack}>
                <div className={styles.bar} style={{ height: `${max ? Math.max((d[metric] / max) * 100, d[metric] ? 3 : 0) : 0}%` }} />
              </div>
              <span className={styles.barLabel}>{dayName(d.date, { day: 'numeric' })}</span>
            </div>
          ))}
        </div>
        <table className="visually-hidden">
          <caption>{metric === 'revenue' ? 'Revenue' : 'Orders'} per day</caption>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <th scope="row">{dayName(d.date, { weekday: 'long', month: 'long', day: 'numeric' })}</th>
                <td>{fmt(d[metric])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tabs>
    </Card>
  );
}

function InsightsSkeleton() {
  return (
    <div className={styles.page} aria-busy="true">
      <PageHeader title="Insights" subtitle="Loading your numbers…" />
      <div className={styles.stats}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={120} />
        ))}
      </div>
      <Skeleton height={280} />
    </div>
  );
}

export default function OwnerInsights() {
  const { data, loading, error, reload } = useAsync(loadInsights, []);
  useSocketEvent('order:updated', reload);

  if (loading && !data) return <InsightsSkeleton />;
  if (error && !data)
    return (
      <Card>
        <ErrorState title="We couldn’t load your insights" error={error} onRetry={reload} />
      </Card>
    );
  if (!data)
    return (
      <Card>
        <EmptyState
          icon="store"
          title="Set up your restaurant first"
          action={
            <Button variant="primary" to="/owner">
              Create restaurant profile
            </Button>
          }
        >
          Insights appear once your restaurant starts taking orders.
        </EmptyState>
      </Card>
    );

  const statuses = Object.keys(ORDER_STATUS).filter((s) => data.ordersByStatus[s]);

  return (
    <div className={styles.page}>
      <PageHeader title="Insights" subtitle="How your restaurant is doing. Revenue counts food sales on collected orders." />

      <section className={styles.stats} aria-label="Key numbers">
        <Stat icon="cash" label="Food revenue" value={money(data.revenue)} hint={`${data.completedOrders} collected orders`} />
        <Stat icon="receipt" label="Average order" value={money(data.averageOrderValue)} hint="Food subtotal per collected order" />
        <Stat icon="clock" label="Orders today" value={data.ordersToday} hint={`${data.totalOrders} orders all time`} />
        <Stat
          icon="checkCircle"
          label="Avg. prep time"
          value={data.prepStats?.averageMinutes == null ? '—' : `${data.prepStats.averageMinutes} min`}
          hint={`From acceptance to ready · ${data.prepStats?.sampleSize || 0} orders timed`}
        />
        <Stat
          icon="checkCircle"
          label="Completion rate"
          value={data.completionRate === null ? '—' : `${data.completionRate}%`}
          hint="Collected vs. cancelled or rejected"
        />
        <Stat
          icon="drone"
          label="Avg. flight time"
          value={data.flightStats?.averageMinutes == null ? '—' : `${data.flightStats.averageMinutes} min`}
          hint={`From dispatch to arrival · ${data.flightStats?.sampleSize || 0} orders timed`}
        />
      </section>

      <SalesChart days={data.days} />

      <div className={styles.split}>
        <Card as="section">
          <CardHeader title="Best sellers" hint="Top dishes by quantity across collected orders." />
          {data.topItems.length === 0 ? (
            <EmptyState compact icon="utensils" title="No sales yet">
              Your best sellers show up after the first collected order.
            </EmptyState>
          ) : (
            <ol className={styles.top}>
              {data.topItems.map((t, i) => (
                <li key={t.menuItem} className={styles.topItem}>
                  <span className={styles.rank}>{i + 1}</span>
                  <span className={styles.topName}>{t.name}</span>
                  <span className={styles.topQty}>{t.quantity} sold</span>
                  <span className={styles.topRevenue}>{money(t.revenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className={styles.side}>
          <Card as="section">
            <CardHeader
              title="Customer rating"
              actions={
                <Button to="/owner/reviews" variant="ghost" size="sm" iconRight="chevronRight">
                  Reviews
                </Button>
              }
            />
            {data.ratingCount ? (
              <div className={styles.rating}>
                <span className={styles.ratingValue}>{data.ratingAvg.toFixed(1)}</span>
                <span className={styles.ratingMeta}>
                  <Stars value={data.ratingAvg} />
                  <span className={styles.muted}>
                    {data.ratingCount} rating{data.ratingCount === 1 ? '' : 's'}
                  </span>
                </span>
              </div>
            ) : (
              <p className={styles.muted}>No reviews yet. Customers can rate an order once they collect it.</p>
            )}
          </Card>
          <Card as="section">
            <CardHeader title="Rating breakdown" hint="How many customers gave each star rating." />
            {data.ratingCount ? (
              <ul className={styles.ratingBreakdown}>
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = (data.ratingDistribution && data.ratingDistribution[String(star)]) || 0;
                  const pct = data.ratingCount ? Math.round((count / data.ratingCount) * 100) : 0;
                  return (
                    <li key={star} className={styles.ratingRow}>
                      <span className={styles.ratingStar}>{star}★</span>
                      <span className={styles.ratingBarWrap}>
                        <span className={styles.ratingBar} style={{ width: `${pct}%` }} />
                      </span>
                      <span className={styles.ratingCount}>{count}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.muted}>No ratings yet.</p>
            )}
          </Card>
          <Card as="section">
            <CardHeader title="Orders by status" />
            {statuses.length === 0 ? (
              <p className={styles.muted}>No orders yet.</p>
            ) : (
              <ul className={styles.statusList}>
                {statuses.map((s) => (
                  <li key={s}>
                    <StatusPill status={s} />
                    <span className={styles.statusCount}>{data.ordersByStatus[s]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
