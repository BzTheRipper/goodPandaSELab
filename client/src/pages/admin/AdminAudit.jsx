import { useState } from 'react';
import { errorMessage } from '../../api/http.js';
import { adminApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Alert,
  Button,
  Card,
  Field,
  FormError,
  Input,
  Select,
  Table,
  useToast,
} from '../../components/ui/index.js';
import { useAction, useAsync } from '../../hooks/useAsync.js';
import { dateTime } from '../../utils/format.js';
import { AdminContent } from './AdminShared.jsx';
import styles from './Admin.module.css';

/** Immutable trail of privileged actions — who did what, when, and to which record. */
export default function AdminAudit() {
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const { data, loading, error, reload } = useAsync(
    () => adminApi.auditLogs({ action, targetType, limit: 200 }),
    [action, targetType]
  );
  const [q, setQ] = useState('');
  const toast = useToast();
  const { busy, run } = useAction();

  const rows = (data || []).filter((log) => {
    const needle = q.trim().toLowerCase();
    return (
      !needle ||
      [log.actor?.name, log.actor?.email, log.action, log.summary, log.targetType].some((v) =>
        String(v || '').toLowerCase().includes(needle)
      )
    );
  });

  const exportCsv = () => {
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['When', 'Actor', 'Role', 'Action', 'Target', 'Summary'].join(','),
      ...rows.map((l) =>
        [dateTime(l.createdAt), l.actor?.name, l.actorRole, l.action, l.targetType, l.summary].map(escape).join(',')
      ),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'goodpanda-audit.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Audit log exported as CSV.');
  };

  const columns = [
    {
      key: 'when',
      header: 'When',
      render: (l) => <span className={styles.mono}>{dateTime(l.createdAt)}</span>,
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (l) => (
        <span>
          <strong>{l.actor?.name || 'System'}</strong>
          <span className={styles.cellMuted}>{l.actor?.email || l.actorRole || '—'}</span>
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (l) => <span className={styles.mono}>{l.action}</span>,
    },
    {
      key: 'target',
      header: 'Target',
      render: (l) => (
        <span>
          <strong>{l.targetType || '—'}</strong>
          <span className={styles.cellMuted}>{l.summary}</span>
        </span>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Audit log"
        subtitle="Every privileged change, recorded with its actor."
        hint="Actions such as approving restaurants, changing fees, managing drones and collecting orders appear here."
        actions={
          <Button icon="download" variant="secondary" onClick={exportCsv} disabled={!rows.length}>
            Export CSV
          </Button>
        }
      />

      <div className={styles.toolbar}>
        <Field label="Search" className={styles.search}>
          <Input type="search" icon="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Actor, action, summary" aria-label="Search audit log" />
        </Field>
        <Field label="Action" className={styles.filter}>
          <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. SETTINGS_UPDATED" aria-label="Filter by action" />
        </Field>
        <Field label="Target" className={styles.filter}>
          <Select value={targetType} onChange={(e) => setTargetType(e.target.value)} aria-label="Filter by target type">
            <option value="">All targets</option>
            <option value="order">Orders</option>
            <option value="restaurant">Restaurants</option>
            <option value="user">Users</option>
            <option value="drone">Drones</option>
            <option value="hub">Hubs</option>
            <option value="settings">Settings</option>
          </Select>
        </Field>
        <span className={styles.count}>{rows.length} shown</span>
      </div>

      <FormError error={error} />
      <AdminContent
        loading={loading}
        hasData={rows.length > 0}
        error={error}
        onRetry={reload}
        skeletonRows={5}
        empty={{ title: 'No matching actions', icon: 'history' }}
      >
        <Card>
          <Table columns={columns} rows={rows} rowKey={(l) => l._id} caption="Audit log" />
        </Card>
      </AdminContent>
      {busy && <Alert tone="info">Working…</Alert>}
    </div>
  );
}
