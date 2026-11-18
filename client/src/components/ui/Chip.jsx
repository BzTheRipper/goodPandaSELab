import Icon from './Icon.jsx';
import styles from './Chip.module.css';

/**
 * Pill-shaped button for filters and quick picks. `toggle` (default) exposes aria-pressed;
 * pass toggle={false} for navigation chips and set aria-current yourself.
 */
export default function Chip({ selected = false, toggle = true, icon, className = '', children, ...rest }) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${selected ? styles.selected : ''} ${className}`}
      aria-pressed={toggle ? selected : undefined}
      {...rest}
    >
      {toggle && selected ? <Icon name="check" size={14} strokeWidth={2.6} /> : icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}
