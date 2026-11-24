import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../api/http.js';
import { notificationApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { Button, Card, EmptyState, ErrorState, Skeleton, useToast } from '../../components/ui/index.js';
import { timeAgo } from '../../utils/format.js';
import styles from './Notifications.module.css';

/** Full notification history, beyond the bell's recent-items panel. */
export default function Notifications() {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ unread: 0, page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const load = useCallback(async (page) => {
    setLoading(true);
    setError('');
    try {
      const data = await notificationApi.list({ page, limit: 20 });
      setItems((prev) => (page === 1 ? data.items : [...prev, ...data.items]));
      setMeta({ unread: data.unread, page: data.page, pages: data.pages, total: data.total });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  const markRead = async (n) => {
    if (n.read) return;
    try {
      await notificationApi.markRead(n._id);
      setItems((prev) => prev.map((i) => (i._id === n._id ? { ...i, read: true } : i)));
      setMeta((m) => ({ ...m, unread: Math.max(0, m.unread - 1) }));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await notificationApi.markAllRead();
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      setMeta((m) => ({ ...m, unread: 0 }));
      toast.success('All notifications marked read');
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Notifications"
        subtitle="Order updates, confirmation requests and reviews."
        actions={
          meta.unread > 0 && (
            <Button variant="secondary" icon="check" loading={busy} onClick={markAll}>
              Mark all read
            </Button>
          )
        }
      />

      <Card as="section">
        {loading && items.length === 0 ? (
          <Skeleton height={220} />
        ) : error && items.length === 0 ? (
          <ErrorState title="Couldn’t load notifications" error={error} onRetry={() => load(1)} />
        ) : items.length === 0 ? (
          <EmptyState icon="bell" title="Nothing here yet">
            Order updates will show up here.
          </EmptyState>
        ) : (
          <>
            <ul className={styles.list}>
              {items.map((n) => (
                <li key={n._id} className={`${styles.item} ${n.read ? '' : styles.unread}`}>
                  <button type="button" className={styles.itemButton} onClick={() => markRead(n)}>
                    <span className={styles.itemTitle}>
                      {!n.read && <span className="visually-hidden">Unread: </span>}
                      {n.title}
                    </span>
                    {n.body && <span className={styles.itemBody}>{n.body}</span>}
                    <time className={styles.itemTime} dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString()}>
                      {timeAgo(n.createdAt)}
                    </time>
                  </button>
                  {n.order && (
                    <Button to={`/orders/${n.order}`} size="sm" variant="ghost" className={styles.itemLink}>
                      Open order
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {meta.page < meta.pages && (
              <div className={styles.more}>
                <Button variant="secondary" loading={loading} onClick={() => load(meta.page + 1)}>
                  Load more
                </Button>
                <span className={styles.count}>
                  {items.length} of {meta.total}
                </span>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
