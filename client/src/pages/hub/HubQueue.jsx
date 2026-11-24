import { useState } from 'react';
import { errorMessage } from '../../api/http.js';
import { orderApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
  Table,
  useConfirm,
  useToast,
} from '../../components/ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { dateTime, money, shortId } from '../../utils/format.js';
import styles from './HubQueue.module.css';

const arrivedColumns = [
  {
    key: 'order',
    header: 'Order',
    primary: true,
    render: (o) => <span className={styles.mono}>{shortId(o._id)}</span>,
  },
  {
    key: 'restaurant',
    header: 'Restaurant',
    render: (o) => <span className={styles.muted}>{o.restaurant?.name || '—'}</span>,
  },
  {
    key: 'customer',
    header: 'Customer',
    render: (o) => <span className={styles.muted}>{o.customer?.name || '—'}</span>,
  },
  { key: 'items', header: 'Items', align: 'right', render: (o) => <span className={styles.muted}>{o.items?.length || 0}</span> },
  { key: 'due', header: 'Cash due', align: 'right', render: (o) => <strong>{money(o.total)}</strong> },
  {
    key: 'arrived',
    header: 'Arrived',
    render: (o) => <span className={styles.muted}>{dateTime(o.arrivedAt)}</span>,
  },
  {
    key: 'actions',
    header: 'Actions',
    interactive: true,
    render: (o) => (
      <div className={styles.rowActions}>
        <Button to={`/orders/${o._id}`} size="sm" variant="secondary">
          Details
        </Button>
        <Button to={`/admin/pickup?order=${o._id}`} size="sm" variant="primary" icon="cash">
          Verify pickup
        </Button>
      </div>
    ),
  },
];

const handoverColumns = [
  {
    key: 'order',
    header: 'Order',
    primary: true,
    render: (o) => <span className={styles.mono}>{shortId(o._id)}</span>,
  },
  {
    key: 'restaurant',
    header: 'Restaurant',
    render: (o) => <span className={styles.muted}>{o.restaurant?.name || '—'}</span>,
  },
  { key: 'total', header: 'Collected', align: 'right', render: (o) => <span className={styles.muted}>{money(o.total)}</span> },
  {
    key: 'collected',
    header: 'Handed over',
    render: (o) => <span className={styles.muted}>{dateTime(o.collectedAt)}</span>,
  },
];

/** Hub shift board: what is on the counter, what needs a decision, and what was handed over. */
export default function HubQueue() {
  const waiting = useAsync(() => orderApi.list({ status: 'ARRIVED_AT_HUB', limit: 50 }), []);
  const handovers = useAsync(() => orderApi.list({ status: 'COLLECTED', limit: 8 }), []);
  const exceptions = useAsync(() => orderApi.list({ needsIntervention: 'true', limit: 10 }), []);

  const waitingRows = waiting.data?.items || [];
  const confirm = useConfirm();
  const toast = useToast();
  const [busyId, setBusyId] = useState('');

  const reportNoShow = async (order) => {
    const ok = await confirm({
      title: 'Mark as not collected?',
      message: `${shortId(order._id)} will be closed as a no-show, the cash payment is cancelled and the customer's no-show count goes up. Use this only after the collection window has passed.`,
      confirmLabel: 'Mark no-show',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(order._id);
    try {
      await orderApi.reportNoShow(order._id);
      toast.success('Order closed as not collected.', { title: 'No-show recorded' });
      await Promise.all([waiting.reload(), exceptions.reload()]);
    } catch (err) {
      toast.error(errorMessage(err), { title: 'Couldn’t record the no-show' });
    }
    setBusyId('');
  };

  const columns = [
    ...arrivedColumns,
    {
      key: 'noShow',
      header: '',
      interactive: true,
      render: (o) => (
        <Button size="sm" variant="dangerGhost" loading={busyId === o._id} onClick={() => reportNoShow(o)}>
          No-show
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Hub queue"
        subtitle="Orders waiting at your hub, plus anything that needs a decision."
        hint="Only orders routed to your hub appear here. Verify a pickup with the customer's 6-digit code or their QR code."
      />

      <div className={styles.stats}>
        <Card className={styles.stat}>
          <span className={styles.statValue}>{waitingRows.length}</span>
          <span className={styles.statLabel}>Waiting at the hub</span>
        </Card>
        <Card className={styles.stat}>
          <span className={styles.statValue}>{money(waitingRows.reduce((sum, o) => sum + (o.total || 0), 0))}</span>
          <span className={styles.statLabel}>Cash to collect</span>
        </Card>
        <Card className={styles.stat}>
          <span className={styles.statValue}>{exceptions.data?.items?.length || 0}</span>
          <span className={styles.statLabel}>Need attention</span>
        </Card>
      </div>

      <Card as="section">
        <CardHeader
          title="Waiting at the hub"
          hint="The customer shows a code; verifying it closes the order and records the cash."
          actions={<Button variant="ghost" icon="refresh" onClick={waiting.reload}>Refresh</Button>}
        />
        {waiting.loading && !waiting.data ? (
          <Skeleton height={160} />
        ) : waiting.error ? (
          <ErrorState title="Couldn’t load the queue" error={waiting.error} onRetry={waiting.reload} />
        ) : waitingRows.length === 0 ? (
          <EmptyState icon="inbox" title="Nothing waiting">
            Orders appear here as soon as a drone drops them at your hub.
          </EmptyState>
        ) : (
          <Table columns={columns} rows={waitingRows} rowTo={(o) => `/orders/${o._id}`} caption="Orders waiting at the hub" />
        )}
      </Card>

      {exceptions.data?.items?.length > 0 && (
        <Card as="section">
          <CardHeader title="Needs attention" hint="A drone failed or the order needs a decision from staff." />
          <ul className={styles.list}>
            {exceptions.data.items.map((o) => (
              <li key={o._id}>
                <div className={styles.listText}>
                  <strong>{shortId(o._id)}</strong>
                  <span className={styles.muted}>
                    {o.restaurant?.name || 'Restaurant'} · {o.interventionReason || 'Flagged for staff review'}
                  </span>
                </div>
                <Badge tone="warning">{o.status}</Badge>
                <Button to={`/orders/${o._id}`} size="sm" variant="secondary">
                  Review
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card as="section">
        <CardHeader title="Recently handed over" hint="The last few collections recorded at your hub." />
        {handovers.loading && !handovers.data ? (
          <Skeleton height={130} />
        ) : handovers.data?.items?.length ? (
          <Table
            columns={handoverColumns}
            rows={handovers.data.items}
            rowTo={(o) => `/orders/${o._id}`}
            caption="Recent handovers"
          />
        ) : (
          <EmptyState icon="receipt" title="No handovers yet">
            Verified pickups will be listed here.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
