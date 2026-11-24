import { useState } from 'react';
import { adminApi } from '../../api/index.js';
import { errorMessage } from '../../api/http.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { Alert, Badge, Button, Card, Field, FormError, Icon, Input, Modal, StatusPill, useConfirm, useToast } from '../../components/ui/index.js';
import { useAction, useAsync } from '../../hooks/useAsync.js';
import { dateTime } from '../../utils/format.js';
import { AdminContent } from './AdminShared.jsx';
import styles from './Admin.module.css';

const fmtDate = (v) => (v ? dateTime(v).split(',')[0] : '—');

/** Maintenance scheduling and battery-health history across the fleet. */
export default function AdminFleetHealth() {
  const { data, loading, error, reload } = useAsync(() => adminApi.fleetHealth(), []);
  const [schedule, setSchedule] = useState(null);
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const { busy, error: saveError, run } = useAction();
  const toast = useToast();
  const confirm = useConfirm();

  const openSchedule = (drone) => {
    setSchedule(drone);
    // Default to tomorrow at the current clock time, in this browser's timezone.
    const d = new Date(Date.now() + 86400000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setDue(d.toISOString().slice(0, 16));
    setNote(drone.maintenanceNote || '');
  };

  const saveSchedule = async (e) => {
    e.preventDefault();
    const ok = await run(() =>
      adminApi.updateDrone(schedule._id, {
        maintenanceDueAt: due ? new Date(due).toISOString() : null,
        maintenanceNote: note,
      })
    );
    if (ok) {
      toast.success(`Service plan saved for ${schedule.identifier}.`, { title: 'Maintenance scheduled' });
      setSchedule(null);
      await reload();
    }
  };

  const completeService = async (drone) => {
    const ok = await confirm({
      title: `Service ${drone.identifier}?`,
      message: 'The drone leaves maintenance, its service date is stamped and its battery log gains a service event. Make sure inspection is actually complete.',
      confirmLabel: 'Mark serviced',
      tone: 'primary',
    });
    if (!ok) return;
    const result = await run(() => adminApi.updateDrone(drone._id, { status: 'MAINTENANCE', serviceNow: true }));
    if (result) {
      toast.success(`${drone.identifier} is ready for duty.`, { title: 'Service complete' });
      await reload();
    }
  };

  const expanded = (d) => (
    <div className={styles.healthDetail}>
      <strong>Battery history</strong>
      {d.batteryHistory?.length ? (
        <ul>
          {d.batteryHistory
            .slice()
            .reverse()
            .slice(0, 12)
            .map((entry, i) => (
              <li key={i}>
                <span className={styles.mono}>{dateTime(entry.at)}</span>
                <Badge tone="neutral">{entry.event}</Badge>
                <span>{entry.level}%</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className={styles.cellMuted}>No battery events recorded yet.</p>
      )}
      {d.maintenanceNote && <p>Note: {d.maintenanceNote}</p>}
    </div>
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Fleet health"
        subtitle="Service schedules, lifetime usage and battery history."
        hint="Drones request service automatically after a fixed number of trips. Every landing, dock, failure and manual adjustment is logged here."
      />
      <FormError error={error || saveError} />
      <AdminContent
        loading={loading}
        hasData={(data || []).length > 0}
        error={error}
        onRetry={reload}
        skeletonRows={4}
        empty={{ title: 'No drones yet', icon: 'batteryCharging' }}
      >
        <Card>
          {(data || []).map((d) => (
            <details key={d._id} className={styles.healthRow}>
              <summary>
                <span className={styles.mono}>{d.identifier}</span>
                <StatusPill kind="drone" status={d.status} />
                <span>{d.battery}%</span>
                <span>{d.tripsCompleted} trips</span>
                {d.serviceDue ? <Badge tone="danger" dot>Service due</Badge> : <Badge tone="neutral">OK</Badge>}
                <Icon name="chevronDown" size={16} />
              </summary>
              {expanded(d)}
              <div className={styles.rowActions}>
                <Button size="sm" variant="secondary" onClick={() => openSchedule(d)}>Schedule service</Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!d.serviceDue && d.status !== 'MAINTENANCE'}
                  loading={busy}
                  onClick={() => completeService(d)}
                >
                  Mark serviced
                </Button>
              </div>
            </details>
          ))}
          <div className={styles.healthHint}>
            <Alert tone="info" title="Automatic service">
              Drones are flagged for service after a configurable number of completed trips. See fleet settings for the threshold.
            </Alert>
          </div>
        </Card>
      </AdminContent>

      <Modal
        open={Boolean(schedule)}
        onClose={() => setSchedule(null)}
        title={`Schedule service — ${schedule?.identifier || ''}`}
      >
        <form onSubmit={saveSchedule}>
          <Field label="Due date & time" hint="Leave empty to clear the schedule.">
            <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. replace propellers" maxLength={500} />
          </Field>
          <FormError error={saveError} />
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setSchedule(null)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>Save schedule</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
