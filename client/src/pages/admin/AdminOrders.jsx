import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { Button, Field, Input, Select, StatusPill, Table } from '../../components/ui/index.js';
import { useOrderList } from '../../hooks/useOrder.js';
import { dateTime, money, shortId } from '../../utils/format.js';
import { ORDER_STATUS } from '../../utils/status.js';
import { AdminContent, AdminEmpty } from './AdminShared.jsx';
import styles from './Admin.module.css';

export default function AdminOrders() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const needsIntervention = params.get('needsIntervention') === 'true' ? 'true' : '';
  const query = params.get('q') || '';
  const { orders, total, pages, page, loading, error, reload, loadMore } = useOrderList(
    {
      ...(status && { status }),
      ...(needsIntervention && { needsIntervention }),
      ...(query.trim() && { q: query.trim() }),
    },
    { pageSize: 25 }
  );

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // Debounce the search box so typing doesn't fire a request per keystroke.
  const [term, setTerm] = useState(query);
  useEffect(() => setTerm(query), [query]);
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (term.trim() === query.trim()) return;
      update('q', term.trim());
    }, 300);
    return () => window.clearTimeout(id);
  }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = () => {
    setTerm('');
    setParams(new URLSearchParams(), { replace: true });
  };
  const hasFilters = Boolean(status || needsIntervention || query);

  const columns = [
    {
      key: 'order',
      header: 'Order',
      primary: true,
      render: (o) => <span className={styles.cellTitle}>{shortId(o._id)}</span>,
    },
    {
      key: 'restaurant',
      header: 'Restaurant',
      render: (o) => <span className={styles.cellMuted}>{o.restaurant?.name || '—'}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (o) => <span className={styles.cellMuted}>{o.customer?.name || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => (
        <div className={styles.actionsCell}>
          <StatusPill status={o.status} />
          {o.needsAdminIntervention && <span className={styles.attention}>Needs help</span>}
        </div>
      ),
    },
    {
      key: 'hub',
      header: 'Hub',
      render: (o) => <span className={styles.cellMuted}>{o.hub?.name || '—'}</span>,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (o) => <span className={styles.recentTotal}>{money(o.total)}</span>,
    },
    {
      key: 'placed',
      header: 'Placed',
      render: (o) => <span className={styles.cellMuted}>{dateTime(o.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      interactive: true,
      render: (o) => (
        <div className={styles.actionsCell}>
          <Button to={`/orders/${o._id}`} size="sm" variant="secondary">
            Details
          </Button>
          {o.status === 'ARRIVED_AT_HUB' && (
            <Button to={`/admin/pickup?order=${o._id}`} size="sm" variant="primary" icon="cash">
              Verify
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Orders"
        subtitle="Every order across all restaurants, with live status updates."
        hint="Status, priority and search run on the server, so they cover the whole order history. Search matches order IDs, restaurants, customers and hubs."
        actions={
          hasFilters && (
            <Button variant="ghost" icon="x" onClick={clear}>
              Clear filters
            </Button>
          )
        }
      />

      <div className={styles.toolbar}>
        <Field label="Search" className={styles.search}>
          <Input
            type="search"
            icon="search"
            value={term}
            placeholder="Order, restaurant, customer or hub"
            aria-label="Search orders"
            onChange={(e) => setTerm(e.target.value)}
          />
        </Field>
        <Field label="Status" className={styles.filter}>
          <Select value={status} aria-label="Filter by status" onChange={(e) => update('status', e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(ORDER_STATUS).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" hint="Flagged after a drone failed mid-flight and needs a decision." className={styles.filter}>
          <Select
            value={needsIntervention}
            aria-label="Filter by intervention"
            onChange={(e) => update('needsIntervention', e.target.value)}
          >
            <option value="">All orders</option>
            <option value="true">Needs intervention</option>
          </Select>
        </Field>
        <span className={styles.count}>
          {orders.length} of {total}
        </span>
      </div>

      <AdminContent
        loading={loading && orders.length === 0}
        hasData={orders.length > 0}
        error={error}
        onRetry={reload}
        skeletonRows={6}
        empty={{ title: 'No orders yet', icon: 'receipt' }}
      >
        {orders.length === 0 ? (
          <AdminEmpty icon="search" title="No matching orders">
            Try a different status or search term.
          </AdminEmpty>
        ) : (
          <>
            <Table columns={columns} rows={orders} rowTo={(o) => `/orders/${o._id}`} caption="Orders" />
            {page < pages && (
              <div className={styles.loadMore}>
                <Button variant="secondary" iconRight="chevronDown" onClick={loadMore} loading={loading}>
                  Load more orders
                </Button>
                <span className={styles.count}>
                  Page {page} of {pages}
                </span>
              </div>
            )}
          </>
        )}
      </AdminContent>
    </div>
  );
}

