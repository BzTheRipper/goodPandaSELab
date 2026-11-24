import { useState } from 'react';
import { errorMessage } from '../../api/http.js';
import { adminApi, hubApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { Alert, Button, Card, CardHeader, Field, FormError, Input, Select, useToast } from '../../components/ui/index.js';
import { useAction, useAsync } from '../../hooks/useAsync.js';
import { dateTime } from '../../utils/format.js';
import { AdminContent } from './AdminShared.jsx';
import styles from './Admin.module.css';

const BLANK = { name: '', email: '', phone: '', password: '', hubId: '' };

/** Super-admin only: create hub operators who can verify pickups at exactly one hub. */
export default function AdminHubStaff() {
  const [form, setForm] = useState(BLANK);
  const [fieldError, setFieldError] = useState('');
  const { data, loading, error, reload } = useAsync(() => adminApi.users('hub_operator'), []);
  const { data: hubs, loading: hubsLoading } = useAsync(() => hubApi.listActive(), []);
  const { busy, error: saveError, run } = useAction();
  const toast = useToast();

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setFieldError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) || form.password.length < 8 || !form.hubId) {
      setFieldError('Provide a name, valid email, phone, a password of at least 8 characters and a hub.');
      return;
    }
    const created = await run(() => adminApi.createHubOperator(form));
    if (created) {
      toast.success(`${created.name} can now verify pickups at their hub.`, { title: 'Hub operator created' });
      setForm(BLANK);
      await reload();
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Hub operators"
        subtitle="Staff who hand orders over at a pickup hub."
        hint="Operators only see orders at their assigned hub. They can verify pickups and resolve order exceptions, but cannot manage the fleet, users or platform settings."
      />

      <Card as="form" className={styles.settingsCard} onSubmit={submit}>
        <CardHeader title="Add a hub operator" hint="Share the sign-in details securely; passwords are never shown again." />
        <div className={styles.formGrid}>
          <Field label="Full name">
            <Input value={form.name} onChange={set('name')} placeholder="e.g. Karim Ahmed" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set('email')} placeholder="karim@goodpanda.test" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={set('phone')} placeholder="+88017…" />
          </Field>
          <Field label="Temporary password" hint="At least 8 characters; ask them to change it after signing in.">
            <Input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
          </Field>
          <Field label="Assigned hub">
            <Select value={form.hubId} onChange={set('hubId')} aria-label="Assigned hub">
              <option value="">Choose a hub…</option>
              {(hubs || []).map((h) => (
                <option key={h._id} value={h._id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="" error={fieldError || saveError}>
          <span />
        </Field>
        <div className={styles.formActions}>
          <Button type="submit" variant="primary" loading={busy || hubsLoading}>
            Create operator
          </Button>
        </div>
      </Card>

      <AdminContent
        loading={loading}
        hasData={(data || []).length > 0}
        error={error}
        onRetry={reload}
        skeletonRows={3}
        empty={{ title: 'No hub operators yet', icon: 'users' }}
      >
        <Card>
          <ul className={styles.staffList}>
            {(data || []).map((u) => (
              <li key={u._id}>
                <span>
                  <strong>{u.name}</strong>
                  <span className={styles.cellMuted}>{u.email} · {u.phone || 'no phone'}</span>
                </span>
                <span className={styles.cellMuted}>{u.hub?.name || 'Unassigned hub'}</span>
                <span className={styles.cellMuted}>{dateTime(u.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </AdminContent>
    </div>
  );
}
