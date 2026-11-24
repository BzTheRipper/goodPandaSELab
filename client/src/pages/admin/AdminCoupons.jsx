import { useState } from 'react';
import { errorMessage } from '../../api/http.js';
import { adminApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  FormError,
  Input,
  Select,
  Skeleton,
  Table,
  Toggle,
  useToast,
} from '../../components/ui/index.js';
import { useAction, useAsync } from '../../hooks/useAsync.js';
import { dateTime, money } from '../../utils/format.js';
import styles from './AdminCoupons.module.css';

const EMPTY = {
  code: '',
  description: '',
  type: 'PERCENT',
  value: '10',
  minSubtotal: '0',
  maxDiscount: '',
  usageLimit: '',
  perCustomerLimit: '1',
  endsAt: '',
  restaurant: '',
};

const offer = (c) => (c.type === 'PERCENT' ? `${c.value}%${c.maxDiscount != null ? ` up to ${money(c.maxDiscount)}` : ''}` : `${money(c.value)} off`);

/** Platform-managed discount codes. Owner/restaurant-scoped codes are supported too. */
export default function AdminCoupons() {
  const { data, loading, error, reload } = useAsync(() => adminApi.coupons(), []);
  const restaurants = useAsync(() => adminApi.restaurants(), []);
  const [form, setForm] = useState(EMPTY);
  const [busyId, setBusyId] = useState('');
  const { busy, error: createError, run } = useAction();
  const toast = useToast();
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim(),
      type: form.type,
      value: Number(form.value),
      minSubtotal: Number(form.minSubtotal) || 0,
      perCustomerLimit: Number(form.perCustomerLimit) || 1,
      ...(form.type === 'PERCENT' && form.maxDiscount !== '' && { maxDiscount: Number(form.maxDiscount) }),
      ...(form.usageLimit !== '' && { usageLimit: Number(form.usageLimit) }),
      ...(form.endsAt && { endsAt: new Date(form.endsAt).toISOString() }),
      ...(form.restaurant && { restaurant: form.restaurant }),
    };
    const created = await run(() => adminApi.createCoupon(payload));
    if (created) {
      toast.success(`Coupon ${created.code} created.`);
      setForm(EMPTY);
      await reload();
    }
  };

  const toggle = async (coupon) => {
    setBusyId(coupon._id);
    try {
      await adminApi.updateCoupon(coupon._id, { active: !coupon.active });
      toast.success(coupon.active ? 'Coupon deactivated.' : 'Coupon activated.');
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setBusyId('');
  };

  const columns = [
    {
      key: 'code',
      header: 'Code',
      primary: true,
      render: (c) => (
        <div className={styles.codeCell}>
          <strong className={styles.code}>{c.code}</strong>
          {c.description && <span className={styles.sub}>{c.description}</span>}
        </div>
      ),
    },
    {
      key: 'offer',
      header: 'Offer',
      render: (c) => (
        <span>
          {offer(c)}
          {c.minSubtotal > 0 && <span className={styles.sub}> · min {money(c.minSubtotal)}</span>}
        </span>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      render: (c) => <span className={styles.sub}>{c.restaurant?.name || 'All restaurants'}</span>,
    },
    {
      key: 'used',
      header: 'Used',
      align: 'right',
      render: (c) => (
        <span>
          {c.usedCount}
          {c.usageLimit != null ? ` / ${c.usageLimit}` : ''}
        </span>
      ),
    },
    {
      key: 'ends',
      header: 'Ends',
      render: (c) => <span className={styles.sub}>{c.endsAt ? dateTime(c.endsAt) : 'No end date'}</span>,
    },
    {
      key: 'active',
      header: 'Active',
      render: (c) => (
        <div className={styles.activeCell}>
          <Badge tone={c.active ? 'success' : 'neutral'} dot>
            {c.active ? 'Active' : 'Off'}
          </Badge>
          <Toggle
            label={`Toggle ${c.code}`}
            hideLabel
            checked={c.active}
            disabled={busyId === c._id}
            onChange={() => toggle(c)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Coupons"
        subtitle="Discount codes customers can apply at checkout."
        hint="The server always recomputes the discount from the cart subtotal. Usage limits are reserved atomically, so two simultaneous checkouts cannot exceed them."
      />

      <Card as="form" onSubmit={create} className={styles.compose}>
        <CardHeader title="New coupon" hint="Codes are stored uppercase. Percentage coupons can be capped with a maximum discount." />
        <div className={styles.grid}>
          <Field label="Code">
            <Input value={form.code} maxLength={24} required onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SAVE20" />
          </Field>
          <Field label="Description" optional>
            <Input value={form.description} maxLength={120} onChange={set('description')} placeholder="Weekend offer" />
          </Field>
          <Field label="Type">
            <Select value={form.type} onChange={set('type')}>
              <option value="PERCENT">Percentage</option>
              <option value="FLAT">Flat amount</option>
            </Select>
          </Field>
          <Field label={form.type === 'PERCENT' ? 'Percent (0-100)' : 'Amount (BDT)'}>
            <Input type="number" min="0" step="0.01" value={form.value} required onChange={set('value')} />
          </Field>
          <Field label="Minimum subtotal" optional>
            <Input type="number" min="0" step="0.01" value={form.minSubtotal} onChange={set('minSubtotal')} />
          </Field>
          {form.type === 'PERCENT' && (
            <Field label="Maximum discount" optional hint="Cap the BDT value of a percent coupon.">
              <Input type="number" min="0" step="0.01" value={form.maxDiscount} onChange={set('maxDiscount')} />
            </Field>
          )}
          <Field label="Total uses" optional hint="Leave empty for unlimited.">
            <Input type="number" min="1" step="1" value={form.usageLimit} onChange={set('usageLimit')} />
          </Field>
          <Field label="Uses per customer">
            <Input type="number" min="1" step="1" value={form.perCustomerLimit} onChange={set('perCustomerLimit')} />
          </Field>
          <Field label="Ends" optional>
            <Input type="date" value={form.endsAt} onChange={set('endsAt')} />
          </Field>
          <Field label="Restaurant" optional hint="Leave at “All restaurants” for a platform-wide code.">
            <Select value={form.restaurant} onChange={set('restaurant')}>
              <option value="">All restaurants</option>
              {(restaurants.data || []).map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <FormError error={createError} />
        <div>
          <Button type="submit" variant="primary" icon="plus" loading={busy} disabled={!form.code.trim()}>
            Create coupon
          </Button>
        </div>
      </Card>

      <Card as="section">
        <CardHeader title="All coupons" hint="Newest first." />
        {loading && !data ? (
          <Skeleton height={160} />
        ) : error ? (
          <FormError error={error} />
        ) : (data || []).length === 0 ? (
          <EmptyState icon="cash" title="No coupons yet">
            Create your first discount code above.
          </EmptyState>
        ) : (
          <Table columns={columns} rows={data} rowKey={(c) => c._id} caption="Coupons" />
        )}
      </Card>
    </div>
  );
}
