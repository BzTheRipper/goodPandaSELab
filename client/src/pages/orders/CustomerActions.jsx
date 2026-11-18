import { useState } from 'react';
import { orderApi } from '../../api/index.js';
import {
  Button,
  Card,
  Field,
  FormError,
  InfoTooltip,
  PhoneLink,
  StarInput,
  Stars,
  Textarea,
  useConfirm,
  useToast,
} from '../../components/ui/index.js';
import { useAction } from '../../hooks/useAsync.js';
import { useReorder } from '../../hooks/useReorder.js';
import styles from './Actions.module.css';

function ReviewForm({ order, onChange }) {
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const review = await run(() => orderApi.review(order._id, { rating, ...(comment.trim() && { comment: comment.trim() }) }));
    if (review) {
      onChange({ ...order, review });
      toast.success('Thanks for your review!');
    }
  };

  return (
    <form className={styles.section} onSubmit={submit}>
      <StarInput value={rating} onChange={setRating} />
      <Field label="Tell others about it" optional>
        <Textarea
          rows={3}
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Taste, portion, packaging…"
        />
      </Field>
      <FormError error={error} />
      <div className={styles.row}>
        <Button type="submit" variant="primary" icon="star" loading={busy} disabled={!rating}>
          Submit review
        </Button>
      </div>
    </form>
  );
}

function FinishedActions({ order, onChange }) {
  const { reorder, busyId } = useReorder();
  const collected = order.status === 'COLLECTED';
  const review = order.review && typeof order.review === 'object' ? order.review : null;

  return (
    <Card as="section" className={styles.card}>
      {collected && (
        <>
          <div className={styles.sectionHead}>
            <span className={styles.sectionHeadText}>
              <h2 className={styles.title}>{review ? 'Your review' : `How was ${order.restaurant?.name || 'your food'}?`}</h2>
            </span>
          </div>
          {review ? (
            <div className={styles.section}>
              <Stars value={review.rating} size={20} />
              {review.comment && <p className={styles.reviewText}>{review.comment}</p>}
              {review.reply?.text && (
                <p className={styles.reviewReply}>
                  <strong>Reply from {order.restaurant?.name || 'the restaurant'}:</strong> {review.reply.text}
                </p>
              )}
            </div>
          ) : (
            <ReviewForm order={order} onChange={onChange} />
          )}
          <div className={styles.divider} />
        </>
      )}
      <div className={styles.row}>
        <Button variant="secondary" icon="repeat" loading={busyId === order._id} onClick={() => reorder(order)}>
          Order again
        </Button>
      </div>
    </Card>
  );
}

/**
 * Customer-side order actions. The confirmation request and pickup code have their own
 * cards on the page; this only covers cancelling and the "need help?" states.
 */
export default function CustomerActions({ order, onChange, onChat }) {
  const confirm = useConfirm();
  const toast = useToast();
  const { busy, error, run } = useAction();

  const cancel = async () => {
    const ok = await confirm({
      title: 'Cancel this order?',
      message: `This tells ${order.restaurant?.name || 'the restaurant'} to stop before they accept. You won’t be charged.`,
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      tone: 'danger',
    });
    if (!ok) return;
    const updated = await run(() => orderApi.setStatus(order._id, 'CANCELLED', 'Cancelled by customer'));
    if (updated) {
      onChange(updated);
      toast.info('Your order was cancelled. You haven’t been charged.', { title: 'Order cancelled' });
    }
  };

  if (order.status === 'PLACED') {
    return (
      <Card as="section" className={styles.card}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionHeadText}>
            <h2 className={styles.title}>
              Changed your mind?
              <InfoTooltip
                label="About cancelling"
                content={`You can cancel for free until ${order.restaurant?.name || 'the restaurant'} accepts the order. After that, talk to them in chat.`}
              />
            </h2>
          </span>
        </div>
        <div className={styles.row}>
          <Button variant="dangerGhost" icon="x" loading={busy} onClick={cancel}>
            Cancel order
          </Button>
          {order.restaurant?.phone && <PhoneLink label="restaurant" hideNumber phone={order.restaurant.phone} className={styles.contact} />}
        </div>
        <FormError error={error} />
      </Card>
    );
  }

  if (['ACCEPTED', 'PREPARING'].includes(order.status)) {
    return (
      <Card as="section" className={styles.card}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionHeadText}>
            <h2 className={styles.title}>
              Need to change something?
              <InfoTooltip
                label="About changes"
                content="Once the restaurant accepts, only they can cancel. Message or call them and they’ll sort it out with you."
              />
            </h2>
          </span>
        </div>
        <div className={styles.row}>
          {onChat && (
            <Button variant="secondary" icon="message" onClick={onChat}>
              Open order chat
            </Button>
          )}
          {order.restaurant?.phone && <PhoneLink label="restaurant" hideNumber phone={order.restaurant.phone} className={styles.contact} />}
        </div>
      </Card>
    );
  }

  if (['COLLECTED', 'CANCELLED', 'REJECTED'].includes(order.status)) return <FinishedActions order={order} onChange={onChange} />;

  // The journey copy already explains in-flight orders; extra buttons would be noise.
  return null;
}
