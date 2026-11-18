import { Card, EmptyState, ErrorState, Skeleton } from '../../components/ui/index.js';
import styles from './Admin.module.css';

/** Consistent placeholder rows for admin list screens. */
export function AdminListSkeleton({ rows = 5 }) {
  return (
    <Card>
      <div className={styles.skeletonRows} aria-busy="true" aria-label="Loading">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={styles.skeletonRow}>
            <div>
              <Skeleton height={16} width="55%" />
              <Skeleton height={12} width="80%" />
            </div>
            <Skeleton height={28} width="100%" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function AdminError({ error, onRetry }) {
  return (
    <Card>
      <ErrorState title="Couldn’t load this section" error={error} onRetry={onRetry} />
    </Card>
  );
}

export function AdminEmpty({ title = 'Nothing here yet', children, icon = 'inbox' }) {
  return (
    <Card>
      <EmptyState icon={icon} title={title}>
        {children}
      </EmptyState>
    </Card>
  );
}

/** Keeps stale data visible during a refresh instead of flashing a full-page loader. */
export function AdminContent({ loading, hasData, error, onRetry, children, empty, skeletonRows }) {
  if (loading && !hasData) return <AdminListSkeleton rows={skeletonRows} />;
  if (error && !hasData) return <AdminError error={error} onRetry={onRetry} />;
  if (!hasData && empty) return <AdminEmpty {...empty} />;
  return children;
}
