import { useState } from 'react';
import { orderApi } from '../../api/index.js';
import {
  Button,
  Card,
  Field,
  FormError,
  Icon,
  InfoTooltip,
  Modal,
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
  const [hubRating, setHubRating] = useState(0);
  const [droneRating, setDroneRating] = useState(0);
  const [comment, setComment] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const review = await run(() =>
      orderApi.review(order._id, {
        rating,
        ...(hubRating && { hubRating }),
        ...(droneRating && { droneRating }),
        ...(comment.trim() && { comment: comment.trim() }),
      })
    );
    if (review) {
      onChange({ ...order, review });
      toast.success('Thanks for your review!');
    }
  };

  return (
    <form className={styles.section} onSubmit={submit}>
      <Field label={`How was ${order.restaurant?.name || 'the food'}?`}>
        <StarInput value={rating} onChange={setRating} size={30} />
      </Field>
      {order.hub && (
        <div className={styles.formGrid}>
          <Field label="Pickup hub" hint="Optional — helps other customers choose a hub." optional>
            <StarInput value={hubRating} onChange={setHubRating} size={24} />
          </Field>
          <Field label="Drone flight" hint="Optional — rate how smooth the delivery was." optional>
            <StarInput value={droneRating} onChange={setDroneRating} size={24} />
          </Field>
        </div>
      )}
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
              <div className={styles.formGrid}>
                {review.hubRating > 0 && <small>Hub: {review.hubRating}/5</small>}
                {review.droneRating > 0 && <small>Drone: {review.droneRating}/5</small>}
              </div>
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
        {collected && <Button variant="ghost" icon="receipt" to={`/orders/${order._id}/receipt`}>Receipt</Button>}
      </div>
    </Card>
  );
}

/** Asks the restaurant to cancel; the restaurant decides, so the customer explains why. */
function CancelRequest({ order, onChange, busy }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [validation, setValidation] = useState('');
  const { busy: sending, error, run } = useAction();

  const submit = async (e) => {
    e.preventDefault();
    const text = message.trim();
    if (text.length < 3) {
      setValidation('Add a short reason so the restaurant understands.');
      return;
    }
    const updated = await run(() => orderApi.requestCancellation(order._id, text));
    if (updated) {
      onChange(updated);
      setOpen(false);
      setMessage('');
      toast.warning('The restaurant has your request and will confirm shortly.', { title: 'Cancellation requested' });
    }
  };

  return (
    <>
      <Button variant="dangerGhost" icon="x" disabled={busy} onClick={() => setOpen(true)}>
        Ask to cancel
      </Button>
      <Modal
        open={open}
        onClose={sending ? undefined : () => setOpen(false)}
        title="Ask the restaurant to cancel?"
        description="They prepare food as soon as they accept, so cancelling now is up to them. Add a reason so they can decide quickly."
        size="md"
        dismissible={!sending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={sending}>
              Keep order
            </Button>
            <Button type="submit" form="cancel-request-form" variant="danger" loading={sending}>
              Send request
            </Button>
          </>
        }
      >
        <form id="cancel-request-form" className={styles.section} onSubmit={submit}>
          <Field label="Why do you want to cancel?" hint="The restaurant reads this and may call or message you to sort it out instead.">
            <Textarea
              autoFocus
              rows={3}
              required
              minLength={3}
              maxLength={500}
              value={message}
              placeholder="e.g. I ordered to the wrong hub by mistake."
              onChange={(e) => {
                setMessage(e.target.value);
                setValidation('');
              }}
            />
          </Field>
          <FormError error={validation || error} />
        </form>
      </Modal>
    </>
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
                content={`You can cancel for free until ${order.restaurant?.name || 'the restaurant'} accepts the order. After that, ask them to cancel.`}
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
                content="Once the restaurant accepts, they decide whether to cancel. Ask here and they can approve it — or message you to find another fix."
              />
            </h2>
          </span>
        </div>
        <div className={styles.row}>
          <CancelRequest order={order} onChange={onChange} busy={busy} />
          {onChat && (
            <Button variant="secondary" icon="message" onClick={onChat}>
              Open order chat
            </Button>
          )}
          {order.restaurant?.phone && <PhoneLink label="restaurant" hideNumber phone={order.restaurant.phone} className={styles.contact} />}
        </div>
        <FormError error={error} />
      </Card>
    );
  }

  if (['COLLECTED', 'CANCELLED', 'REJECTED'].includes(order.status)) return <FinishedActions order={order} onChange={onChange} />;

  // The journey copy already explains in-flight orders; extra buttons would be noise.
  return null;
}
