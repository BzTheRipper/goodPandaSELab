import { useState } from 'react';
import Icon from './Icon.jsx';
import styles from './Stars.module.css';

export function Stars({ value = 0, size = 16 }) {
  const rounded = Math.round(value);
  return (
    <span className={styles.stars} role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={size} fill="currentColor" className={n <= rounded ? styles.on : styles.off} />
      ))}
    </span>
  );
}

export function RatingSummary({ avg = 0, count = 0, compact = false }) {
  if (!count) return <span className={styles.summary}>{compact ? 'New' : 'No reviews yet'}</span>;
  return (
    <span className={styles.summary}>
      <Icon name="star" size={14} fill="currentColor" className={styles.on} />
      <strong>{avg.toFixed(1)}</strong>
      <span className={styles.count}>({count})</span>
    </span>
  );
}

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export function StarInput({ value, onChange, size = 32 }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className={styles.input}>
      <div role="radiogroup" aria-label="Rating" className={styles.stars} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={styles.starBtn}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
          >
            <Icon name="star" size={size} fill="currentColor" className={n <= shown ? styles.on : styles.off} />
          </button>
        ))}
      </div>
      <span className={styles.label}>{LABELS[shown] || 'Tap a star'}</span>
    </div>
  );
}
