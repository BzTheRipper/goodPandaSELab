import { orderApi } from '../../api/index.js';
import ReasonButton from '../../components/ReasonButton.jsx';
import DroneDispatchPanel from '../../components/owner/DroneDispatchPanel.jsx';
import { ConfirmationRequestButtons } from '../../components/owner/ConfirmationRequest.jsx';
import { Alert, Button, Card, CardHeader, FormError, Icon, InfoTooltip, PhoneLink, useConfirm, useToast } from '../../components/ui/index.js';
import { useAction } from '../../hooks/useAsync.js';
import styles from './Actions.module.css';

const NEXT = {
  PLACED: {
    status: 'ACCEPTED',
    label: 'Accept order',
    icon: 'check',
    help: 'Accepting sends the order to the kitchen. The customer sees it right away.',
    toast: 'Order accepted. The customer knows you’re on it.',
  },
  ACCEPTED: {
    status: 'PREPARING',
    label: 'Start preparing',
    icon: 'utensils',
    help: 'Tell the customer cooking has started.',
    toast: 'The customer can see that you’re preparing the food.',
  },
  PREPARING: {
    status: 'READY_FOR_DRONE',
    label: 'Food ready for drone',
    icon: 'drone',
    help: 'Packed and sealed? Mark it ready, then load it onto a drone below.',
    toast: 'Marked ready. Load it onto a drone next.',
  },
};

const ACTIVE = ['PLACED', 'ACCEPTED', 'PREPARING', 'NEEDS_CUSTOMER_CONFIRMATION', 'READY_FOR_DRONE'];

/** The customer asked to cancel; the restaurant answers instead of being blocked. */
function CancelRequestPanel({ order, onChange }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { busy, error, run } = useAction();
  const req = order.confirmationRequest;

  const answer = async (decision) => {
    if (decision === 'CANCEL') {
      const ok = await confirm({
        title: 'Cancel this order?',
        message: 'The order stops here and the customer is told immediately. Nothing is charged.',
        confirmLabel: 'Cancel order',
        cancelLabel: 'Keep order',
        tone: 'danger',
      });
      if (!ok) return;
    }
    const updated = await run(() => orderApi.respondCancellation(order._id, decision, decision === 'CONTINUE' ? 'Already being prepared' : undefined));
    if (updated) {
      onChange(updated);
      toast.info(
        decision === 'CANCEL' ? 'Order cancelled. The customer has been told.' : 'You’re continuing the order. The customer has been told.',
        { title: 'Request answered' }
      );
    }
  };

  return (
    <Card as="section" className={styles.card}>
      <CardHeader title="Cancellation request" hint="The customer asked you to cancel this order after you accepted it." />
      <Alert tone="warning" title="The customer wants to cancel">
        “{req.message}”
      </Alert>
      <p className={styles.help}>
        If the food hasn’t started or you can absorb the loss, accept. If it’s already cooking, call or message the customer and
        continue — the order keeps moving either way.
      </p>
      <div className={styles.row}>
        <Button variant="primary" icon="check" loading={busy} onClick={() => answer('CONTINUE')}>
          Keep the order going
        </Button>
        <Button variant="dangerGhost" icon="x" loading={busy} onClick={() => answer('CANCEL')}>
          Accept the cancellation
        </Button>
        <PhoneLink label="customer" phone={order.customer?.phone} />
      </div>
      <FormError error={error} />
    </Card>
  );
}

/** Owner controls on the shared order page. The board uses the same actions in a compact form. */
export default function OwnerActions({ order, onChange, onChat }) {
  const toast = useToast();
  const { busy, error, run } = useAction();
  const next = NEXT[order.status];
  const agreed = order.confirmationRequest?.resolution === 'CONTINUED';
  const canCancel = order.status === 'NEEDS_CUSTOMER_CONFIRMATION' || (agreed && ['ACCEPTED', 'PREPARING'].includes(order.status));
  const cancelRequest = order.status === 'NEEDS_CUSTOMER_CONFIRMATION' && order.confirmationRequest?.awaiting === 'OWNER';

  if (!ACTIVE.includes(order.status)) return null;

  if (cancelRequest) return <CancelRequestPanel order={order} onChange={onChange} />;

  const advance = async () => {
    const updated = await run(() => orderApi.setStatus(order._id, next.status));
    if (updated) {
      onChange(updated);
      toast.success(next.toast);
    }
  };

  const reasonAction = async (status, reason, message) => {
    const updated = await orderApi.setStatus(order._id, status, reason);
    onChange(updated);
    toast.info(message, { title: 'Order updated' });
  };

  return (
    <Card as="section" className={styles.card}>
      <CardHeader title="Restaurant actions" hint="Every change updates the customer’s tracking page immediately." />

      {order.needsAdminIntervention && (
        <Alert tone="warning" title="GoodPanda admin is helping">
          {order.interventionReason || 'This order needs an admin to step in.'}
        </Alert>
      )}

      {next && (
        <div className={styles.next}>
          <div className={styles.nextText}>
            <span className={styles.kicker}>Next step</span>
            <span className={styles.nextTitle}>
              {next.label}
              <InfoTooltip label="About this step" content={next.help} size={14} />
            </span>
          </div>
          <div className={styles.nextAction}>
            <Button variant="primary" icon={next.icon} loading={busy} onClick={advance}>
              {next.label}
            </Button>
          </div>
        </div>
      )}

      {order.status === 'NEEDS_CUSTOMER_CONFIRMATION' && (
        <Alert tone="info" title="Waiting for the customer">
          They need to continue or cancel before you can carry on. Message or call them if they haven’t decided.
        </Alert>
      )}

      <div className={styles.request}>
        <div className={styles.requestTitle}>
          <Icon name="alertTriangle" size={16} />
          Can’t make the order as placed?
          <InfoTooltip
            label="About confirmation requests"
            content="Pause the order and ask the customer instead of cancelling it yourself. They choose to continue (with any unavailable items removed) or cancel. Nothing is charged."
            size={14}
          />
        </div>
        <ConfirmationRequestButtons order={order} onChange={onChange} />
      </div>

      <div className={styles.row}>
        {order.status === 'PLACED' && (
          <ReasonButton
            label="Reject order"
            title="Reject this order?"
            description="The customer is told immediately. If the order could still go ahead with changes, use a confirmation request instead."
            placeholder="e.g. We’re closing early tonight because of a kitchen issue."
            confirmLabel="Reject order"
            onConfirm={(reason) => reasonAction('REJECTED', reason, 'Order rejected. The customer has been told.')}
          />
        )}
        {canCancel && (
          <ReasonButton
            label="Cancel order"
            title="Cancel this order?"
            description={
              agreed
                ? 'The customer already agreed to continue, so cancelling now needs a clear reason.'
                : 'This stops the order while the customer decides. Tell them why so they know what happened.'
            }
            placeholder="e.g. We can’t prepare this safely tonight."
            confirmLabel="Cancel order"
            onConfirm={(reason) => reasonAction('CANCELLED', reason, 'Order cancelled. The customer has been told why.')}
          />
        )}
      </div>

      {order.status === 'READY_FOR_DRONE' && <DroneDispatchPanel order={order} onChange={onChange} />}

      <FormError error={error} />

      <div className={styles.divider} />
      <div className={styles.row}>
        <span className={styles.contact}>
          <Icon name="user" size={15} />
          Customer <strong>{order.customer?.name || '—'}</strong>
        </span>
        <PhoneLink label="customer" phone={order.customer?.phone} className={styles.callBtn} />
        {onChat && (
          <Button variant="ghost" size="sm" icon="message" onClick={onChat}>
            Message customer
          </Button>
        )}
      </div>
    </Card>
  );
}
