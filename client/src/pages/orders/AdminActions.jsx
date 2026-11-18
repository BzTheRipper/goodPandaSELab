import { useState } from 'react';
import { orderApi } from '../../api/index.js';
import ReasonButton from '../../components/ReasonButton.jsx';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  FormError,
  Icon,
  InfoTooltip,
  Input,
  PhoneLink,
  useConfirm,
  useToast,
} from '../../components/ui/index.js';
import { useAction } from '../../hooks/useAsync.js';
import { money } from '../../utils/format.js';
import { isFinalOrder } from '../../utils/status.js';
import styles from './Actions.module.css';

const VALID_CODE = /^\d{4,6}$/;

/** Admin-only tools: hand over an order at the hub, recover a failed flight, or force-cancel. */
export default function AdminActions({ order, onChange }) {
  const [code, setCode] = useState('');
  const { busy, error, run } = useAction();
  const toast = useToast();
  const confirm = useConfirm();
  const final = isFinalOrder(order.status);

  const collect = async (e) => {
    e.preventDefault();
    const ok = await confirm({
      title: 'Hand over this order?',
      message: `Only do this after checking the customer’s code and taking ${money(order.total)} in cash. The order closes and is marked paid.`,
      confirmLabel: 'Collect & mark paid',
      cancelLabel: 'Not yet',
      tone: 'primary',
    });
    if (!ok) return;
    const updated = await run(() => orderApi.collect(order._id, code.trim()));
    if (updated) {
      setCode('');
      onChange(updated);
      toast.success('Order collected and paid. Thanks!', { title: 'Pickup complete' });
    }
  };

  const returnToReady = async () => {
    const ok = await confirm({
      title: 'Send the order back to the restaurant?',
      message:
        'Use this when the drone can’t finish the flight. The order returns to “Ready for drone”, the restaurant is told to re-dispatch, and the customer sees the change.',
      confirmLabel: 'Return to restaurant',
      cancelLabel: 'Keep flying',
      tone: 'danger',
    });
    if (!ok) return;
    const updated = await run(() => orderApi.setStatus(order._id, 'READY_FOR_DRONE', 'Drone issue — returned to restaurant by admin'));
    if (updated) {
      onChange(updated);
      toast.info('The order is back with the restaurant for re-dispatch.', { title: 'Flight cancelled' });
    }
  };

  const forceCancel = async (reason) => {
    const updated = await orderApi.setStatus(order._id, 'CANCELLED', reason);
    onChange(updated);
    toast.info('Order force-cancelled. The customer and restaurant have been told.', { title: 'Order cancelled' });
  };

  return (
    <Card as="section" className={styles.card}>
      <CardHeader
        title="Order controls"
        hint="Hub operator tools for this order. Check the pickup code before handing over food or taking payment."
      />

      {order.needsAdminIntervention && (
        <Alert tone="danger" title="Needs admin intervention">
          {order.interventionReason || 'This order was flagged for help.'}
        </Alert>
      )}

      {order.status === 'ARRIVED_AT_HUB' && (
        <form className={styles.codeForm} onSubmit={collect}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionHeadText}>
              <span className={styles.title}>Collect & take payment</span>
            </span>
          </div>

          <div className={styles.codeRow}>
            <Field
              label="Pickup code"
              className={styles.codeField}
              hint="Ask the customer for the 4–6 digit code on their order page. It is only shown to them."
            >
              <Input
                className={styles.codeInput}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="e.g. 482913"
              />
            </Field>
            <Button type="submit" variant="primary" icon="check" loading={busy} disabled={!VALID_CODE.test(code)}>
              Verify & collect
            </Button>
          </div>

          <span className={styles.collectAmount}>
            <Icon name="cash" size={18} />
            Collect <strong>{money(order.total)}</strong> in cash
          </span>
          <FormError error={error} />
        </form>
      )}

      {order.status === 'IN_FLIGHT' && (
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionHeadText}>
              <span className={styles.title}>
                Drone problem?
                <InfoTooltip
                  label="About returning this order"
                  content="Return the order so the restaurant can load it onto another drone."
                  size={14}
                />
              </span>
            </span>
          </div>
          <div className={styles.row}>
            <Button variant="secondary" icon="refresh" loading={busy} onClick={returnToReady}>
              Return to “Ready for drone”
            </Button>
          </div>
          <FormError error={error} />
        </div>
      )}

      {final ? (
        <Alert tone="info" title="This order is final">
          {order.status === 'COLLECTED'
            ? `Collected and paid${order.paymentStatus === 'PAID' ? '' : ' (payment not marked paid)'}. No further changes are possible.`
            : 'Cancelled or rejected orders can’t be changed. The history above has the reason.'}
        </Alert>
      ) : (
        <div className={styles.row}>
          <ReasonButton
            label="Force-cancel order"
            title="Force-cancel this order?"
            description="Use this only when the order can’t continue — for example a hub closure or an unrecoverable drone failure. Both the customer and restaurant are told."
            placeholder="e.g. Hub closed unexpectedly; customer can’t collect."
            confirmLabel="Force-cancel"
            onConfirm={forceCancel}
          />
        </div>
      )}

      <div className={styles.divider} />
      <div className={styles.row}>
        <span className={styles.contact}>
          <Icon name="user" size={15} />
          Customer <strong>{order.customer?.name || '—'}</strong>
        </span>
        <PhoneLink label="customer" hideNumber phone={order.customer?.phone} className={styles.contact} />
        <span className={styles.contact}>
          <Icon name="store" size={15} />
          <strong>{order.restaurant?.name || 'Restaurant'}</strong>
        </span>
        <PhoneLink label="restaurant" hideNumber phone={order.restaurant?.phone} className={styles.contact} />
      </div>
    </Card>
  );
}
