import { useState } from 'react';
import { assetUrl, errorMessage } from '../../api/http.js';
import { adminApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  FormError,
  Input,
  Modal,
  Select,
  StatusPill,
  Table,
  Textarea,
  Toggle,
  useConfirm,
  useToast,
} from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAction, useAsync } from '../../hooks/useAsync.js';
import { dateTime } from '../../utils/format.js';
import { RESTAURANT_STATUS } from '../../utils/status.js';
import { AdminContent, AdminListSkeleton } from './AdminShared.jsx';
import styles from './Admin.module.css';

const MATCH = (value, q) =>
  String(value || '')
    .toLowerCase()
    .includes(q);
const ROLE_TONE = { customer: 'neutral', owner: 'info', admin: 'brand' };

export function AdminRestaurants() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const [docsFor, setDocsFor] = useState(null);
  const [docBusy, setDocBusy] = useState('');
  const [docError, setDocError] = useState('');
  const { data, setData, loading, error, reload } = useAsync(() => adminApi.restaurants(status), [status]);
  const confirm = useConfirm();
  const toast = useToast();

  const q = search.trim().toLowerCase();
  const rows = (data || []).filter((r) => !q || [r.name, r.owner?.name, r.owner?.email, r.phone, r.address].some((v) => MATCH(v, q)));

  const changeStatus = async (restaurant, next) => {
    const approving = next === 'APPROVED';
    const ok = await confirm({
      title: approving ? `Approve ${restaurant.name}?` : `Suspend ${restaurant.name}?`,
      message: approving
        ? 'The restaurant becomes visible to customers. They can still choose when to open for orders.'
        : 'The restaurant is hidden from customers and closed immediately. Existing orders are not affected.',
      confirmLabel: approving ? 'Approve restaurant' : 'Suspend restaurant',
      tone: approving ? 'primary' : 'danger',
    });
    if (!ok) return;

    setBusyId(restaurant._id);
    setActionError('');
    try {
      const updated = await adminApi.setRestaurantStatus(restaurant._id, next);
      setData((list) => list.map((r) => (r._id === restaurant._id ? { ...r, ...updated, owner: r.owner } : r)));
      toast.success(approving ? 'Restaurant approved.' : 'Restaurant suspended.', { title: restaurant.name });
      await reload();
    } catch (err) {
      const message = errorMessage(err);
      setActionError(message);
      toast.error(message, { title: 'Couldn’t update restaurant' });
    } finally {
      setBusyId('');
    }
  };

  const reviewDocument = async (restaurant, doc, verified) => {
    setDocBusy(doc._id);
    setDocError('');
    try {
      const updated = await adminApi.verifyDocument(restaurant._id, doc._id, { verified });
      setDocsFor(updated);
      setData((list) => list.map((r) => (r._id === updated._id ? { ...updated, owner: r.owner } : r)));
      toast.success(verified ? 'Document verified.' : 'Document marked as needing attention.');
    } catch (err) {
      setDocError(errorMessage(err));
    } finally {
      setDocBusy('');
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Restaurant',
      primary: true,
      render: (r) => (
        <div className={styles.nameCell}>
          <span className={styles.cellTitle}>{r.name}</span>
          <span className={styles.cellSub}>{r.address}</span>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (r) => (
        <div className={styles.nameCell}>
          <span>{r.owner?.name || '—'}</span>
          <span className={styles.cellSub}>{r.owner?.email}</span>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (r) => <span className={styles.cellMuted}>{r.phone || '—'}</span> },
    {
      key: 'status',
      header: 'Approval',
      render: (r) => <StatusPill kind="restaurant" status={r.status} showHint />,
    },
    {
      key: 'open',
      header: 'Open for orders',
      render: (r) => (
        <Badge tone={r.isOpen ? 'success' : 'neutral'} dot>
          {r.isOpen ? 'Open' : 'Closed'}
        </Badge>
      ),
    },
    {
      key: 'documents',
      header: 'Documents',
      render: (r) => {
        const docs = r.documents || [];
        const verified = docs.filter((d) => d.verifiedAt).length;
        return (
          <Button size="sm" variant="ghost" onClick={() => setDocsFor(r)}>
            {docs.length ? `${verified}/${docs.length} verified` : 'None'}
          </Button>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      interactive: true,
      render: (r) => (
        <div className={styles.actionsCell}>
          {r.status !== 'APPROVED' && (
            <Button size="sm" variant="primary" loading={busyId === r._id} onClick={() => changeStatus(r, 'APPROVED')}>
              {r.status === 'PENDING' ? 'Approve' : 'Reactivate'}
            </Button>
          )}
          {r.status !== 'SUSPENDED' && (
            <Button size="sm" variant="dangerGhost" loading={busyId === r._id} onClick={() => changeStatus(r, 'SUSPENDED')}>
              Suspend
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Restaurants"
        subtitle="Approve new restaurants or suspend ones that need to be taken offline."
        hint="Suspending hides a restaurant and closes it immediately. Approving makes it visible, but the owner still decides when to open."
      />

      <div className={styles.toolbar}>
        <Field label="Search" className={styles.search}>
          <Input
            type="search"
            icon="search"
            value={search}
            placeholder="Name, owner, email or phone"
            aria-label="Search restaurants"
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Field label="Approval" className={styles.filter}>
          <Select value={status} aria-label="Filter by approval status" onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(RESTAURANT_STATUS).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </Select>
        </Field>
        <span className={styles.count}>{rows.length} shown</span>
      </div>

      <FormError error={error || actionError} />
      <AdminContent
        loading={loading}
        hasData={(data || []).length > 0}
        error={error}
        onRetry={reload}
        skeletonRows={5}
        empty={{ title: 'No restaurants found', icon: 'store' }}
      >
        <Table columns={columns} rows={rows} rowKey={(r) => r._id} caption="Restaurants" />
      </AdminContent>

      <Modal
        open={Boolean(docsFor)}
        onClose={() => setDocsFor(null)}
        title={docsFor ? `Compliance — ${docsFor.name}` : 'Compliance'}
        description="Verify the licence photos the owner uploaded. Notes are shown to the owner."
      >
        <FormError error={docError} />
        {(docsFor?.documents || []).length === 0 ? (
          <EmptyState icon="inbox" title="No documents uploaded">
            Ask the owner to upload a food licence from their restaurant page.
          </EmptyState>
        ) : (
          <ul className={styles.docsList}>
            {(docsFor?.documents || []).map((doc) => {
              const expired = doc.expiresAt && new Date(doc.expiresAt).getTime() < Date.now();
              return (
                <li key={doc._id} className={styles.docRow}>
                  <div className={styles.docInfo}>
                    <strong>
                      {doc.type.replaceAll('_', ' ').toLowerCase()}
                      {doc.label && <span className={styles.cellSub}> · {doc.label}</span>}
                    </strong>
                    <span className={styles.cellSub}>
                      <a href={assetUrl(doc.fileUrl)} target="_blank" rel="noreferrer">
                        View file
                      </a>
                      {' · '}
                      {doc.expiresAt ? `Expires ${dateTime(doc.expiresAt)}` : 'No expiry'}
                    </span>
                    {doc.note && <span className={styles.docNote}>{doc.note}</span>}
                  </div>
                  <div className={styles.docActions}>
                    {doc.verifiedAt ? <Badge tone="success" dot>Verified</Badge> : <Badge tone="warning">Unverified</Badge>}
                    {expired && <Badge tone="danger">Expired</Badge>}
                    {doc.verifiedAt ? (
                      <Button size="sm" variant="dangerGhost" loading={docBusy === doc._id} onClick={() => reviewDocument(docsFor, doc, false)}>
                        Revoke
                      </Button>
                    ) : (
                      <Button size="sm" variant="primary" loading={docBusy === doc._id} onClick={() => reviewDocument(docsFor, doc, true)}>
                        Verify
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </div>
  );
}

export function AdminUsers() {
  const { user: me } = useAuth();
  const [role, setRole] = useState('');
  const [active, setActive] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const { data, setData, loading, error, reload } = useAsync(() => adminApi.users(role), [role]);
  const confirm = useConfirm();
  const toast = useToast();

  const q = search.trim().toLowerCase();
  const rows = (data || []).filter((u) => {
    const roleOk = !role || u.role === role;
    const statusOk = !active || String(u.isActive) === active;
    const searchOk = !q || [u.name, u.email, u.phone].some((v) => MATCH(v, q));
    return roleOk && statusOk && searchOk;
  });

  const toggleActive = async (user) => {
    const next = !user.isActive;
    const ok = await confirm({
      title: next ? `Activate ${user.name}?` : `Deactivate ${user.name}?`,
      message: next
        ? 'They can sign in again immediately.'
        : user.role === 'owner'
          ? 'They can no longer sign in, and all of their restaurants close immediately. Existing orders are not affected.'
          : 'They can no longer sign in. Their existing orders and messages stay on record.',
      confirmLabel: next ? 'Activate user' : 'Deactivate user',
      tone: next ? 'primary' : 'danger',
    });
    if (!ok) return;

    setBusyId(user._id);
    setActionError('');
    try {
      const updated = await adminApi.setUserActive(user._id, next);
      setData((list) => list.map((u) => (u._id === user._id ? updated : u)));
      toast.success(next ? 'User activated.' : 'User deactivated.', { title: user.name });
      await reload();
    } catch (err) {
      const message = errorMessage(err);
      setActionError(message);
      toast.error(message, { title: 'Couldn’t update user' });
    } finally {
      setBusyId('');
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'User',
      primary: true,
      render: (u) => (
        <div className={styles.nameCell}>
          <Avatar name={u.name} size={32} />
          <span className={styles.cellTitle}>{u.name}</span>
          <span className={styles.cellSub}>{u.email}</span>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (u) => <span className={styles.cellMuted}>{u.phone || '—'}</span> },
    {
      key: 'role',
      header: 'Role',
      render: (u) => <Badge tone={ROLE_TONE[u.role] || 'neutral'}>{u.role}</Badge>,
    },
    { key: 'joined', header: 'Joined', render: (u) => <span className={styles.cellMuted}>{dateTime(u.createdAt)}</span> },
    {
      key: 'noShows',
      header: 'No-shows',
      align: 'right',
      render: (u) =>
        u.noShowCount > 0 ? (
          <Badge tone={u.noShowCount >= 3 ? 'danger' : 'warning'}>{u.noShowCount}</Badge>
        ) : (
          <span className={styles.cellMuted}>—</span>
        ),
    },
    {
      key: 'status',
      header: 'Account',
      render: (u) =>
        u._id === me?._id ? (
          <Badge tone="brand" dot>
            You
          </Badge>
        ) : (
          <Badge tone={u.isActive ? 'success' : 'neutral'} dot>
            {u.isActive ? 'Active' : 'Deactivated'}
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      interactive: true,
      render: (u) =>
        u._id === me?._id ? (
          <span className={styles.cellMuted}>—</span>
        ) : (
          <Button size="sm" variant={u.isActive ? 'dangerGhost' : 'primary'} loading={busyId === u._id} onClick={() => toggleActive(u)}>
            {u.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Users"
        subtitle="Manage customers, restaurant owners and other admins."
        hint="You can’t change your own account here. Deactivating an owner also closes their restaurants until you reactivate them."
      />

      <div className={styles.toolbar}>
        <Field label="Search" className={styles.search}>
          <Input
            type="search"
            icon="search"
            value={search}
            placeholder="Name, email or phone"
            aria-label="Search users"
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Field label="Role" className={styles.filter}>
          <Select value={role} aria-label="Filter by role" onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            <option value="customer">Customers</option>
            <option value="owner">Owners</option>
            <option value="admin">Admins</option>
          </Select>
        </Field>
        <Field label="Account" className={styles.filter}>
          <Select value={active} aria-label="Filter by account status" onChange={(e) => setActive(e.target.value)}>
            <option value="">All accounts</option>
            <option value="true">Active</option>
            <option value="false">Deactivated</option>
          </Select>
        </Field>
        <span className={styles.count}>{rows.length} shown</span>
      </div>

      <FormError error={error || actionError} />
      <AdminContent
        loading={loading}
        hasData={(data || []).length > 0}
        error={error}
        onRetry={reload}
        skeletonRows={5}
        empty={{ title: 'No users found', icon: 'users' }}
      >
        <Table columns={columns} rows={rows} rowKey={(u) => u._id} caption="Users" />
      </AdminContent>
    </div>
  );
}

export function AdminSettings() {
  const { data, loading, error, reload } = useAsync(() => adminApi.settings(), []);
  const [fee, setFee] = useState(null);
  const [mode, setMode] = useState(null);
  const [perKm, setPerKm] = useState(null);
  const [max, setMax] = useState(null);
  const [bannerMessage, setBannerMessage] = useState(null);
  const [bannerTone, setBannerTone] = useState(null);
  const [bannerActive, setBannerActive] = useState(null);
  const [fieldError, setFieldError] = useState('');
  const [saved, setSaved] = useState(false);
  const { busy, error: saveError, run } = useAction();
  const toast = useToast();
  const value = fee ?? data?.deliveryFee ?? 0;
  const feeMode = mode ?? data?.mode ?? 'flat';
  const perKmValue = perKm ?? data?.perKm ?? 0;
  const maxValue = max ?? data?.max ?? 0;
  const announcementMessage = bannerMessage ?? data?.announcement?.message ?? '';
  const announcementTone = bannerTone ?? data?.announcement?.tone ?? 'info';
  const announcementActive = bannerActive ?? data?.announcement?.active !== false;

  const submit = async (e) => {
    e.preventDefault();
    setSaved(false);
    const amount = Number(value);
    if (value === '' || !Number.isFinite(amount) || amount < 0 || amount > 10000) {
      setFieldError('Enter an amount between 0 and 10,000 BDT.');
      return;
    }
    if (feeMode === 'distance') {
      const rate = Number(perKmValue);
      const cap = Number(maxValue);
      if (!Number.isFinite(rate) || rate < 0 || rate > 1000 || !Number.isFinite(cap) || cap < 0 || cap > 10000) {
        setFieldError('Per-km rate and cap must be non-negative numbers.');
        return;
      }
    }
    setFieldError('');
    const updated = await run(() =>
      adminApi.updateSettings({
        deliveryFee: amount,
        mode: feeMode,
        perKm: feeMode === 'distance' ? Number(perKmValue) : undefined,
        max: feeMode === 'distance' ? Number(maxValue) : undefined,
        announcement: announcementMessage.trim()
          ? { message: announcementMessage.trim(), tone: announcementTone, active: announcementActive }
          : null,
      })
    );
    if (updated) {
      setFee(String(updated.deliveryFee));
      setMode(updated.mode);
      setPerKm(String(updated.perKm));
      setMax(String(updated.max));
      setBannerMessage(updated.announcement?.message ?? '');
      setBannerTone(updated.announcement?.tone ?? 'info');
      setBannerActive(updated.announcement?.active !== false);
      setSaved(true);
      toast.success(
        feeMode === 'distance'
          ? `Delivery: ৳${updated.deliveryFee} base + ৳${updated.perKm}/km, capped at ৳${updated.max}.`
          : `Delivery fee is now ৳${updated.deliveryFee.toFixed(2)}.`,
        { title: 'Settings saved' }
      );
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Platform settings"
        subtitle="Delivery pricing for new orders."
        hint="The fee is added when an order is placed. Changing it does not affect orders that are already in progress."
      />

      {loading && !data ? (
        <AdminListSkeleton rows={3} />
      ) : error && !data ? (
        <Card>
          <FormError error={error} />
          <Button variant="secondary" icon="refresh" onClick={reload}>
            Try again
          </Button>
        </Card>
      ) : (
        <Card as="form" className={styles.settingsCard} onSubmit={submit}>
          <CardHeader title="Delivery pricing" hint="Applied when a new order is placed. Existing orders keep their original fee." />
          <Field label="Pricing mode" hint="Flat charges one fee; distance adds a per-km amount from restaurant to hub, capped below.">
            <Select
              value={feeMode}
              onChange={(e) => {
                setMode(e.target.value);
                setSaved(false);
              }}
              aria-label="Delivery pricing mode"
            >
              <option value="flat">Flat fee</option>
              <option value="distance">Distance-based</option>
            </Select>
          </Field>
          <Field
            label={feeMode === 'distance' ? 'Base fee (BDT)' : 'Drone delivery fee (BDT)'}
            hint="Must be between 0 and 10,000."
            error={fieldError}
          >
            <Input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => {
                setFee(e.target.value);
                setFieldError('');
                setSaved(false);
              }}
            />
          </Field>
          {feeMode === 'distance' && (
            <div className={styles.formGrid}>
              <Field label="Per kilometre (BDT)" hint="Added for each km between restaurant and hub.">
                <Input
                  type="number"
                  step="0.01"
                  value={perKmValue}
                  onChange={(e) => {
                    setPerKm(e.target.value);
                    setSaved(false);
                  }}
                />
              </Field>
              <Field label="Maximum fee (BDT)" hint="The total delivery fee never exceeds this.">
                <Input
                  type="number"
                  step="0.01"
                  value={maxValue}
                  onChange={(e) => {
                    setMax(e.target.value);
                    setSaved(false);
                  }}
                />
              </Field>
            </div>
          )}
          <CardHeader title="Platform banner" hint="Shown at the top of every screen. Leave the message empty to hide it." />
          <Field label="Banner message" optional hint="Up to 200 characters. Keep it short and actionable.">
            <Textarea
              rows={2}
              maxLength={200}
              value={announcementMessage}
              placeholder="e.g. Drone deliveries are paused in Mirpur until 6pm today."
              onChange={(e) => {
                setBannerMessage(e.target.value);
                setSaved(false);
              }}
            />
          </Field>
          <div className={styles.formGrid}>
            <Field label="Banner tone">
              <Select value={announcementTone} onChange={(e) => setBannerTone(e.target.value)}>
                <option value="info">Information</option>
                <option value="warning">Warning</option>
                <option value="danger">Important</option>
              </Select>
            </Field>
            <Field label="Visibility" hint="Hide the banner without deleting the message.">
              <Toggle
                label="Show this banner to everyone"
                checked={announcementActive}
                onChange={(e) => setBannerActive(e.target.checked)}
              />
            </Field>
          </div>
          <FormError error={saveError} />
          {saved && (
            <Alert tone="success" title="Saved">
              New orders will use this delivery fee.
            </Alert>
          )}
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" loading={busy}>
              Save settings
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
