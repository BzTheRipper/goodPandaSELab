import styles from './Spinner.module.css';

export function Spinner({ size = 20, label = 'Loading', className = '' }) {
  return <span className={`${styles.spinner} ${className}`} style={{ '--spinner-size': `${size}px` }} role="status" aria-label={label} />;
}

/** Centered loader for a whole page or section. */
export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className={styles.page}>
      <span className={styles.spinner} aria-hidden="true" />
      <span role="status">{label}</span>
    </div>
  );
}
