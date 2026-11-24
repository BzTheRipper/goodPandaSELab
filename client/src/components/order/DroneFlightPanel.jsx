import { Badge, Card, CardHeader, Icon, InfoTooltip, StatusPill } from '../ui/index.js';
import LiveMap from './LiveMap.jsx';
import styles from './DroneFlightPanel.module.css';

const cx = (...c) => c.filter(Boolean).join(' ');
const STAGES = ['READY_FOR_DRONE', 'IN_FLIGHT', 'ARRIVED_AT_HUB'];

const clamp = (n) => Math.min(1, Math.max(0, n));

/** How far along the straight restaurant → hub line the drone currently is. */
function locationProgress(from, to, point) {
  if (!from || !to || !point) return 0;
  const dx = Number(to.lng) - Number(from.lng);
  const dy = Number(to.lat) - Number(from.lat);
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return 0;
  const px = Number(point.lng) - Number(from.lng);
  const py = Number(point.lat) - Number(from.lat);
  return clamp((px * dx + py * dy) / lengthSq);
}

function etaLabel(seconds) {
  if (seconds == null) return null;
  if (seconds <= 0) return 'Arriving now';
  if (seconds < 60) return `~${seconds} sec`;
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes} min`;
}

/** Minutes until the promised arrival, from the timestamp the server stored at dispatch. */
function promisedLabel(etaAt) {
  if (!etaAt) return null;
  const seconds = Math.round((new Date(etaAt).getTime() - Date.now()) / 1000);
  if (seconds <= 0) return 'Arriving now';
  if (seconds < 60) return `in ${seconds} sec`;
  return `in ${Math.ceil(seconds / 60)} min`;
}

const timeOf = (d) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null);

/** Map-less live flight panel: drone identity, battery, promise and an animated restaurant → hub route. */
export default function DroneFlightPanel({ order, telemetry, role = 'customer' }) {
  if (!STAGES.includes(order.status)) return null;

  const drone = order.drone;
  const ready = order.status === 'READY_FOR_DRONE';
  const arrived = order.status === 'ARRIVED_AT_HUB';
  const inFlight = order.status === 'IN_FLIGHT';
  const forCustomer = role === 'customer';
  const battery = Math.round(telemetry?.battery ?? drone?.battery ?? 0);
  const batteryTone = battery < 20 ? 'danger' : battery < 40 ? 'warning' : 'success';

  let progress = 0;
  if (arrived) progress = 1;
  else if (inFlight) {
    progress =
      telemetry?.progress ?? locationProgress(order.restaurant?.location, order.hub?.location, telemetry?.location || drone?.location);
  }
  const pct = Math.round(clamp(progress) * 100);

  // Live telemetry wins; the stored promise is the fallback so the ETA survives a page reload.
  const liveEta = inFlight ? etaLabel(telemetry?.etaSeconds) : null;
  const promised = inFlight ? promisedLabel(order.estimatedArrivalAt) : null;
  const eta = liveEta || promised;
  const promisedTime = timeOf(order.estimatedArrivalAt);
  const arrivedTime = timeOf(order.arrivedAt);

  return (
    <Card as="section" className={styles.card}>
      <CardHeader
        title="Drone delivery"
        hint={
          forCustomer
            ? 'A drone flies your food from the restaurant to the hub you chose. The position and battery update live.'
            : 'A drone carries this order from the restaurant to the hub. Position and battery update live.'
        }
        actions={
          <>
            {inFlight && (
              <InfoTooltip
                label="About the flight"
                content="The drone plans and flies its own route. No action is needed until it lands."
              />
            )}
            {inFlight ? (
              <Badge tone="info" live>
                Live
              </Badge>
            ) : arrived ? (
              <Badge tone="success">Landed</Badge>
            ) : (
              <Badge tone="neutral">Awaiting take-off</Badge>
            )}
          </>
        }
      />

      {inFlight && eta && (
        <div className={styles.etaBanner} role="status">
          <Icon name="clock" size={18} />
          <span>
            {forCustomer ? 'Your food arrives ' : 'Arrives '}
            <strong>{eta}</strong>
            {promisedTime && <span className={styles.etaClock}> · expected by {promisedTime}</span>}
          </span>
        </div>
      )}

      {arrived && (
        <div className={cx(styles.etaBanner, styles.etaArrived)} role="status">
          <Icon name="checkCircle" size={18} />
          <span>
            {forCustomer ? 'Your food is waiting at the hub' : 'Food is at the hub'}
            {arrivedTime && <span className={styles.etaClock}> · landed {arrivedTime}</span>}
          </span>
        </div>
      )}

      <div className={styles.meta}>
        <div className={styles.identity}>
          <span className={styles.droneIcon}>
            <Icon name="drone" size={20} />
          </span>
          <div className={styles.identityText}>
            <span className={styles.eyebrow}>Drone</span>
            <span className={styles.identifier}>{drone?.identifier || 'Not assigned yet'}</span>
          </div>
          {drone && !arrived && <StatusPill kind="drone" status={drone.status} />}
        </div>

        {drone && (
          <div className={styles.batteryWrap}>
            <div className={styles.batteryLabel}>
              <span>Battery</span>
              <strong>{battery}%</strong>
              <InfoTooltip
                content="Live battery level reported by the drone. It drops during the flight."
                label="About drone battery"
                size={14}
              />
            </div>
            <span className={cx(styles.battery, styles[batteryTone])} role="img" aria-label={`Battery ${battery} percent`}>
              <span className={styles.batteryFill} style={{ width: `${battery}%` }} />
            </span>
          </div>
        )}
      </div>

      <LiveMap restaurant={order.restaurant} hub={order.hub} droneLocation={telemetry?.location || drone?.location} />

      <div className={styles.routeLabels}>
        <span className={styles.routeEnd}>
          <span className={styles.routeKicker}>From</span>
          <span className={styles.routeName}>{order.restaurant?.name || 'Restaurant'}</span>
        </span>
        <span className={cx(styles.routeEnd, styles.routeEndRight)}>
          <span className={styles.routeKicker}>To</span>
          <span className={styles.routeName}>{order.hub?.name || 'Pickup hub'}</span>
        </span>
      </div>

      <div className={styles.routeFoot}>
          <span className={styles.progressText}>
            {ready && !drone && 'Waiting for a drone'}
            {ready && drone && 'Ready to take off'}
            {inFlight && `${pct}% of the way`}
            {arrived && 'Landed at the hub'}
          </span>
          {inFlight && eta && <span className={styles.eta}>ETA {eta}</span>}
          {arrived && <span className={styles.arrivedText}>{forCustomer ? 'Your food is here' : 'Food is at the hub'}</span>}
        </div>

      {!drone && (
        <div className={styles.waiting}>
          <span className={styles.waitingDot} aria-hidden="true" />
          {forCustomer
            ? 'Waiting for the restaurant to load your food onto a drone.'
            : role === 'owner'
              ? 'Load a drone below when the food is packed and sealed.'
              : 'Waiting for the restaurant to load the food onto a drone.'}
        </div>
      )}
    </Card>
  );
}
