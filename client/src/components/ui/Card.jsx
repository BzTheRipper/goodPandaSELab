import { Link } from 'react-router-dom';
import styles from './Card.module.css';
import InfoTooltip from './InfoTooltip.jsx';

const cx = (...c) => c.filter(Boolean).join(' ');

/** Surface container. padding: md | sm | none. Pass `to` for a clickable card link. */
export function Card({ as: Tag = 'section', to, padding = 'md', className, children, ...rest }) {
  const cls = cx(
    styles.card,
    padding === 'md' && styles.pad,
    padding === 'sm' && styles.padSm,
    padding === 'none' && styles.flush,
    to && styles.interactive,
    className,
  );
  if (to) {
    return (
      <Link to={to} className={cls} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, hint, actions, as: H = 'h2' }) {
  return (
    <div className={styles.header}>
      <H className={styles.title}>
        {title}
        {hint && <InfoTooltip content={hint} label={`About ${typeof title === 'string' ? title.toLowerCase() : 'this section'}`} />}
      </H>
      {actions}
    </div>
  );
}
