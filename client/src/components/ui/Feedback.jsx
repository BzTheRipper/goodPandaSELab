import Button from './Button.jsx';
import styles from './Feedback.module.css';
import Icon from './Icon.jsx';

const cx = (...c) => c.filter(Boolean).join(' ');
const ALERT_ICON = { info: 'info', success: 'checkCircle', warning: 'alertTriangle', danger: 'alertCircle', brand: 'leaf' };

/** Inline message. Use for errors and required actions; these must stay visible, never in tooltips. */
export function Alert({ tone = 'info', title, icon, action, className, children }) {
  const assertive = tone === 'danger';
  return (
    <div className={cx(styles.alert, styles[tone], className)} role={assertive ? 'alert' : 'status'}>
      <Icon name={icon || ALERT_ICON[tone]} size={18} />
      <div className={styles.alertBody}>
        {title && <div className={styles.alertTitle}>{title}</div>}
        {children}
      </div>
      {action}
    </div>
  );
}

/** Renders nothing until there is an error message. */
export const FormError = ({ error, className }) =>
  error ? (
    <Alert tone="danger" className={className}>
      {error}
    </Alert>
  ) : null;

export function EmptyState({ icon = 'inbox', title, children, action, compact, className, titleAs: Title = 'div' }) {
  return (
    <div className={cx(styles.state, compact && styles.compact, className)}>
      <span className={styles.stateIcon}>
        <Icon name={icon} size={26} />
      </span>
      <Title className={styles.stateTitle}>{title}</Title>
      {children && <p className={styles.stateText}>{children}</p>}
      {action && <div className={styles.stateAction}>{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', error, onRetry, action, compact, className }) {
  return (
    <div className={cx(styles.state, compact && styles.compact, className)} role="alert">
      <span className={cx(styles.stateIcon, styles.danger)}>
        <Icon name="alertTriangle" size={26} />
      </span>
      <div className={styles.stateTitle}>{title}</div>
      {error && <p className={styles.stateText}>{error}</p>}
      {(onRetry || action) && (
        <div className={styles.stateAction}>
          {onRetry && (
            <Button icon="refresh" onClick={onRetry}>
              Try again
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

/** variant: text | rect | circle. Width/height accept any CSS length. */
export function Skeleton({ variant = 'rect', width, height, lines = 1, className, style }) {
  if (variant === 'text') {
    return (
      <span aria-hidden="true" style={{ display: 'block', width }}>
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className={cx(styles.skeleton, styles.skeletonText, className)}
            style={{ width: i === lines - 1 && lines > 1 ? '60%' : '100%', ...style }}
          />
        ))}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cx(styles.skeleton, variant === 'circle' && styles.skeletonCircle, className)}
      style={{ width, height: height ?? width, ...style }}
    />
  );
}
