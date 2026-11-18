import { Link } from 'react-router-dom';
import { Icon, InfoTooltip } from '../ui/index.js';
import styles from './PageHeader.module.css';

/** Consistent page title row. `hint` adds an (i) tooltip next to the title. */
export default function PageHeader({ title, subtitle, hint, back, actions, badge }) {
  return (
    <div className={styles.header}>
      <div className={styles.text}>
        {back && (
          <Link to={back.to} className={styles.back}>
            <Icon name="chevronLeft" size={16} />
            {back.label}
          </Link>
        )}
        <h1 className={styles.title}>
          {title}
          {hint && <InfoTooltip content={hint} label="About this page" />}
          {badge}
        </h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
