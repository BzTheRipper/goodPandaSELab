import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/http.js';
import { adminApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  FormError,
  Input,
  Select,
  Skeleton,
  Textarea,
  useConfirm,
  useToast,
} from '../../components/ui/index.js';
import { useAction, useAsync } from '../../hooks/useAsync.js';
import { dateTime } from '../../utils/format.js';
import styles from './AdminCampaigns.module.css';

const SEGMENTS = [
  ['all_customers', 'All customers'],
  ['active_customers', 'Customers who ordered in the last 30 days'],
  ['lapsed_30d', 'Lapsed customers (no order in 30 days)'],
  ['all_owners', 'All restaurant owners'],
  ['all_users', 'Everyone'],
];

const segmentLabel = (value) => SEGMENTS.find(([v]) => v === value)?.[1] || value;

/** Compose a push/in-app broadcast to a segment and review what has been sent. */
export default function AdminCampaigns() {
  const [segment, setSegment] = useState('all_customers');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const history = useAsync(() => adminApi.campaigns(), []);
  const { busy, error, run } = useAction();
  const confirm = useConfirm();
  const toast = useToast();

  // Refresh the reachable count whenever the audience changes.
  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setPreviewError('');
    setPreviewing(true);
    adminApi
      .previewCampaign(segment)
      .then((data) => !cancelled && setPreview(data))
      .catch((err) => !cancelled && setPreviewError(errorMessage(err)))
      .finally(() => !cancelled && setPreviewing(false));
    return () => {
      cancelled = true;
    };
  }, [segment]);

  const send = async (e) => {
    e.preventDefault();
    const count = preview?.count ?? 0;
    const ok = await confirm({
      title: 'Send this campaign?',
      message: `“${title}” will be delivered in-app (and by push where enabled) to ${count} ${count === 1 ? 'person' : 'people'}. This cannot be undone.`,
      confirmLabel: 'Send now',
      tone: count > 50 ? 'danger' : 'primary',
    });
    if (!ok) return;
    const campaign = await run(() => adminApi.sendCampaign({ title, body, segment }));
    if (campaign) {
      toast.success(
        `Delivered to ${campaign.delivered} of ${campaign.recipients} ${campaign.recipients === 1 ? 'person' : 'people'} (in-app; push follows each user's settings).`,
        { title: 'Campaign sent' }
      );
      setTitle('');
      setBody('');
      await history.reload();
    }
  };

  const rows = history.data || [];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Campaigns"
        subtitle="Send an in-app and push announcement to a customer segment."
        hint="Delivery respects each user's notification preferences: in-app is stored, push and SMS follow their settings. Campaigns never send email."
      />

      <Card as="form" onSubmit={send} className={styles.compose}>
        <CardHeader title="New campaign" hint="Keep it short: this arrives as a notification title and one line of body." />
        <Field label="Audience">
          <Select value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Campaign audience">
            {SEGMENTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <p className={styles.reach} aria-live="polite">
          {previewing
            ? 'Counting recipients…'
            : preview
              ? `${preview.count} ${preview.count === 1 ? 'recipient' : 'recipients'}${
                  preview.sample?.length ? ` · e.g. ${preview.sample.map((s) => s.name).join(', ')}` : ''
                }`
              : '—'}
        </p>
        <FormError error={previewError} />
        <Field label="Title" hint="Up to 120 characters.">
          <Input value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} placeholder="Weekend drone slots are open" />
        </Field>
        <Field label="Message" hint="Up to 500 characters. Plain text.">
          <Textarea
            rows={3}
            value={body}
            maxLength={500}
            required
            onChange={(e) => setBody(e.target.value)}
            placeholder="Order before 6pm and collect at Banani hub in under 30 minutes."
          />
        </Field>
        {preview?.count === 0 && <Alert tone="warning" title="Nobody matches this audience">Choose a different segment.</Alert>}
        <FormError error={error} />
        <div>
          <Button type="submit" variant="primary" icon="send" loading={busy} disabled={!title.trim() || !body.trim() || !preview?.count}>
            Send campaign
          </Button>
        </div>
      </Card>

      <Card as="section">
        <CardHeader title="Recently sent" hint="The 20 most recent campaigns." />
        {history.loading && !history.data ? (
          <Skeleton height={120} />
        ) : rows.length === 0 ? (
          <EmptyState icon="send" title="No campaigns yet">
            Your first broadcast will be listed here.
          </EmptyState>
        ) : (
          <ul className={styles.list}>
            {rows.map((c) => (
              <li key={c._id} className={styles.row}>
                <div className={styles.info}>
                  <strong>{c.title}</strong>
                  <span className={styles.meta}>{c.body}</span>
                </div>
                <div className={styles.metaCol}>
                  <span>{segmentLabel(c.segment)}</span>
                  <span className={styles.meta}>
                    {c.recipients} targeted · {c.delivered} in-app
                  </span>
                  <span className={styles.meta}>
                    {dateTime(c.sentAt)} · {c.createdBy?.name || 'admin'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
