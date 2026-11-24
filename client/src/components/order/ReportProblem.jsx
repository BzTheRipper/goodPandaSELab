import { useState } from 'react';
import { errorMessage } from '../../api/http.js';
import { orderApi } from '../../api/index.js';
import { useAction, useAsync } from '../../hooks/useAsync.js';
import {
  Alert,
  Badge,
  Button,
  Field,
  FormError,
  Modal,
  Select,
  Textarea,
  useToast,
} from '../ui/index.js';
import styles from './ReportProblem.module.css';

const CATEGORIES = [
  ['MISSING_ITEM', 'An item was missing'],
  ['WRONG_ITEM', 'I received the wrong item'],
  ['COLD_FOOD', 'Food was cold or spoiled'],
  ['NOT_COLLECTED', 'A collection problem'],
  ['PAYMENT', 'A payment problem'],
  ['OTHER', 'Something else'],
];

const tone = (status) => (status === 'RESOLVED' ? 'success' : status === 'REJECTED' ? 'neutral' : 'warning');

/** Customer-side dispute entry for a completed order, plus the outcome once an admin decides. */
export default function ReportProblem({ order }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('MISSING_ITEM');
  const [description, setDescription] = useState('');
  const { data, loading, reload } = useAsync(() => orderApi.disputes(order._id), [order._id]);
  const { busy, error, run } = useAction();
  const toast = useToast();

  const eligible = ['COLLECTED', 'CANCELLED'].includes(order.status);
  const disputes = data || [];
  const active = disputes.find((d) => d.status === 'OPEN') || disputes[0];

  if (!eligible) return null;

  const submit = async (e) => {
    e.preventDefault();
    const created = await run(() => orderApi.openDispute(order._id, { category, description }));
    if (created) {
      toast.success('Your report was sent. Support will review it.', { title: 'Report received' });
      setOpen(false);
      setDescription('');
      await reload();
    }
  };

  return (
    <div className={styles.wrap}>
      {active ? (
        <Alert
          tone={active.status === 'RESOLVED' ? 'success' : active.status === 'REJECTED' ? 'info' : 'warning'}
          title={`Report: ${active.category.replaceAll('_', ' ').toLowerCase()}`}
        >
          <span className={styles.text}>
            <Badge tone={tone(active.status)}>{active.status}</Badge>
            {active.refundAmount > 0 && ` Refund approved: ৳${active.refundAmount.toFixed(2)}.`}
            {active.adminNote ? ` ${active.adminNote}` : ''}
            {active.status === 'OPEN' ? ' We are looking into it.' : ''}
          </span>
        </Alert>
      ) : (
        !loading && (
          <Button variant="ghost" size="sm" icon="alertCircle" onClick={() => setOpen(true)}>
            Report a problem with this order
          </Button>
        )
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Report a problem"
        description="Tell us what went wrong. An admin reviews every report; you will get a notification with the outcome."
      >
        <form className={styles.form} onSubmit={submit}>
          <Field label="What went wrong?">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Details" hint="At least 10 characters. Include what you expected.">
            <Textarea
              rows={4}
              maxLength={1000}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="The drink was missing from the bag and the rice was cold."
            />
          </Field>
          <FormError error={error} />
          <Button type="submit" variant="primary" loading={busy} disabled={description.trim().length < 10}>
            Send report
          </Button>
        </form>
      </Modal>
    </div>
  );
}
