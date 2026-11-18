import styles from './Avatar.module.css';

// Soft tints that all keep AA contrast with their dark foreground.
const PALETTE = [
  ['#dcfce7', '#14532d'],
  ['#e0f2fe', '#0c4a6e'],
  ['#fef3c7', '#78350f'],
  ['#fce7f3', '#831843'],
  ['#ede9fe', '#4c1d95'],
  ['#ccfbf1', '#134e4a'],
];

const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

const hash = (s = '') => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export default function Avatar({ name, src, size = 36, square, className = '' }) {
  const [bg, fg] = PALETTE[hash(name) % PALETTE.length];
  return (
    <span
      className={`${styles.avatar} ${square ? styles.square : ''} ${className}`}
      style={{ '--avatar-size': `${size}px`, '--avatar-bg': bg, '--avatar-fg': fg }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" /> : initials(name)}
    </span>
  );
}
