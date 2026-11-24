import { useState } from 'react';
import { errorMessage } from '../../api/http.js';
import { adminApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  FormError,
  Input,
  Modal,
  Select,
  Table,
  Textarea,
  useToast,
} from '../../components/ui/index.js';
import { useAction, useAsync } from '../../hooks/useAsync.js';
import { dateTime, money, shortId } from '../../utils/format.js';
import { AdminContent, AdminEmpty } from './AdminShared.jsx';
import admin from './Admin.module.css';
import styles from './AdminDisputes.module.css';

const STATUS = [
  ['OPEN', 'Open'],
  ['RESOLVED', 'Resolved'],
  ['REJECTED', 'Rejected'],
  ['', 'All reports'],
];

const statusTone = (s) => (s === 'OPEN' ? 'warning' : s === 'RESOLVED' ? 'success' : 'neutral');
const categoryLabel = (c) => c.replaceAll('_', ' ').toLowerCase();

/** Support queue for customer reports; refunds are recorded here and audited. */
export default function AdminDisputes() {
  const [status, setStatus] = useState('OPEN');
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('RESOLVED');
  const [resolution, setResolution] = useState('REFUND');
  const [refundAmount, setRefundAmount] = useState('');
  const [note, setNote] = useState('');
  const { data, loading, error, reload } = useAsync(
    () => adminApi.disputes(status ? { status } : undefined),
    [status]
  );
  const { busy, error: actionError, run } = useAction();
  const toast = useToast();

  const rows = data || [];

  const openResolve = (dispute) => {
    setSelected(dispute);
    setView('RESOLVED');
    setResolution('REFUND');
    setRefundAmount(String(Math.round((dispute.order?.total || 0) * 100) / 100));
    setNote('');
  };

  const resolve = async (e) => {
    e.preventDefault();
    const amount = view === 'REJECTED' ? 0 : Number(refundAmount) || 0;
    const updated = await run(() =>
      adminApi.resolveDispute(selected._id, {
        status: view,
        ...(view === 'RESOLVED' && { resolution, refundAmount: resolution === 'NO_ACTION' ? 0 : amount }),
        ...(note.trim() && { note: note.trim() }),
      })
    );
    if (updated) {
      toast.success(updated.refundAmount > 0 ? `Refund of ${money(updated.refundAmount)} recorded.` : 'Report closed.');
      setSelected(null);
      await reload();
    }
  };

  const columns = [
    {
      key: 'order',
      header: 'Order',
      primary: true,
      render: (d) => (
        <div className={styles.stack}>
          <span className={admin.cellTitle}>{d.order ? shortId(d.order._id) : '—'}</span>
          <span className={admin.cellMuted}>{d.order ? `${money(d.order.total)} · ${d.order.status}` : ''}</span>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (d) => (
        <div className={styles.stack}>
          <span>{d.customer?.name || '—'}</span>
          <span className={admin.cellMuted}>{d.customer?.phone || d.customer?.email}</span>
        </div>
      ),
    },
    { key: 'restaurant', header: 'Restaurant', render: (d) => <span className={admin.cellMuted}>{d.restaurant?.name || '—'}</span> },
    {
      key: 'category',
      header: 'Report',
      render: (d) => (
        <div className={styles.stack}>
          <span>{categoryLabel(d.category)}</span>
          <span className={admin.cellMuted}>{d.description.slice(0, 80)}</span>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (d) => <Badge tone={statusTone(d.status)}>{d.status}</Badge> },
    {
      key: 'refund',
      header: 'Refund',
      align: 'right',
      render: (d) => (d.refundAmount > 0 ? <strong>{money(d.refundAmount)}</strong> : <span className={admin.cellMuted}>—</span>),
    },
    { key: 'opened', header: 'Opened', render: (d) => <span className={admin.cellMuted}>{dateTime(d.createdAt)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      interactive: true,
      render: (d) =>
        d.status === 'OPEN' ? (
          <Button size="sm" variant="primary" onClick={() => openResolve(d)}>
            Review
          </Button>
        ) : (
          <Button to={`/orders/${d.order?._id}`} size="sm" variant="secondary">
            Order
          </Button>
        ),
    },
  ];

  return (
    <div className={admin.page}>
      <PageHeader
        title="Disputes"
        subtitle="Customer reports about completed or cancelled orders."
        hint="A refund recorded here is a settlement note and reduces the order's net; it does not call the payment gateway automatically."
      />

      <div className={admin.toolbar}>
        <Field label="Status" className={admin.filter}>
          <Select value={status} aria-label="Filter disputes" onChange={(e) => setStatus(e.target.value)}>
            {STATUS.map(([value, label]) => (
              <option key={value || 'all'} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <span className={admin.count}>{rows.length} shown</span>
      </div>

      <AdminContent
        loading={loading && rows.length === 0}
        hasData={rows.length > 0}
        error={error}
        onRetry={reload}
        skeletonRows={5}
        empty={{ title: 'No disputes', icon: 'checkCircle' }}
      >
        {rows.length === 0 ? (
          <AdminEmpty icon="checkCircle" title="Nothing to review">
            Customer reports will appear here.
          </AdminEmpty>
        ) : (
          <Table columns={columns} rows={rows} rowKey={(d) => d._id} caption="Disputes" />
        )}
      </AdminContent>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Report on ${shortId(selected.order?._id)}` : 'Dispute'}
        description={selected ? selected.description : ''}
      >
        <form className={styles.form} onSubmit={resolve}>
          <Field label="Decision">
            <Select value={view} onChange={(e) => setView(e.target.value)}>
              <option value="RESOLVED">Resolve</option>
              <option value="REJECTED">Reject</option>
            </Select>
          </Field>
          {view === 'RESOLVED' && (
            <>
              <Field label="Resolution">
                <Select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                  <option value="REFUND">Full refund</option>
                  <option value="PARTIAL_REFUND">Partial refund</option>
                  <option value="NO_ACTION">No refund</option>
                </Select>
              </Field>
              {resolution !== 'NO_ACTION' && (
                <Field label="Refund amount (BDT)" hint={`Order total is ${money(selected?.order?.total || 0)}.`}>
                  <Input type="number" min="0" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
                </Field>
              )}
            </>
          )}
          <Field label="Note to the customer" optional>
            <Textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <FormError error={actionError} />
          <Button type="submit" variant="primary" loading={busy}>
            {view === 'REJECTED' ? 'Reject report' : 'Resolve report'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
