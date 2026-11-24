import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { PageLoader, ErrorState, Button, Badge, useToast } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { errorMessage } from '../../api/http.js';
import { money } from '../../utils/format.js';
import { orderApi } from '../../api/index.js';
import styles from './Receipt.module.css';

const date = (v) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Printable cash-reconciliation receipt. Uses a print stylesheet so only the paper shows. */
export default function Receipt() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data: r, loading, error, reload } = useAsync(() => orderApi.receipt(id), [id]);
  const { user } = useAuth();
  const toast = useToast();
  const [emailing, setEmailing] = useState(false);

  const emailIt = async () => {
    setEmailing(true);
    try {
      const result = await orderApi.emailReceipt(id);
      if (result.sent) toast.success('Receipt sent to your email.');
      else if (!result.configured) toast.info('Email receipts are not configured on this server.');
      else toast.error('We couldn’t send the email just now. Try again later.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setEmailing(false);
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Button to={`/orders/${id}${params.get('from') ? `?from=${encodeURIComponent(params.get('from'))}` : ''}`} variant="ghost" icon="arrowLeft">
          Back to order
        </Button>
        {user?.role === 'customer' && (
          <Button variant="secondary" icon="mail" loading={emailing} onClick={emailIt}>
            Email receipt
          </Button>
        )}
        <Button variant="primary" icon="printer" onClick={() => window.print()}>
          Print receipt
        </Button>
      </div>

      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState title="Couldn’t load receipt" error={error} onRetry={reload} />
      ) : (
        <article className={styles.paper}>
          <header className={styles.header}>
            <div className={styles.brand}>GoodPanda</div>
            <div className={styles.receiptMeta}>
              <strong>RECEIPT {r.number}</strong>
              <span>Issued {date(r.issuedAt)}</span>
            </div>
          </header>

          <div className={styles.parties}>
            <div>
              <span className={styles.label}>Restaurant</span>
              <strong>{r.restaurant.name}</strong>
              <span>{r.restaurant.address}</span>
              <span>{r.restaurant.phone}</span>
            </div>
            <div>
              <span className={styles.label}>Pickup hub</span>
              <strong>{r.hub.name}</strong>
              <span>{r.hub.address}</span>
            </div>
            <div>
              <span className={styles.label}>Customer</span>
              <strong>{r.customer.name}</strong>
              <span>{r.customer.phone}</span>
            </div>
          </div>

          <table className={styles.items}>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((item, i) => (
                <tr key={i}>
                  <td>{item.name}</td>
                  <td>{item.quantity}</td>
                  <td>{money(item.price)}</td>
                  <td>{money(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.totals}>
            <div><span>Subtotal</span><span>{money(r.subtotal)}</span></div>
            {r.discount > 0 && (
              <div>
                <span>Coupon {r.couponCode && <em>({r.couponCode})</em>}</span>
                <span>−{money(r.discount)}</span>
              </div>
            )}
            <div>
              <span>Delivery fee {r.deliveryDistanceKm != null && <em>({r.deliveryDistanceKm} km)</em>}</span>
              <span>{money(r.deliveryFee)}</span>
            </div>
            <div className={styles.grand}><span>Total (cash)</span><span>{money(r.total)}</span></div>
          </div>

          <div className={styles.settlement}>
            <Badge tone="success" dot>Paid</Badge>
            <span>
              Collected by <strong>{r.collectedBy?.name || 'Hub staff'}</strong> ({r.collectedBy?.role || 'staff'}) on {date(r.timeline.collectedAt)}
            </span>
          </div>

          <footer className={styles.footer}>
            <div className={styles.timelineGrid}>
              <span>Placed: {date(r.timeline.placedAt)}</span>
              <span>Accepted: {date(r.timeline.acceptedAt)}</span>
              <span>Ready: {date(r.timeline.preparedAt)}</span>
              <span>Dispatched: {date(r.timeline.dispatchedAt)}</span>
              <span>Arrived: {date(r.timeline.arrivedAt)}</span>
            </div>
            {r.timeline.prepMinutes != null && <span>Prep time: {r.timeline.prepMinutes} min · Flight: {r.timeline.flightMinutes ?? '—'} min</span>}
            <span className={styles.thanks}>Thank you for choosing GoodPanda.</span>
          </footer>
        </article>
      )}
    </div>
  );
}
