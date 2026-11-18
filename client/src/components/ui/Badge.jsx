import { statusMeta } from '../../utils/status.js';
import styles from './Badge.module.css';
import InfoTooltip from './InfoTooltip.jsx';

const cx = (...c) => c.filter(Boolean).join(' ');

/** tone: neutral | brand | success | warning | danger | info */
export function Badge({ tone = 'neutral', dot, live, className, children }) {
  return (
    <span className={cx(styles.badge, styles[tone], className)}>
      {(dot || live) && <span className={cx(styles.dot, live && styles.live)} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Status pill driven by the shared mapping in utils/status.js. kind: order | drone | restaurant | payment. */
export function StatusPill({ kind = 'order', status, showHint = false, className }) {
  const meta = statusMeta(kind, status);
  return (
    <span className={cx(styles.badge, styles[meta.tone], showHint && meta.hint && styles.withHint, className)}>
      <span className={cx(styles.dot, meta.live && styles.live)} aria-hidden="true" />
      {meta.label}
      {showHint && meta.hint && <InfoTooltip content={meta.hint} label={`What "${meta.label}" means`} size={14} />}
    </span>
  );
}

/** Small numeric badge for icons (cart, bell). Hidden when zero. */
export function CountBadge({ count, max = 99, tone = 'danger', className, label }) {
  if (!count) return null;
  return (
    <span className={cx(styles.count, tone === 'brand' && styles.countBrand, className)} aria-label={label}>
      {count > max ? `${max}+` : count}
    </span>
  );
}
