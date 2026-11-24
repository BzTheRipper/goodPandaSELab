import { useId } from 'react';
import { orderApi } from '../../api/index.js';
import { Badge, Button, Card, FormError, Icon, InfoTooltip, PhoneLink, useConfirm, useToast } from '../ui/index.js';
import { CountBadge } from '../ui/index.js';
import { useAction } from '../../hooks/useAsync.js';
import { money } from '../../utils/format.js';
import styles from './ConfirmationBanner.module.css';

/** The restaurant needs a decision. Deliberately louder than every other card on the page. */
export default function ConfirmationBanner({ order, onChange, onChat, chatUnread = 0 }) {
  const titleId = useId();
  const confirm = useConfirm();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const req = order.confirmationRequest;
  const pending = order.status === 'NEEDS_CUSTOMER_CONFIRMATION' && req && !req.resolution;
  const awaitingOwner = req?.awaiting === 'OWNER';

  if (!pending) return null;

  // A cancellation request is a different conversation: show progress, not a decision form.
  if (awaitingOwner) {
    return (
      <Card as="section" className={styles.banner} aria-labelledby={titleId}>
        <span className={styles.iconWrap} aria-hidden="true">
          <Icon name="clock" size={22} />
        </span>
        <div className={styles.content}>
          <div className={styles.titleRow}>
            <h2 id={titleId} className={styles.title}>
              Cancellation requested
            </h2>
            <Badge tone="info" live>
              With the restaurant
            </Badge>
          </div>
          <blockquote className={styles.message}>“{req.message}”</blockquote>
          <p className={styles.recalc}>
            {order.restaurant?.name || 'The restaurant'} is reviewing your request. You’ll be told as soon as they answer; nothing
            has been charged.
          </p>
          <div className={styles.actions}>
            {order.restaurant?.phone && (
              <span className={styles.action}>
                <PhoneLink label="restaurant" hideNumber phone={order.restaurant.phone} className={styles.callBtn} />
                <InfoTooltip label="Why call the restaurant" content="Calling is the fastest way to sort this out if you need it cancelled urgently." />
              </span>
            )}
            <span className={styles.action}>
              <Button variant="ghost" icon="message" onClick={onChat} className={styles.chatBtn}>
                Chat
                <CountBadge count={chatUnread} tone="brand" />
              </Button>
              <InfoTooltip
                label="Why use chat"
                content="Discussions stay attached to the order, so the restaurant has the full context when they decide."
              />
            </span>
          </div>
        </div>
      </Card>
    );
  }

  const unavailable = order.items.filter((i) => i.unavailable && !i.removed);
  const remaining = order.items.filter((i) => !i.removed && !i.unavailable);
  const canContinue = req.type !== 'ITEM_UNAVAILABLE' || remaining.length > 0;
  const newTotal = remaining.reduce((sum, i) => sum + i.price * i.quantity, 0) + Number(order.deliveryFee || 0);
  const title = req.type === 'ITEM_UNAVAILABLE' ? 'Some items aren’t available' : 'The restaurant needs to change something';

  const continueOrder = async () => {
    const updated = await run(() => orderApi.respondConfirmation(order._id, 'CONTINUE'));
    if (updated) {
      onChange(updated);
      toast.success('The restaurant has been told to continue your order.', { title: 'Thanks for confirming' });
    }
  };

  const cancelOrder = async () => {
    const ok = await confirm({
      title: 'Cancel this order?',
      message: 'The order will stop here and the restaurant will be told. You won’t be charged. This can’t be undone.',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      tone: 'danger',
    });
    if (!ok) return;
    const updated = await run(() => orderApi.respondConfirmation(order._id, 'CANCEL'));
    if (updated) {
      onChange(updated);
      toast.info('Your order was cancelled. You haven’t been charged.', { title: 'Order cancelled' });
    }
  };

  return (
    <Card as="section" className={styles.banner} aria-labelledby={titleId}>
      <span className={styles.iconWrap} aria-hidden="true">
        <Icon name="alertTriangle" size={22} />
      </span>

      <div className={styles.content}>
        <div className={styles.titleRow}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <Badge tone="warning" dot>
            Action needed
          </Badge>
        </div>

        <blockquote className={styles.message}>“{req.message}”</blockquote>

        {req.type === 'ITEM_UNAVAILABLE' && (
          <div className={styles.items}>
            <span className={styles.itemsLabel}>{unavailable.length === 1 ? 'Unavailable item' : 'Unavailable items'}</span>
            <ul>
              {unavailable.map((i) => (
                <li key={i._id}>
                  <Icon name="x" size={13} />
                  {i.name} × {i.quantity}
                </li>
              ))}
            </ul>
            {canContinue && (
              <p className={styles.recalc}>
                Continue to remove {unavailable.length === 1 ? 'it' : 'them'} and update your total to <strong>{money(newTotal)}</strong>.
              </p>
            )}
          </div>
        )}

        {req.type === 'NOTE_UNMET' && (
          <p className={styles.recalc}>
            The restaurant can’t fully meet your note. They’re asking whether you’re happy to continue anyway.
          </p>
        )}

        {!canContinue && (
          <p className={styles.blocked}>
            <Icon name="info" size={15} />
            Every item in this order is unavailable, so the only option is to cancel.
          </p>
        )}

        <div className={styles.actions}>
          {canContinue && (
            <span className={styles.action}>
              <Button variant="primary" icon="check" loading={busy} onClick={continueOrder}>
                Continue order
              </Button>
              <InfoTooltip
                label="What continuing does"
                content={
                  req.type === 'ITEM_UNAVAILABLE'
                    ? 'Removes the unavailable items and keeps the rest of the order going. You pay the updated total at the hub.'
                    : 'Tells the restaurant to continue with the order as discussed. You pay the same total at the hub.'
                }
              />
            </span>
          )}

          <span className={styles.action}>
            <Button variant="dangerGhost" icon="x" disabled={busy} onClick={cancelOrder}>
              Cancel order
            </Button>
            <InfoTooltip
              label="What cancelling does"
              content="Stops the order completely. The restaurant is told right away and you won’t be charged."
            />
          </span>

          {order.restaurant?.phone && (
            <span className={styles.action}>
              <PhoneLink label="restaurant" hideNumber phone={order.restaurant.phone} className={styles.callBtn} />
              <InfoTooltip
                label="Why call the restaurant"
                content="Calls the restaurant directly. Useful if you want to understand the change before deciding."
              />
            </span>
          )}

          <span className={styles.action}>
            <Button variant="ghost" icon="message" onClick={onChat} className={styles.chatBtn}>
              Chat
              <CountBadge count={chatUnread} tone="brand" />
            </Button>
            <InfoTooltip
              label="Why use chat"
              content="Opens your order chat. Keeping the conversation with the order means the restaurant has the full context."
            />
          </span>
        </div>

        <FormError error={error} className={styles.error} />
      </div>
    </Card>
  );
}
