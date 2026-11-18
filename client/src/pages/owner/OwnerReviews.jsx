import { useState } from 'react';
import { errorCode } from '../../api/http.js';
import { ownerApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import ReviewItem from '../../components/restaurant/ReviewItem.jsx';
import { Button, Card, Chip, EmptyState, ErrorState, FormError, Skeleton, Stars, Textarea, useToast } from '../../components/ui/index.js';
import { useAction, useAsync } from '../../hooks/useAsync.js';
import { plural } from '../../utils/format.js';
import styles from './OwnerReviews.module.css';

const loadReviews = () =>
  ownerApi.reviews().catch((err) => {
    if (errorCode(err) === 'NOT_FOUND') return null;
    throw err;
  });

function ReplyBox({ review, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(review.reply?.text || '');
  const { busy, error, run } = useAction();

  const save = async (value) => {
    const updated = await run(() => ownerApi.replyReview(review._id, value));
    if (updated) {
      onSaved(updated);
      setEditing(false);
      setText(updated.reply?.text || '');
      toast.success(value ? 'Reply posted' : 'Reply removed');
    }
  };

  if (!editing)
    return (
      <div className={styles.replyActions}>
        <Button
          size="sm"
          variant={review.reply?.text ? 'ghost' : 'secondary'}
          icon={review.reply?.text ? 'edit' : 'message'}
          onClick={() => setEditing(true)}
        >
          {review.reply?.text ? 'Edit reply' : 'Reply'}
        </Button>
        {review.reply?.text && (
          <Button size="sm" variant="dangerGhost" icon="trash" loading={busy} onClick={() => save('')}>
            Remove reply
          </Button>
        )}
      </div>
    );

  return (
    <form
      className={styles.replyForm}
      onSubmit={(e) => {
        e.preventDefault();
        save(text.trim());
      }}
    >
      <label className="visually-hidden" htmlFor={`reply-${review._id}`}>
        Reply to {review.customer?.name}
      </label>
      <Textarea
        id={`reply-${review._id}`}
        rows={3}
        maxLength={1000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Thank them or explain what you'll improve…"
        autoFocus
      />
      <FormError error={error} />
      <div className={styles.replyActions}>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button size="sm" type="submit" variant="primary" loading={busy} disabled={!text.trim()}>
          Post reply
        </Button>
      </div>
    </form>
  );
}

export default function OwnerReviews() {
  const { data, setData, loading, error, reload } = useAsync(loadReviews, []);
  const [filter, setFilter] = useState('all');

  if (loading && !data)
    return (
      <div className={styles.page} aria-busy="true">
        <PageHeader title="Reviews" subtitle="Loading reviews…" />
        <Skeleton height={120} />
        <Skeleton height={160} />
      </div>
    );
  if (error && !data)
    return (
      <Card>
        <ErrorState title="We couldn’t load reviews" error={error} onRetry={reload} />
      </Card>
    );
  if (!data)
    return (
      <Card>
        <EmptyState
          icon="store"
          title="Set up your restaurant first"
          action={
            <Button variant="primary" to="/owner">
              Create restaurant profile
            </Button>
          }
        >
          Customers can review your restaurant after they collect an order.
        </EmptyState>
      </Card>
    );

  const { reviews, ratingAvg, ratingCount } = data;
  const unanswered = reviews.filter((r) => !r.reply?.text).length;
  const breakdown = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => r.rating === n).length }));
  const shown =
    filter === 'unanswered'
      ? reviews.filter((r) => !r.reply?.text)
      : filter === 'all'
        ? reviews
        : reviews.filter((r) => r.rating === filter);
  const onSaved = (updated) => setData((d) => ({ ...d, reviews: d.reviews.map((r) => (r._id === updated._id ? updated : r)) }));

  return (
    <div className={styles.page}>
      <PageHeader title="Reviews" subtitle="What customers say after collecting their food. Replies are public." />

      {ratingCount === 0 ? (
        <Card>
          <EmptyState icon="star" title="No reviews yet">
            Customers can rate an order once they’ve collected it from the hub.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className={styles.summary}>
            <div className={styles.score}>
              <span className={styles.scoreValue}>{ratingAvg.toFixed(1)}</span>
              <Stars value={ratingAvg} size={20} />
              <span className={styles.scoreCount}>{plural(ratingCount, 'rating')}</span>
            </div>
            <ul className={styles.breakdown} aria-label="Rating breakdown">
              {breakdown.map(({ n, count }) => (
                <li key={n}>
                  <span className={styles.breakLabel}>{n}★</span>
                  <span className={styles.breakTrack}>
                    <span className={styles.breakFill} style={{ width: `${reviews.length ? (count / reviews.length) * 100 : 0}%` }} />
                  </span>
                  <span className={styles.breakCount}>{count}</span>
                </li>
              ))}
            </ul>
          </Card>

          <div className={styles.filters} role="group" aria-label="Filter reviews">
            <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
              All
            </Chip>
            <Chip selected={filter === 'unanswered'} onClick={() => setFilter('unanswered')}>
              Needs reply ({unanswered})
            </Chip>
            {[5, 4, 3, 2, 1].map((n) => (
              <Chip key={n} selected={filter === n} onClick={() => setFilter(filter === n ? 'all' : n)}>
                {n}★
              </Chip>
            ))}
          </div>

          {shown.length === 0 ? (
            <Card>
              <EmptyState compact icon="search" title="No reviews match this filter" />
            </Card>
          ) : (
            <div className={styles.list}>
              {shown.map((r) => (
                <ReviewItem key={r._id} review={r} restaurantName="you">
                  <ReplyBox review={r} onSaved={onSaved} />
                </ReviewItem>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
