import { useEffect, useId, useState } from 'react';
import { orderApi, ownerApi } from '../../api/index.js';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Icon,
  InfoTooltip,
  Skeleton,
  StatusPill,
  useConfirm,
  useToast,
} from '../ui/index.js';
import { useAction, useAsync } from '../../hooks/useAsync.js';
import { droneSuitability, orderUnits, tripBatteryEstimate } from '../../utils/drone.js';
import styles from './DroneDispatchPanel.module.css';

const cx = (...c) => c.filter(Boolean).join(' ');

/** Owner-side drone picker: route-aware suitability, loading, unloading and dispatch. */
export default function DroneDispatchPanel({ order, onChange }) {
  const baseId = useId();
  const ready = order.status === 'READY_FOR_DRONE';
  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useAsync(() => (ready && !order.drone ? ownerApi.availableDrones() : Promise.resolve([])), [ready, order.drone?._id, order._id]);
  const drones = Array.isArray(data) ? data : [];
  const [selected, setSelected] = useState('');
  const { busy, error: actionError, run } = useAction();
  const toast = useToast();
  const confirm = useConfirm();
  const needed = tripBatteryEstimate(order.drone || null, order);
  const units = orderUnits(order);

  useEffect(() => {
    if (selected && !drones.some((d) => d._id === selected)) setSelected('');
  }, [drones, selected]);

  if (!ready) return null;

  const act = async (fn, message) => {
    const updated = await run(fn);
    if (updated) {
      onChange?.(updated);
      toast.success(message);
    }
  };

  const unload = async () => {
    const ok = await confirm({
      title: 'Unload the drone?',
      message: 'The food stays with you and the drone goes back to the idle fleet. You can load another drone afterwards.',
      confirmLabel: 'Unload drone',
      tone: 'danger',
    });
    if (ok) await act(() => orderApi.unloadDrone(order._id), 'Drone unloaded. The order is still ready for a drone.');
  };

  if (order.drone) {
    const battery = Math.round(order.drone.battery ?? 0);
    return (
      <Card as="section" className={styles.card}>
        <CardHeader
          title="Drone dispatch"
          hint="The food is attached. Dispatch when the drone is ready to leave for the hub."
          actions={<StatusPill kind="drone" status={order.drone.status} />}
        />
        <div className={styles.loaded}>
          <span className={styles.droneIcon} aria-hidden="true">
            <Icon name="drone" size={22} />
          </span>
          <div className={styles.loadedText}>
            <span className={styles.kicker}>Loaded drone</span>
            <strong>{order.drone.identifier || 'Drone assigned'}</strong>
            <span className={styles.loadedMeta}>
              Battery {battery}% · flying to {order.hub?.name || 'the hub'}
            </span>
          </div>
        </div>
        <div className={styles.actions}>
          <Button
            variant="primary"
            icon="drone"
            loading={busy}
            onClick={() => act(() => orderApi.dispatch(order._id), 'Drone dispatched. The customer can follow the flight live.')}
          >
            Dispatch to {order.hub?.name || 'hub'}
          </Button>
          <Button variant="secondary" icon="refresh" disabled={busy} onClick={unload}>
            Unload
          </Button>
          <InfoTooltip
            label="What dispatch does"
            content="Sends the drone on its route to the hub. It flies itself — you can’t steer it — and the customer can follow the flight."
          />
        </div>
        {actionError && (
          <Alert tone="danger" title="Couldn’t update the drone">
            {actionError}
          </Alert>
        )}
      </Card>
    );
  }

  const chosen = drones.find((d) => d._id === selected);
  const suitability = chosen ? droneSuitability(chosen, order) : null;

  return (
    <Card as="section" className={styles.card}>
      <CardHeader
        title="Drone dispatch"
        hint="Choose an available drone that can carry this order and reach the hub, attach the food, then dispatch."
        actions={
          <>
            {needed != null && (
              <InfoTooltip
                label="Battery needed for this trip"
                content={`About ${needed}% battery is needed to fly from the drone to your restaurant and on to ${order.hub?.name || 'the hub'}. Drones are checked again when you attach the food.`}
              />
            )}
            <InfoTooltip
              label="How drone loading works"
              content="Only idle or charging drones are listed, and each must have the capacity and charge for this order. The server re-checks both when you attach the food."
            />
          </>
        }
      />

      <p className={styles.tripLine}>
        <Icon name="drone" size={14} />
        This order needs room for <strong>{units}</strong> item{units === 1 ? '' : 's'}
        {needed != null && <> and about <strong>{needed}%</strong> battery</>}.
      </p>

      {loading && (
        <div className={styles.skeletonList} aria-busy="true" aria-label="Checking available drones">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={52} />
          ))}
        </div>
      )}

      {!loading && loadError && <ErrorState compact title="We couldn’t load the drone list" error={loadError} onRetry={reload} />}

      {!loading && !loadError && drones.length === 0 && (
        <Alert
          tone="warning"
          title="No drone available right now"
          action={
            <Button size="sm" variant="secondary" icon="refresh" onClick={reload}>
              Check again
            </Button>
          }
        >
          Every drone is busy, charging or in maintenance. Try again in a moment.
        </Alert>
      )}

      {!loading && !loadError && drones.length > 0 && (
        <>
          <div className={styles.list} role="radiogroup" aria-label="Available drones">
            {drones.map((d) => {
              const fit = droneSuitability(d, order);
              const battery = Math.round(d.battery ?? 0);
              const id = `${baseId}-${d._id}`;
              return (
                <div key={d._id} className={cx(styles.row, !fit.ok && styles.unfit, selected === d._id && styles.selected)}>
                  <input
                    id={id}
                    type="radio"
                    name={`${baseId}-drone`}
                    checked={selected === d._id}
                    disabled={!fit.ok}
                    onChange={() => setSelected(d._id)}
                  />
                  <div className={styles.rowText}>
                    <label htmlFor={id} className={styles.droneName}>
                      {d.identifier}
                    </label>
                    <span className={styles.batteryLine}>
                      <span className={styles.batteryTrack} aria-hidden="true">
                        <span className={styles.batteryFill} style={{ width: `${battery}%` }} />
                      </span>
                      <span>Battery {battery}%</span>
                    </span>
                  </div>
                  {fit.ok ? (
                    <Badge tone="success">Ready</Badge>
                  ) : (
                    <span className={styles.unfitWrap}>
                      <Badge tone="neutral">Unsuitable</Badge>
                      <InfoTooltip label={`Why ${d.identifier} can’t be used`} content={fit.reason} size={14} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className={styles.actions}>
            <Button
              variant="primary"
              icon="drone"
              loading={busy}
              disabled={!selected || !suitability?.ok}
              onClick={() => act(() => orderApi.loadDrone(order._id, selected), 'Food loaded. Dispatch when you’re ready.')}
            >
              Mark as loaded
            </Button>
            <Button variant="ghost" size="sm" icon="refresh" onClick={reload}>
              Refresh drones
            </Button>
            <InfoTooltip
              label="What marking loaded does"
              content="Attaches the sealed food bag to the chosen drone. The drone waits at your restaurant until you dispatch it."
            />
          </div>
        </>
      )}

      {actionError && (
        <Alert tone="danger" title="Couldn’t load the drone">
          {actionError}
        </Alert>
      )}
    </Card>
  );
}
