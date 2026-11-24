import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/http.js';
import { useSocket } from '../../context/SocketContext.jsx';
import { useDismiss } from '../../hooks/useDismiss.js';
import { timeAgo } from '../../utils/format.js';
import { Button, CountBadge, EmptyState, Icon, useToast } from '../ui/index.js';
import styles from './Popover.module.css';

export default function NotificationBell() {
  const { notifications, unread, markRead, markAllRead } = useSocket();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);

  const openNotification = (n) => {
    markRead(n).catch((err) => toast.error(errorMessage(err)));
    close();
    if (n.type === 'NEW_REVIEW') navigate('/owner/reviews');
    else if (n.order) navigate(`/orders/${n.order}`);
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" size={22} />
        <CountBadge count={unread} className={styles.badge} />
      </button>
      {open && (
        <div className={`${styles.panel} ${styles.wide}`} role="region" aria-label="Notifications">
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>Notifications</span>
            {unread > 0 && (
              <Button variant="ghost" size="sm" icon="check" onClick={() => markAllRead().catch((err) => toast.error(errorMessage(err)))}>
                Mark all read
              </Button>
            )}
          </div>
          {notifications.length === 0 ? (
            <EmptyState icon="bell" title="You're all caught up" compact>
              Order updates will show up here.
            </EmptyState>
          ) : (
            <div className={styles.list}>
              {notifications.map((n) => (
                <button
                  type="button"
                  key={n._id}
                  className={`${styles.notif} ${n.read ? '' : styles.unread}`}
                  onClick={() => openNotification(n)}
                >
                  <span className={styles.notifDot} aria-hidden="true" />
                  <span className={styles.notifText}>
                    <span className={styles.notifTitle}>
                      {!n.read && <span className="visually-hidden">Unread: </span>}
                      {n.title}
                    </span>
                    {n.body && <span className={styles.notifBody}>{n.body}</span>}
                    <time className={styles.notifTime} dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString()}>
                      {timeAgo(n.createdAt)}
                    </time>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className={styles.panelFoot}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                close();
                navigate('/notifications');
              }}
            >
              View all notifications
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
