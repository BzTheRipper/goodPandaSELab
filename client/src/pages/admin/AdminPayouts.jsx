import { useState } from 'react';
import { adminApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Badge,
  Button,
  Card,
  Field,
  Select,
  Table,
  useConfirm,
  useToast,
} from '../../components/ui/index.js';
import { useAction, useAsync } from '../../hooks/useAsync.js';
import { dateTime, money, shortId } from '../../utils/format.js';
import { AdminContent, AdminEmpty } from './AdminShared.jsx';
import admin from './Admin.module.css';
import styles from './AdminPayouts.module.css';

const STATUS_OPTIONS = [
  ['PENDING', 'Pending'],
  ['PAID', 'Paid'],
  ['VOID', 'Void'],
  ['', 'All payouts'],
];

const tone = (status) => (status === 'PAID' ? 'success' : status === 'PENDING' ? 'warning' : 'neutral');

/** Cash the platform owes each restaurant, settled one order at a time. */
export default function AdminPayouts() {
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(
    () => adminApi.payouts({ status: status || undefined, page, limit: 25 }),
    [status, page]
  );
  const { busy, run } = useAction();
  const toast = useToast();
  const confirm = useConfirm();

  const items = data?.items || [];
  const pendingTotal = data?.pendingTotal || 0;
  const pages = data?.pages || 1;

  const markPaid = async (order) => {
    const ok = await confirm({
      title: 'Mark this payout as paid?',
      message: `Record ${money(order.payoutAmount)} paid to ${order.restaurant?.name || 'the restaurant'} for order ${shortId(order._id)}. This cannot be undone from here.`,
      confirmLabel: 'Mark paid',
      tone: 'primary',
    });
    if (!ok) return;
    const updated = await run(() => adminApi.markPayoutPaid(order._id));
    if (updated) {
      toast.success('Payout marked paid.', { title: 'Ledger updated' });
      await reload();
    }
  };

  const columns = [
    {
      key: 'order',
      header: 'Order',
      primary: true,
      render: (o) => <span className={admin.cellTitle}>{shortId(o._id)}</span>,
    },
    {
      key: 'restaurant',
      header: 'Restaurant',
      render: (o) => <span className={admin.cellMuted}>{o.restaurant?.name || '—'}</span>,
    },
    {
      key: 'collected',
      header: 'Collected',
      render: (o) => <span className={admin.cellMuted}>{dateTime(o.collectedAt)}</span>,
    },
    {
      key: 'gross',
      header: 'Food total',
      align: 'right',
      render: (o) => <span className={admin.cellMuted}>{money(o.subtotal)}</span>,
    },
    {
      key: 'commission',
      header: 'Platform fee',
      align: 'right',
      render: (o) => <span className={admin.cellMuted}>−{money(o.commissionAmount)}</span>,
    },
    {
      key: 'payout',
      header: 'Payout',
      align: 'right',
      render: (o) => <span className={admin.recentTotal}>{money(o.payoutAmount)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => <Badge tone={tone(o.payoutStatus)}>{o.payoutStatus}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      interactive: true,
      render: (o) => (
        <div className={admin.actionsCell}>
          <Button to={`/orders/${o._id}`} size="sm" variant="secondary">
            Details
          </Button>
          {o.payoutStatus === 'PENDING' && (
            <Button size="sm" variant="primary" icon="cash" loading={busy} onClick={() => markPaid(o)}>
              Mark paid
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className={admin.page}>
      <PageHeader
        title="Payouts"
        subtitle="What the platform owes restaurants for collected orders."
        hint="Only collected orders appear here. The platform fee is already deducted; marking a payout paid records the transfer and writes an audit entry."
      />

      <div className={styles.summary}>
        <Card className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Owed on this page</span>
          <span className={styles.summaryValue}>{money(pendingTotal)}</span>
          <span className={styles.summaryHint}>Pending payouts across {items.filter((o) => o.payoutStatus === 'PENDING').length} orders</span>
        </Card>
        <Card className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Collected orders</span>
          <span className={styles.summaryValue}>{data?.total ?? 0}</span>
          <span className={styles.summaryHint}>All time, matching the current filter</span>
        </Card>
      </div>

      <div className={admin.toolbar}>
        <Field label="Status" className={admin.filter}>
          <Select
            value={status}
            aria-label="Filter payouts by status"
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value || 'all'} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <span className={admin.count}>
          {items.length} of {data?.total ?? 0}
        </span>
      </div>

      <AdminContent
        loading={loading && items.length === 0}
        hasData={items.length > 0}
        error={error}
        onRetry={reload}
        skeletonRows={5}
        empty={{ title: 'No payouts to settle', icon: 'cash' }}
      >
        {items.length === 0 ? (
          <AdminEmpty icon="cash" title="Nothing owed">
            {status === 'PENDING'
              ? 'Every collected order has been paid out. Cancelled orders are never payable.'
              : 'No payouts match this filter.'}
          </AdminEmpty>
        ) : (
          <>
            <Table columns={columns} rows={items} rowTo={(o) => `/orders/${o._id}`} caption="Payout ledger" />
            {pages > 1 && (
              <div className={admin.loadMore}>
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <span className={admin.count}>
                  Page {page} of {pages}
                </span>
                <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </AdminContent>
    </div>
  );
}
