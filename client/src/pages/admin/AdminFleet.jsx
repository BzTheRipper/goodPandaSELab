import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
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
  Icon,
  InfoTooltip,
  Input,
  Modal,
  Select,
  StatusPill,
  Table,
  Toggle,
  useConfirm,
  useToast,
} from '../../components/ui/index.js';
import { useSocketEvent } from '../../context/SocketContext.jsx';
import { useAction, useAsync } from '../../hooks/useAsync.js';
import { coords, dateTime, shortId } from '../../utils/format.js';
import { statusMeta } from '../../utils/status.js';
import { AdminContent } from './AdminShared.jsx';
import styles from './Admin.module.css';

const HUB_BLANK = { name: '', address: '', lat: '', lng: '', isActive: true };
const DRONE_BLANK = { identifier: '', battery: '100', lat: '', lng: '', status: 'IDLE' };
const BUSY = new Set(['LOADED', 'IN_FLIGHT']);

function HubModal({ open, hub, onClose, onSaved }) {
  const formId = useId();
  const [form, setForm] = useState(HUB_BLANK);
  const [fieldError, setFieldError] = useState('');
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (!open) return;
    setFieldError('');
    setForm(
      hub
        ? {
            name: hub.name || '',
            address: hub.address || '',
            lat: String(hub.location?.lat ?? ''),
            lng: String(hub.location?.lng ?? ''),
            isActive: hub.isActive !== false,
          }
        : HUB_BLANK,
    );
  }, [open, hub?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (form.name.trim().length < 2 || form.address.trim().length < 3) {
      setFieldError('Enter a name (2+ characters) and an address (3+ characters).');
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setFieldError('Enter a valid latitude and longitude.');
      return;
    }
    setFieldError('');
    const body = { name: form.name.trim(), address: form.address.trim(), lat, lng, isActive: form.isActive };
    const saved = await run(() => (hub ? adminApi.updateHub(hub._id, body) : adminApi.createHub(body)));
    if (saved) {
      onSaved(saved);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={hub ? `Edit ${hub.name}` : 'Add a drone hub'}
      description="Customers collect their orders at active hubs."
      size="md"
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={busy}>
            {hub ? 'Save changes' : 'Add hub'}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={submit}>
        <div className={styles.formGrid}>
          <Field label="Name" hint="Shown to customers at checkout and on the order page.">
            <Input
              required
              minLength={2}
              maxLength={80}
              value={form.name}
              onChange={set('name')}
              placeholder="e.g. Banani Drone Hub"
              autoFocus
            />
          </Field>
          <Field label="Address" hint="Where the hub operator and customer meet.">
            <Input required minLength={3} maxLength={200} value={form.address} onChange={set('address')} placeholder="Street, area, city" />
          </Field>
          <Field label="Latitude" hint="Map coordinates for drone routing and distance checks.">
            <Input required type="number" step="any" min="-90" max="90" value={form.lat} onChange={set('lat')} placeholder="23.7461" />
          </Field>
          <Field label="Longitude" hint="Map coordinates for drone routing and distance checks.">
            <Input required type="number" step="any" min="-180" max="180" value={form.lng} onChange={set('lng')} placeholder="90.3742" />
          </Field>
          <div className={styles.wide}>
            <Field label="Hub status" hint="Inactive hubs are hidden at checkout, but existing orders can still be collected there.">
              <Toggle label="Hub is active" checked={form.isActive} onChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))} />
            </Field>
          </div>
        </div>
        <FormError error={fieldError || error} />
      </form>
    </Modal>
  );
}

export function AdminHubs() {
  const { data, setData, loading, error, reload } = useAsync(() => adminApi.hubs(), []);
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const confirm = useConfirm();
  const toast = useToast();

  const runAction = async (hub, key, fn, success) => {
    setBusyId(key);
    setActionError('');
    try {
      await fn();
      toast.success(success, { title: hub.name });
      await reload();
    } catch (err) {
      const message = errorMessage(err);
      setActionError(message);
      toast.error(message, { title: 'Couldn’t update hub' });
    } finally {
      setBusyId('');
    }
  };

  const toggleActive = async (hub) => {
    const next = !hub.isActive;
    if (!next) {
      const ok = await confirm({
        title: `Deactivate ${hub.name}?`,
        message: 'Customers will no longer be able to choose this hub at checkout. Orders already assigned to it are unaffected.',
        confirmLabel: 'Deactivate hub',
        tone: 'danger',
      });
      if (!ok) return;
    }
    await runAction(
      hub,
      `${hub._id}:active`,
      () => adminApi.updateHub(hub._id, { isActive: next }),
      next ? 'Hub activated.' : 'Hub deactivated.',
    );
  };

  const remove = async (hub) => {
    const ok = await confirm({
      title: `Delete ${hub.name}?`,
      message: 'This permanently removes the hub. Hubs with active orders can’t be deleted — deactivate them instead.',
      confirmLabel: 'Delete hub',
      tone: 'danger',
    });
    if (!ok) return;
    await runAction(hub, `${hub._id}:delete`, () => adminApi.deleteHub(hub._id), 'Hub deleted.');
  };

  const columns = [
    {
      key: 'name',
      header: 'Hub',
      primary: true,
      render: (h) => <span className={styles.cellTitle}>{h.name}</span>,
    },
    { key: 'address', header: 'Address', render: (h) => <span className={styles.cellMuted}>{h.address}</span> },
    { key: 'coords', header: 'Coordinates', render: (h) => <span className={styles.cellMuted}>{coords(h.location)}</span> },
    {
      key: 'active',
      header: 'Status',
      render: (h) => (
        <Badge tone={h.isActive ? 'success' : 'neutral'} dot>
          {h.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      interactive: true,
      render: (h) => (
        <div className={styles.actionsCell}>
          <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(h)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant={h.isActive ? 'dangerGhost' : 'primary'}
            loading={busyId === `${h._id}:active`}
            onClick={() => toggleActive(h)}
          >
            {h.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Button size="sm" variant="dangerGhost" loading={busyId === `${h._id}:delete`} onClick={() => remove(h)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Drone hubs"
        subtitle="Pickup points customers can choose at checkout."
        hint="Only active hubs appear at checkout. Deactivate a hub to pause new arrivals without affecting existing orders."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing({ _id: 'new' })}>
            Add hub
          </Button>
        }
      />

      <FormError error={error || actionError} />
      <AdminContent
        loading={loading}
        hasData={(data || []).length > 0}
        error={error}
        onRetry={reload}
        skeletonRows={5}
        empty={{ title: 'No hubs yet', icon: 'mapPin' }}
      >
        <Table columns={columns} rows={data || []} rowKey={(h) => h._id} caption="Drone hubs" />
      </AdminContent>

      <HubModal
        open={Boolean(editing)}
        hub={editing?._id === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          toast.success(editing?._id === 'new' ? 'Hub added.' : 'Hub updated.', { title: saved.name });
          reload();
        }}
      />
    </div>
  );
}

function DroneModal({ open, drone, onClose, onSaved }) {
  const formId = useId();
  const [form, setForm] = useState(DRONE_BLANK);
  const [fieldError, setFieldError] = useState('');
  const { busy, error, run } = useAction();
  const locked = Boolean(drone && (BUSY.has(drone.status) || drone.currentOrder));

  useEffect(() => {
    if (!open) return;
    setFieldError('');
    setForm(
      drone
        ? {
            identifier: drone.identifier || '',
            battery: String(drone.battery ?? 100),
            lat: String(drone.location?.lat ?? ''),
            lng: String(drone.location?.lng ?? ''),
            status: drone.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'IDLE',
          }
        : DRONE_BLANK,
    );
  }, [open, drone?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const battery = Number(form.battery);
    const hasLat = form.lat !== '';
    const hasLng = form.lng !== '';
    const lat = Number(form.lat);
    const lng = Number(form.lng);

    if (form.identifier.trim().length < 2) {
      setFieldError('Enter an identifier with at least 2 characters.');
      return;
    }
    if (!Number.isFinite(battery) || battery < 0 || battery > 100) {
      setFieldError('Battery must be a number between 0 and 100.');
      return;
    }
    if (
      hasLat !== hasLng ||
      (hasLat && (!Number.isFinite(lat) || lat < -90 || lat > 90)) ||
      (hasLng && (!Number.isFinite(lng) || lng < -180 || lng > 180))
    ) {
      setFieldError('Enter both coordinates with valid latitude and longitude values.');
      return;
    }

    const body = { identifier: form.identifier.trim(), battery };
    if (hasLat && hasLng && !locked) {
      body.lat = lat;
      body.lng = lng;
    }
    if (drone && !locked) body.status = form.status;

    setFieldError('');
    const saved = await run(() => (drone ? adminApi.updateDrone(drone._id, body) : adminApi.createDrone(body)));
    if (saved) {
      onSaved(saved);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={drone ? `Edit ${drone.identifier}` : 'Add a drone'}
      description="Fleet details used for routing and availability checks."
      size="md"
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={busy}>
            {drone ? 'Save changes' : 'Add drone'}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={submit}>
        <div className={styles.formGrid}>
          <Field label="Identifier" hint="A unique fleet code, for example GP-DR-05.">
            <Input
              required
              minLength={2}
              maxLength={40}
              value={form.identifier}
              onChange={set('identifier')}
              placeholder="GP-DR-05"
              autoFocus
            />
          </Field>
          <Field label="Battery (%)" hint="Drones below the minimum charge are not offered for new deliveries.">
            <Input required type="number" min="0" max="100" step="1" value={form.battery} onChange={set('battery')} />
          </Field>
          <Field label="Latitude" hint="Optional starting position. Both coordinates must be provided together.">
            <Input
              type="number"
              step="any"
              min="-90"
              max="90"
              value={form.lat}
              onChange={set('lat')}
              disabled={locked}
              placeholder="23.7461"
            />
          </Field>
          <Field label="Longitude" hint="Optional starting position. Both coordinates must be provided together.">
            <Input
              type="number"
              step="any"
              min="-180"
              max="180"
              value={form.lng}
              onChange={set('lng')}
              disabled={locked}
              placeholder="90.3742"
            />
          </Field>
          {drone && (
            <div className={styles.wide}>
              <Field
                label="Availability"
                hint={
                  locked
                    ? 'Assigned drones can’t change status here. Use “Mark failed” to take one out of service.'
                    : 'Idle drones can take deliveries; maintenance drones cannot.'
                }
              >
                <Select value={form.status} onChange={set('status')} disabled={locked}>
                  <option value="IDLE">Idle — available</option>
                  <option value="MAINTENANCE">Maintenance — out of service</option>
                </Select>
              </Field>
            </div>
          )}
        </div>
        {locked && (
          <p className={styles.cellMuted}>
            This drone is busy. Battery can be changed, but status and location are locked while it has an order.
          </p>
        )}
        <FormError error={fieldError || error} />
      </form>
    </Modal>
  );
}

function batteryClass(level) {
  if (level < 20) return styles.batteryLow;
  if (level < 50) return styles.batteryMedium;
  return '';
}

function DroneCard({ drone, busyId, onEdit, onMaintenance, onReturn, onRecharge, onFail, onDelete }) {
  const orderId = drone.currentOrder?._id || drone.currentOrder;
  const orderStatus = drone.currentOrder?.status;
  const level = Math.max(0, Math.min(100, Number(drone.battery ?? 0)));
  const busy = Boolean(busyId);

  return (
    <Card className={styles.droneCard}>
      <div className={styles.droneHead}>
        <div>
          <h3 className={styles.droneId}>{drone.identifier}</h3>
          <p className={styles.droneSub}>Added {dateTime(drone.createdAt)}</p>
        </div>
        <StatusPill kind="drone" status={drone.status} showHint />
      </div>

      {drone.lastFailureAt && (
        <div className={styles.failure}>
          <Icon name="alertTriangle" size={14} /> Last failed {dateTime(drone.lastFailureAt)}
        </div>
      )}

      <div>
        <div className={styles.batteryLabel}>
          <span>Battery</span>
          <strong>{level}%</strong>
        </div>
        <div
          className={styles.batteryTrack}
          role="progressbar"
          aria-label={`${drone.identifier} battery`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={level}
        >
          <div className={`${styles.batteryFill} ${batteryClass(level)}`} style={{ width: `${level}%` }} />
        </div>
      </div>

      <div className={styles.metaGrid}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Location</span>
          <span className={styles.metaValue}>{coords(drone.location)}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Current order</span>
          <span className={styles.metaValue}>
            {orderId ? (
              <>
                <Link to={`/orders/${orderId}`} className={styles.rowLink}>
                  {shortId(orderId)}
                </Link>
                {orderStatus && <span className={styles.cellSub}>{statusMeta('order', orderStatus).label}</span>}
              </>
            ) : (
              'None'
            )}
          </span>
        </div>
      </div>

      <div className={styles.cardActions}>
        <Button size="sm" variant="secondary" icon="edit" loading={busyId === 'edit'} onClick={onEdit}>
          Edit
        </Button>
        {drone.status === 'IDLE' && (
          <Button size="sm" variant="secondary" loading={busyId === 'maintenance'} onClick={onMaintenance}>
            Maintenance
          </Button>
        )}
        {drone.status === 'MAINTENANCE' && !orderId && (
          <Button size="sm" variant="primary" loading={busyId === 'return'} onClick={onReturn}>
            Return to service
          </Button>
        )}
        {level < 100 && (
          <Button size="sm" variant="secondary" icon="refresh" loading={busyId === 'recharge'} onClick={onRecharge}>
            Recharge
          </Button>
        )}
        {drone.status !== 'MAINTENANCE' && (
          <Button size="sm" variant="dangerGhost" loading={busyId === 'fail'} onClick={onFail}>
            Mark failed
          </Button>
        )}
        {!orderId && (
          <Button size="sm" variant="dangerGhost" icon="trash" loading={busyId === 'delete'} onClick={onDelete}>
            Delete
          </Button>
        )}
        {!busy && !orderId && (
          <InfoTooltip content="Drones assigned to an order can’t be deleted. Resolve the order first." label="About deleting drones" />
        )}
      </div>
    </Card>
  );
}

export function AdminDrones() {
  const { data, setData, loading, error, reload } = useAsync(() => adminApi.drones(), []);
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const confirm = useConfirm();
  const toast = useToast();

  const merge = (patch) =>
    setData((list) => list?.map((d) => (d._id === patch._id ? { ...d, ...patch, currentOrder: d.currentOrder } : d)));
  useSocketEvent('drone:updated', reload);
  useSocketEvent('drone:location', (t) => {
    if (t?.droneId && t.location) merge({ _id: t.droneId, location: t.location, battery: t.battery });
  });

  const runAction = async (drone, key, fn, success) => {
    setBusyId(key);
    setActionError('');
    try {
      await fn();
      toast.success(success, { title: drone.identifier });
      await reload();
    } catch (err) {
      const message = errorMessage(err);
      setActionError(message);
      toast.error(message, { title: 'Couldn’t update drone' });
    } finally {
      setBusyId('');
    }
  };

  const setMaintenance = async (drone) => {
    const ok = await confirm({
      title: `Put ${drone.identifier} in maintenance?`,
      message: 'It will not be offered for new deliveries until you return it to service.',
      confirmLabel: 'Set maintenance',
      tone: 'danger',
    });
    if (!ok) return;
    await runAction(drone, 'maintenance', () => adminApi.updateDrone(drone._id, { status: 'MAINTENANCE' }), 'Drone is in maintenance.');
  };

  const returnToService = async (drone) => {
    const ok = await confirm({
      title: `Return ${drone.identifier} to service?`,
      message: 'The drone becomes idle and is fully charged, ready for its next delivery.',
      confirmLabel: 'Return to service',
      tone: 'primary',
    });
    if (!ok) return;
    await runAction(
      drone,
      'return',
      () => adminApi.updateDrone(drone._id, { status: 'IDLE', battery: 100 }),
      'Drone is back in service and charged.',
    );
  };

  const recharge = (drone) => runAction(drone, 'recharge', () => adminApi.updateDrone(drone._id, { battery: 100 }), 'Battery set to 100%.');

  const markFailed = async (drone) => {
    const inFlight = drone.status === 'IN_FLIGHT';
    const ok = await confirm({
      title: `Mark ${drone.identifier} as failed?`,
      message: inFlight
        ? 'The flight stops and the order is flagged for admin intervention. The drone goes into maintenance; you can return the order to the restaurant or cancel it.'
        : 'The drone goes into maintenance. If it has a loaded order, that order is detached for the restaurant to re-dispatch.',
      confirmLabel: 'Mark as failed',
      tone: 'danger',
    });
    if (!ok) return;
    await runAction(drone, 'fail', () => adminApi.failDrone(drone._id), 'Drone marked failed and sent to maintenance.');
  };

  const remove = async (drone) => {
    const ok = await confirm({
      title: `Delete ${drone.identifier}?`,
      message: 'This permanently removes the drone from the fleet. Only unassigned drones can be deleted.',
      confirmLabel: 'Delete drone',
      tone: 'danger',
    });
    if (!ok) return;
    await runAction(drone, 'delete', () => adminApi.deleteDrone(drone._id), 'Drone deleted.');
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Drone fleet"
        subtitle="Live status, battery and assignment for every drone."
        hint="Battery and location refresh from drone telemetry. Marking a failed drone puts it into maintenance; mid-flight failures also flag the order for intervention."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing({ _id: 'new' })}>
            Add drone
          </Button>
        }
      />

      <FormError error={error || actionError} />
      <AdminContent
        loading={loading}
        hasData={(data || []).length > 0}
        error={error}
        onRetry={reload}
        skeletonRows={4}
        empty={{ title: 'No drones yet', icon: 'drone' }}
      >
        <div className={styles.fleetGrid}>
          {(data || []).map((drone) => (
            <DroneCard
              key={drone._id}
              drone={drone}
              busyId={busyId}
              onEdit={() => setEditing(drone)}
              onMaintenance={() => setMaintenance(drone)}
              onReturn={() => returnToService(drone)}
              onRecharge={() => recharge(drone)}
              onFail={() => markFailed(drone)}
              onDelete={() => remove(drone)}
            />
          ))}
        </div>
      </AdminContent>

      <DroneModal
        open={Boolean(editing)}
        drone={editing?._id === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => toast.success(editing?._id === 'new' ? 'Drone added.' : 'Drone updated.', { title: saved.identifier })}
      />
    </div>
  );
}
