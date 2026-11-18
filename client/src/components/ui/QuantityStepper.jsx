import { forwardRef } from 'react';
import Icon from './Icon.jsx';
import styles from './QuantityStepper.module.css';

/**
 * − value + control. At 1 (with min 0) the minus becomes a remove button.
 * The forwarded ref points at the "+" button so callers can move focus there after "Add".
 */
const QuantityStepper = forwardRef(function QuantityStepper(
  { value, onChange, min = 0, max = 50, label, size = 'md', className = '' },
  ref,
) {
  const removes = min === 0 && value <= 1;
  return (
    <div className={`${styles.stepper} ${styles[size]} ${className}`} role="group" aria-label={`Quantity of ${label}`}>
      <button
        type="button"
        className={`${styles.btn} ${removes ? styles.remove : ''}`}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={removes ? `Remove ${label}` : `One less ${label}`}
      >
        <Icon name={removes ? 'trash' : 'minus'} size={size === 'sm' ? 14 : 16} />
      </button>
      <output className={styles.value} aria-live="polite">
        {value}
      </output>
      <button
        ref={ref}
        type="button"
        className={styles.btn}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={`One more ${label}`}
      >
        <Icon name="plus" size={size === 'sm' ? 14 : 16} />
      </button>
    </div>
  );
});

export default QuantityStepper;
