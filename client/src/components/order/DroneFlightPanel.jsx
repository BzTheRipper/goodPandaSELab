import { Badge, Card, CardHeader, Icon, InfoTooltip, StatusPill } from '../ui/index.js';
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
  if (seconds == null) return 'Estimating…';
  if (seconds <= 0) return 'Arriving now';
  if (seconds < 60) return `~${seconds} sec`;
  return `~${Math.ceil(seconds / 60)} min`;
}

/** Map-less live flight panel: drone identity, battery and an animated restaurant → hub route. */
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
  const eta = inFlight ? etaLabel(telemetry?.etaSeconds) : null;

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

      <div className={styles.route}>
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

        <div className={styles.track}>
          <span className={styles.line} aria-hidden="true" />
          <span className={styles.lineFill} style={{ width: `${pct}%` }} aria-hidden="true" />
          <span className={cx(styles.node, styles.startNode)} aria-hidden="true">
            <Icon name="store" size={12} />
          </span>
          <span className={cx(styles.node, styles.endNode)} aria-hidden="true">
            <Icon name="mapPin" size={12} />
          </span>
          {drone && (
            <span
              className={cx(styles.droneMarker, inFlight && styles.flying)}
              style={{ left: `${pct}%` }}
              role="img"
              aria-label={`Drone ${drone.identifier}`}
            >
              <Icon name="drone" size={19} />
            </span>
          )}
        </div>

        <div className={styles.routeFoot}>
          <span className={styles.progressText}>
            {ready && !drone && 'Waiting for a drone'}
            {ready && drone && 'Ready to take off'}
            {inFlight && `${pct}% of the way`}
            {arrived && 'Landed at the hub'}
          </span>
          {inFlight && <span className={styles.eta}>ETA {eta}</span>}
          {arrived && <span className={styles.arrivedText}>{forCustomer ? 'Your food is here' : 'Food is at the hub'}</span>}
        </div>
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
