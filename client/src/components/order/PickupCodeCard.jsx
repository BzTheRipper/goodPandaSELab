import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Icon, InfoTooltip, useToast } from '../ui/index.js';
import { money } from '../../utils/format.js';
import styles from './PickupCodeCard.module.css';

/** The moment the order matters most: a big, copyable code and the exact pickup details. */
export default function PickupCodeCard({ order, onRefresh }) {
  const titleId = useId();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!['ARRIVED_AT_HUB', 'COLLECTED'].includes(order.status)) return null;

  if (order.status === 'COLLECTED') {
    return (
      <Card as="section" className={styles.collected} aria-labelledby={titleId}>
        <span className={styles.doneIcon}>
          <Icon name="checkCircle" size={28} />
        </span>
        <div className={styles.doneText}>
          <span className={styles.eyebrow}>Pickup complete</span>
          <h2 id={titleId} className={styles.doneTitle}>
            Order collected
          </h2>
          <p className={styles.hubLine}>
            <Icon name="mapPin" size={15} />
            {order.hub.name} · {order.hub.address}
          </p>
          <div className={styles.doneMeta}>
            <Badge tone="success" dot>
              Paid {money(order.total)}
            </Badge>
            <span className={styles.muted}>Thanks for choosing GoodPanda. Enjoy your meal!</span>
          </div>
        </div>
      </Card>
    );
  }

  if (!order.pickupCode) {
    return (
      <Card as="section" aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.hiddenTitle}>
          Pickup code
        </h2>
        <Alert
          tone="info"
          title="Your pickup code is being generated"
          action={
            onRefresh && (
              <Button size="sm" variant="secondary" icon="refresh" onClick={onRefresh}>
                Refresh
              </Button>
            )
          }
        >
          This usually takes a few seconds. The hub can’t release your food until the code appears.
        </Alert>
      </Card>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(order.pickupCode);
      setCopied(true);
      toast.success('Pickup code copied', { title: 'Ready to show the hub' });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error('Couldn’t copy the code. Select the digits and copy them manually.');
    }
  };

  return (
    <Card as="section" className={styles.card} aria-labelledby={titleId}>
      <span className={styles.decor} aria-hidden="true">
        <Icon name="drone" size={152} />
      </span>

      <div className={styles.head}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          Pickup code
        </span>
        <Badge tone="success" live>
          Ready to collect
        </Badge>
      </div>

      <div className={styles.codeRow}>
        <h2 id={titleId} className={styles.code} aria-label={`Pickup code ${String(order.pickupCode).split('').join(' ')}`}>
          {order.pickupCode}
        </h2>
        <Button variant="secondary" icon={copied ? 'check' : 'copy'} onClick={copy} aria-live="polite" className={styles.copyBtn}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      <div className={styles.hubInfo}>
        <span className={styles.hubIcon}>
          <Icon name="mapPin" size={18} />
        </span>
        <div>
          <div className={styles.hubName}>{order.hub.name}</div>
          <div className={styles.hubAddress}>{order.hub.address}</div>
        </div>
      </div>

      <div className={styles.payRow}>
        <span className={styles.pay}>
          <Icon name="cash" size={18} />
          Pay <strong>{money(order.total)}</strong> in cash
        </span>
        <InfoTooltip
          label="How collection works"
          content="Show this code to the hub operator. They check it, hand over your food and take the cash payment. The code is only shown to you."
        />
      </div>

      <p className={styles.hint}>
        Show the code at the hub to collect your food and pay.
        <InfoTooltip
          label="About the pickup code"
          content="The code proves this order is yours. Keep it on screen or copied when you reach the hub. It can’t be used by anyone else."
          size={15}
        />
      </p>
    </Card>
  );
}
