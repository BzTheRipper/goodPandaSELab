import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/http.js';
import { orderApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  Select,
  StatusPill,
  useConfirm,
  useToast,
} from '../../components/ui/index.js';
import QrScanner from '../../components/order/QrScanner.jsx';
import { useSocketEvent } from '../../context/SocketContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAction, useAsync } from '../../hooks/useAsync.js';
import { useOrderList } from '../../hooks/useOrder.js';
import { money, shortId } from '../../utils/format.js';
import { AdminEmpty, AdminListSkeleton } from './AdminShared.jsx';
import styles from './Admin.module.css';

const VALID_CODE = /^\d{6}$/;

export default function AdminPickup() {
  const [params, setParams] = useSearchParams();
  const orderId = params.get('order') || '';
  const [code, setCode] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [result, setResult] = useState(null);
  const confirm = useConfirm();
  const toast = useToast();
  const { user } = useAuth();

  const ready = useOrderList({ status: 'ARRIVED_AT_HUB' }, { pageSize: 100 });
  const detail = useAsync(() => (orderId ? orderApi.detail(orderId) : Promise.resolve(null)), [orderId]);
  const { busy, run } = useAction();

  useSocketEvent('order:updated', (order) => {
    if (orderId && String(order._id) === String(orderId)) detail.setData(order);
  });

  useEffect(() => {
    if (!orderId && !ready.loading && ready.orders.length > 0) {
      setParams({ order: ready.orders[0]._id }, { replace: true });
    }
  }, [orderId, ready.loading, ready.orders, setParams]);

  useEffect(() => {
    setCode('');
    setFeedbackError('');
    setResult(null);
  }, [orderId]);

  const options = useMemo(() => {
    const byId = new Map();
    ready.orders.forEach((o) => byId.set(o._id, o));
    if (detail.data) byId.set(detail.data._id, detail.data);
    return [...byId.values()];
  }, [ready.orders, detail.data]);

  const order = detail.data || ready.orders.find((o) => o._id === orderId) || null;
  const wrongStatus = Boolean(order && order.status !== 'ARRIVED_AT_HUB' && !(result && String(result.order?._id) === String(order._id)));
  const canSubmit = Boolean(orderId && order && !wrongStatus);

  const selectOrder = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('order', id);
    else next.delete('order');
    setParams(next, { replace: true });
  };

  const verify = async (payload, label) => {
    if (!canSubmit) return;
    const ok = await confirm({
      title: 'Hand over this order?',
      message: `Only continue after ${label} and collecting ${money(order.total)} in cash. The order will close and be marked paid.`,
      confirmLabel: 'Verify & collect',
      cancelLabel: 'Not yet',
      tone: 'primary',
    });
    if (!ok) return;

    await run(async () => {
      try {
        const updated = await orderApi.collect(orderId, payload);
        setResult({ order: updated });
        setCode('');
        toast.success('Order collected and paid.', { title: 'Pickup verified' });
        await Promise.all([detail.reload(), ready.reload()]);
      } catch (err) {
        const message = errorMessage(err);
        setFeedbackError(message);
        toast.error(message, { title: 'Couldn’t verify pickup' });
      }
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = code.replace(/\D/g, '').slice(0, 6);
    setFeedbackError('');
    setResult(null);
    if (!VALID_CODE.test(trimmed)) {
      setFeedbackError('Enter the 6-digit pickup code from the customer’s order page.');
      return;
    }
    await verify({ pickupCode: trimmed }, 'checking the customer’s code');
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Verify pickup code"
        subtitle="Hand orders over at the hub and record cash payment."
        hint="Ask the customer for the code on their order page. A correct code marks the order collected and paid; codes are never shown to admins."
        back={user?.role === 'hub_operator' ? { to: '/hub', label: 'Hub queue' } : { to: '/admin/orders', label: 'All orders' }}
      />

      <div className={styles.pickupPage}>
        <Card className={styles.pickupCard}>
          <CardHeader title="Pickup verification" hint="Codes are 6 digits and can only be used while the order is at the hub." />

          {ready.loading && options.length === 0 ? (
            <AdminListSkeleton rows={3} />
          ) : (
            <>
              <Field label="Order" hint="Only orders waiting at a hub can be collected.">
                <Select value={orderId} aria-label="Order to collect" onChange={(e) => selectOrder(e.target.value)}>
                  <option value="">Select an order</option>
                  {options.map((o) => (
                    <option key={o._id} value={o._id}>
                      {shortId(o._id)} · {o.restaurant?.name || 'Restaurant'} · {o.hub?.name || 'Hub'}
                    </option>
                  ))}
                </Select>
              </Field>

              {(detail.error || ready.error) && (
                <ErrorState
                  compact
                  title="Couldn’t load pickup orders"
                  error={detail.error || ready.error}
                  onRetry={() => {
                    ready.reload();
                    detail.reload();
                  }}
                />
              )}

              {!(detail.error || ready.error) && !orderId && options.length === 0 ? (
                <AdminEmpty icon="cash" title="No orders waiting at a hub">
                  When a drone arrives, the order appears here for verification.
                </AdminEmpty>
              ) : !order ? (
                <Alert tone="warning" title="Choose an order">
                  Pick an order from the list to enter its pickup code.
                </Alert>
              ) : (
                <>
                  <div className={styles.pickupOrder}>
                    <div className={styles.pickupOrderText}>
                      <strong>{shortId(order._id)}</strong>
                      <span className={styles.cellMuted}>
                        {order.restaurant?.name || 'Restaurant'} → {order.hub?.name || 'Hub'}
                      </span>
                    </div>
                    <StatusPill status={order.status} />
                    <span className={styles.recentTotal}>{money(order.total)} due in cash</span>
                  </div>

                  {wrongStatus && (
                    <Alert tone="warning" title="Not ready for pickup">
                      This order is no longer waiting at the hub, so its code can’t be used.
                    </Alert>
                  )}

                  <form onSubmit={submit}>
                    <div className={styles.pickupIntro}>
                      <h2>Scan QR or enter the code</h2>
                    </div>
                    {canSubmit && (
                      <div className={styles.scannerBlock}>
                        <QrScanner
                          busy={busy}
                          onScan={(token) => {
                            setFeedbackError('');
                            setResult(null);
                            verify({ pickupToken: token }, 'scanning the customer’s QR code');
                          }}
                        />
                      </div>
                    )}
                    <Field
                      label="Pickup code"
                      hint="Ask to see the 6-digit code on the customer’s order page. It changes for each order."
                    >
                      <Input
                        className={styles.pickupCodeField}
                        value={code}
                        onChange={(e) => {
                          setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                          setFeedbackError('');
                        }}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="482913"
                        aria-label="Pickup code"
                        disabled={!canSubmit}
                      />
                    </Field>

                    <div className={styles.pickupFeedback} aria-live="polite">
                      {feedbackError && (
                        <Alert tone="danger" title="Verification failed">
                          {feedbackError}
                        </Alert>
                      )}
                      {result && (
                        <Alert tone="success" title="Pickup verified">
                          {shortId(result.order._id)} is collected and paid. The customer and restaurant have been notified.
                        </Alert>
                      )}
                    </div>

                    <Button type="submit" variant="primary" size="lg" className={styles.pickupSubmit} loading={busy} disabled={!canSubmit}>
                      Verify code & collect {order ? money(order.total) : ''}
                    </Button>
                  </form>
                </>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
