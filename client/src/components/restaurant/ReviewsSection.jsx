import { useState } from 'react';
import { restaurantApi } from '../../api/index.js';
import { Button, ErrorState, Skeleton, Stars } from '../ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import ReviewItem from './ReviewItem.jsx';
import styles from './Reviews.module.css';

const PREVIEW = 4;

export default function ReviewsSection({ restaurant }) {
  const { data, loading, error, reload } = useAsync(() => restaurantApi.reviews(restaurant._id), [restaurant._id]);
  const [expanded, setExpanded] = useState(false);

  const shown = expanded ? data : data?.slice(0, PREVIEW);
  return (
    <section className={styles.section} aria-labelledby="reviews-title">
      <div className={styles.sectionHead}>
        <h2 id="reviews-title" className={styles.sectionTitle}>
          Reviews
        </h2>
        <div className={styles.score}>
          <span className={styles.scoreValue}>{restaurant.ratingAvg.toFixed(1)}</span>
          <Stars value={restaurant.ratingAvg} />
          <span className={styles.scoreCount}>{restaurant.ratingCount} ratings</span>
        </div>
      </div>
      {loading ? (
        <div className={styles.list}>
          <Skeleton height={96} />
          <Skeleton height={96} />
        </div>
      ) : error ? (
        <ErrorState title="We couldn’t load reviews" error={error} onRetry={reload} />
      ) : (
        <>
          <div className={styles.list}>
            {shown.map((r) => (
              <ReviewItem key={r._id} review={r} restaurantName={restaurant.name} />
            ))}
          </div>
          {data.length > PREVIEW && (
            <Button variant="ghost" onClick={() => setExpanded((v) => !v)} className={styles.more}>
              {expanded ? 'Show fewer reviews' : `Show all ${data.length} reviews`}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
