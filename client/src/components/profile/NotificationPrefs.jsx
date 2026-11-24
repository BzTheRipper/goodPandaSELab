import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAction } from '../../hooks/useAsync.js';
import { Card, FormError, Toggle, useToast } from '../ui/index.js';
import styles from './NotificationPrefs.module.css';

const CHANNELS = [
  ['inApp', 'In-app notifications', 'The bell and the notification list inside GoodPanda.'],
  ['push', 'Browser push', 'Order updates while the tab is closed (needs notification permission).'],
  ['sms', 'SMS', 'Text messages for key order events, if the platform has SMS configured.'],
];

/** Profile card for per-channel delivery preferences; the server skips disabled channels. */
export default function NotificationPrefs() {
  const { user, updateNotifications } = useAuth();
  const { busy, error, run } = useAction();
  const toast = useToast();
  const [pending, setPending] = useState(null);
  const prefs = { inApp: true, push: true, sms: true, ...(user.notificationPrefs || {}) };

  const change = async (key, value) => {
    setPending(key);
    const ok = await run(() => updateNotifications({ [key]: value }));
    setPending(null);
    if (ok) toast.success('Notification settings saved');
  };

  return (
    <Card as="section">
      <h2 className={styles.title}>Notifications</h2>
      <p className={styles.hint}>Choose how GoodPanda reaches you. Order updates always appear on the order page.</p>
      <div className={styles.rows}>
        {CHANNELS.map(([key, label, description]) => (
          <div key={key} className={styles.row}>
            <Toggle
              label={label}
              checked={prefs[key] !== false}
              disabled={busy && pending === key}
              onChange={(e) => change(key, e.target.checked)}
            />
            <span className={styles.description}>{description}</span>
          </div>
        ))}
      </div>
      <FormError error={error} />
    </Card>
  );
}
