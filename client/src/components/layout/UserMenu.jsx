import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { assetUrl } from '../../api/http.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useDismiss } from '../../hooks/useDismiss.js';
import { Avatar, Icon } from '../ui/index.js';
import styles from './Popover.module.css';

const LINKS = {
  customer: [
    ['/orders', 'My orders', 'receipt'],
    ['/?saved=1', 'Saved restaurants', 'heart'],
  ],
  owner: [['/owner', 'My restaurant', 'store']],
  admin: [['/admin', 'Dashboard', 'grid']],
};

export default function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.userTrigger}
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={user.name} src={assetUrl(user.avatarUrl)} size={34} />
        <span className={styles.userName}>{user.name.split(' ')[0]}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className={styles.panel}>
          <div className={styles.who}>
            <div className={styles.whoName}>{user.name}</div>
            <div className={styles.whoEmail}>{user.email}</div>
          </div>
          <nav className={styles.menu} aria-label="Account">
            <Link to="/profile" className={styles.item} onClick={close}>
              <Icon name="user" size={18} /> Profile
            </Link>
            {(LINKS[user.role] || []).map(([to, label, icon]) => (
              <Link key={to} to={to} className={styles.item} onClick={close}>
                <Icon name={icon} size={18} /> {label}
              </Link>
            ))}
            <div className={styles.sep} />
            <button
              type="button"
              className={`${styles.item} ${styles.danger}`}
              onClick={() => {
                close();
                logout();
                navigate('/login');
              }}
            >
              <Icon name="logOut" size={18} /> Log out
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
