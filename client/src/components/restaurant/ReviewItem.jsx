import { Avatar, Stars } from '../ui/index.js';
import { timeAgo } from '../../utils/format.js';
import styles from './Reviews.module.css';

export default function ReviewItem({ review, restaurantName, children }) {
  return (
    <article className={styles.review}>
      <header className={styles.reviewHead}>
        <Avatar name={review.customer?.name} size={36} />
        <div className={styles.reviewWho}>
          <strong>{review.customer?.name}</strong>
          <span className={styles.reviewMeta}>
            <Stars value={review.rating} size={14} />
            <time dateTime={review.createdAt}>{timeAgo(review.createdAt)}</time>
          </span>
        </div>
      </header>
      {review.comment && <p className={styles.comment}>{review.comment}</p>}
      {review.reply?.text && (
        <div className={styles.reply}>
          <span className={styles.replyLabel}>Reply from {restaurantName || 'the restaurant'}</span>
          <p>{review.reply.text}</p>
        </div>
      )}
      {children}
    </article>
  );
}
