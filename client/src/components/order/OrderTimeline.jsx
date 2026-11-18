import Icon from '../ui/Icon.jsx';
import { ORDER_FLOW, statusMeta } from '../../utils/status.js';
import { dateTime, timeShort } from '../../utils/format.js';
import styles from './OrderTimeline.module.css';

const cx = (...c) => c.filter(Boolean).join(' ');
const FAILED = new Set(['CANCELLED', 'REJECTED']);

/**
 * The seven happy-path steps with timestamps from statusHistory.
 * Cancelled / rejected orders stop at the step they reached and end in a terminal node.
 * NEEDS_CUSTOMER_CONFIRMATION pauses the timeline at the last real step.
 */
export default function OrderTimeline({ order }) {
  const byStatus = new Map();
  (order.statusHistory || []).forEach((h) => {
    if (!byStatus.has(h.status)) byStatus.set(h.status, h);
  });

  const failed = FAILED.has(order.status);
  const paused = order.status === 'NEEDS_CUSTOMER_CONFIRMATION';
  const collected = order.status === 'COLLECTED';
  const lastMain = [...(order.statusHistory || [])].reverse().find((h) => ORDER_FLOW.includes(h.status));
  const pauseAt = order.confirmationRequest?.previousStatus;
  const reached =
    paused && ORDER_FLOW.includes(pauseAt) ? ORDER_FLOW.indexOf(pauseAt) : Math.max(0, ORDER_FLOW.indexOf(lastMain?.status || 'PLACED'));

  const steps = failed ? ORDER_FLOW.slice(0, reached + 1) : ORDER_FLOW;
  const terminal = failed ? statusMeta('order', order.status) : null;
  const terminalEntry = failed ? byStatus.get(order.status) : null;

  return (
    <div className={styles.wrap}>
      <ol className={styles.list} aria-label="Order progress">
        {steps.map((step, i) => {
          const meta = statusMeta('order', step);
          const at = byStatus.get(step)?.at;
          const done = failed || collected ? i <= reached : i < reached;
          const current = !failed && i === reached;
          const hasRail = i < steps.length - 1 || failed;

          return (
            <li
              key={step}
              className={cx(styles.step, done && styles.done, current && !collected && styles.current, current && paused && styles.paused)}
              aria-current={current ? 'step' : undefined}
            >
              <div className={styles.railCol}>
                <span className={styles.marker} aria-hidden="true">
                  {done || collected ? <Icon name="check" size={12} strokeWidth={3} /> : current ? <span className={styles.dot} /> : null}
                </span>
                {hasRail && <span className={styles.rail} aria-hidden="true" />}
              </div>
              <div className={styles.text}>
                <span className={styles.label}>
                  <span className="visually-hidden">{done ? 'Completed: ' : current ? 'Current step: ' : 'Upcoming: '}</span>
                  {meta.label}
                </span>
                {at ? (
                  <time className={styles.time} dateTime={at} title={dateTime(at)}>
                    {timeShort(at)}
                  </time>
                ) : (
                  <span className={styles.timeMuted} aria-hidden="true">
                    —
                  </span>
                )}
              </div>
            </li>
          );
        })}

        {failed && (
          <li className={cx(styles.step, styles.terminal)} aria-current="step">
            <div className={styles.railCol}>
              <span className={cx(styles.marker, styles.terminalMarker)} aria-hidden="true">
                <Icon name="x" size={12} strokeWidth={3} />
              </span>
            </div>
            <div className={styles.text}>
              <span className={styles.label}>{terminal.label}</span>
              {terminalEntry?.at ? (
                <time className={styles.time} dateTime={terminalEntry.at} title={dateTime(terminalEntry.at)}>
                  {timeShort(terminalEntry.at)}
                </time>
              ) : null}
            </div>
          </li>
        )}
      </ol>

      {paused && (
        <p className={styles.pauseNote}>
          <Icon name="alertTriangle" size={15} />
          The order is paused here while the restaurant waits for your decision.
        </p>
      )}
    </div>
  );
}
