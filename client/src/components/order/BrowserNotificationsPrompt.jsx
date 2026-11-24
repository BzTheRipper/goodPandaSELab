import { Badge, Button, Card, Icon, InfoTooltip } from '../ui/index.js';
import { useBrowserNotifications } from '../../hooks/useBrowserNotifications.js';
import styles from './BrowserNotifications.module.css';

const LABEL = {
  granted: 'Alerts on',
  denied: 'Alerts blocked',
  default: 'Turn on alerts',
  unsupported: 'Alerts unavailable',
};

/**
 * Opt-in for desktop notifications. Shown on the order page so it is offered exactly when it is
 * useful: while the customer is waiting for a drone and may switch tabs.
 */
export default function BrowserNotificationsPrompt() {
  const { permission, request, supported } = useBrowserNotifications();

  if (!supported || permission === 'granted' || permission === 'denied') return null;

  return (
    <Card as="section" className={styles.card}>
      <span className={styles.icon} aria-hidden="true">
        <Icon name="bell" size={20} />
      </span>
      <div className={styles.text}>
        <strong>Get alerted when your food is close</strong>
        <span>Allow notifications and we’ll ping you when the drone is about to arrive, even in another tab.</span>
      </div>
      <Button
        variant="secondary"
        size="sm"
        icon="bell"
        onClick={() => request()}
        className={styles.action}
        aria-label={LABEL[permission]}
      >
        Turn on alerts
      </Button>
      <InfoTooltip
        label="About alerts"
        content="These are browser notifications, not messages. You can turn them off any time in your browser’s site settings."
        size={15}
      />
    </Card>
  );
}

export { LABEL };
