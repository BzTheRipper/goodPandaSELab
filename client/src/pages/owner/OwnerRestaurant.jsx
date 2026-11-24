import { useEffect, useState } from 'react';
import { assetUrl } from '../../api/http.js';
import { ownerApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  FormError,
  InfoTooltip,
  Input,
  Media,
  Skeleton,
  StatusPill,
  Textarea,
  Toggle,
  useToast,
} from '../../components/ui/index.js';
import { useAction, useAsync } from '../../hooks/useAsync.js';
import ComplianceDocs from '../../components/owner/ComplianceDocs.jsx';
import styles from './OwnerRestaurant.module.css';

const toForm = (r) => ({
  name: r?.name || '',
  description: r?.description || '',
  phone: r?.phone || '',
  address: r?.address || '',
  categories: r?.categories?.join(', ') || '',
  lat: r?.location?.lat ?? 23.8103,
  lng: r?.location?.lng ?? 90.4125,
});

const IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif';

function StatusBanner({ status }) {
  if (status === 'PENDING') {
    return (
      <Alert
        tone="warning"
        title="Pending approval"
        action={
          <InfoTooltip
            label="How approval works"
            content="GoodPanda admins review new restaurants. You don’t need to submit anything else; you can keep editing your profile and menu while you wait."
            size={15}
          />
        }
      >
        We’re reviewing your restaurant. Customers can’t see it yet, but you can finish setting up your menu.
      </Alert>
    );
  }
  if (status === 'SUSPENDED') {
    return (
      <Alert
        tone="danger"
        title="Restaurant suspended"
        action={
          <InfoTooltip
            label="What suspended means"
            content="A GoodPanda admin hid your restaurant and stopped new orders. Only an admin can reinstate it; opening it here won’t make it visible."
            size={15}
          />
        }
      >
        Customers can’t see or order from you. Contact a GoodPanda admin to ask for reinstatement. You can still edit these details.
      </Alert>
    );
  }
  return (
    <Alert
      tone="success"
      title="Live for customers"
      action={
        <InfoTooltip
          label="About approval"
          content="Approved restaurants appear in search and can take orders whenever the owner switch is open."
          size={15}
        />
      }
    >
      Your restaurant is visible to customers. Use the switch below to pause or resume new orders.
    </Alert>
  );
}

/** Owner profile: approval state, open/closed switch, uploads and editable details. */
export default function OwnerRestaurant() {
  const { data: restaurant, setData, loading, error, reload } = useAsync(() => ownerApi.getRestaurant(), []);
  const [form, setForm] = useState(toForm(null));
  const [files, setFiles] = useState({});
  const [previews, setPreviews] = useState({});
  const [dirty, setDirty] = useState(false);
  const { busy, error: saveError, run } = useAction();
  const toast = useToast();

  useEffect(() => {
    setForm(toForm(restaurant));
    setDirty(false);
  }, [restaurant]);

  useEffect(
    () => () => {
      Object.values(previews).forEach((url) => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    },
    [previews],
  );

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setDirty(true);
  };

  const onFile = (key) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFiles((prev) => ({ ...prev, [key]: file }));
    setPreviews((prev) => ({ ...prev, [key]: URL.createObjectURL(file) }));
    setDirty(true);
  };

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const body = { ...form, ...files };
      const saved = restaurant ? await ownerApi.updateRestaurant(body) : await ownerApi.createRestaurant(body);
      setData(saved);
      setFiles({});
      setPreviews({});
      setDirty(false);
      toast.success(restaurant ? 'Restaurant details saved.' : 'Restaurant created. GoodPanda will review it shortly.', {
        title: restaurant ? 'Saved' : 'Created',
      });
      return saved;
    });
  };

  const toggleOpen = async (next) => {
    const updated = await run(() => ownerApi.setOpen(next));
    if (updated) {
      setData(updated);
      toast.success(next ? 'Your restaurant is open for new orders.' : 'Your restaurant is closed to new orders.', {
        title: next ? 'Open for orders' : 'Closed for orders',
      });
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <PageHeader title="My restaurant" subtitle="Loading your profile…" />
        <Skeleton height={90} />
        <Skeleton height={280} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <PageHeader title="My restaurant" />
        <ErrorState title="We couldn’t load your restaurant" error={error} onRetry={reload} />
      </div>
    );
  }

  const canToggle = Boolean(restaurant) && restaurant.status !== 'SUSPENDED';
  const open = Boolean(restaurant?.isOpen);

  return (
    <div className={styles.page}>
      <PageHeader
        title={restaurant ? restaurant.name : 'Create your restaurant'}
        subtitle={
          restaurant
            ? 'Manage how customers see your restaurant and when you take orders.'
            : 'Add your details to start taking orders on GoodPanda.'
        }
        hint="New restaurants are reviewed by GoodPanda before customers can see them. You can fill in everything else now."
        badge={restaurant ? <StatusPill kind="restaurant" status={restaurant.status} /> : null}
      />

      {restaurant && <StatusBanner status={restaurant.status} />}

      {restaurant && (
        <Card as="section" className={styles.statusCard}>
          <CardHeader
            title="Taking orders"
            hint="Closing is instant and reversible. It stops new orders, but orders already placed keep moving."
            actions={
              <Badge tone={open ? 'success' : 'neutral'} dot>
                {open ? 'Open for orders' : 'Closed'}
              </Badge>
            }
          />
          <div className={styles.switchRow}>
            <div>
              <strong>{open ? 'Your restaurant is open' : 'Your restaurant is closed'}</strong>
              <p className={styles.help}>
                {open
                  ? 'Customers can place orders right now.'
                  : restaurant.status === 'SUSPENDED'
                    ? 'A GoodPanda admin must reinstate the restaurant before it can take orders.'
                    : 'Customers see a closed badge and can’t place new orders.'}
              </p>
            </div>
            <div className={styles.switchControl}>
              <Toggle label="Open for orders" checked={open} disabled={!canToggle || busy} onChange={toggleOpen} />
              <InfoTooltip
                label="What closing does"
                content="Closing hides your restaurant from customers and stops new orders. Orders already placed continue as normal. Only GoodPanda admins can change approval status."
                size={15}
              />
            </div>
          </div>
        </Card>
      )}

      <form className={styles.formCard} onSubmit={submit}>
        <Card as="section">
          <CardHeader title="Restaurant details" hint="These details appear on your public page once your restaurant is approved." />
          <div className={styles.fields}>
            <Field label="Name" hint="Your restaurant name as customers should see it.">
              <Input required maxLength={80} value={form.name} onChange={set('name')} placeholder="e.g. Green Leaf Cafe" />
            </Field>
            <Field label="Phone" hint="Customers can call you from an order page if they need to clarify something.">
              <Input required type="tel" value={form.phone} onChange={set('phone')} placeholder="+880 1712 345678" />
            </Field>
            <Field label="Address" hint="Your street address. The drone picks up from this restaurant, not from the customer.">
              <Input
                required
                minLength={3}
                maxLength={200}
                value={form.address}
                onChange={set('address')}
                placeholder="Road 12, Gulshan 1, Dhaka"
              />
            </Field>
            <Field label="Categories" hint="Comma separated, up to 10. Used in customer search filters.">
              <Input value={form.categories} onChange={set('categories')} placeholder="Healthy, Cafe" />
            </Field>
            <Field label="Description" optional hint="A short introduction shown on your public page.">
              <Textarea
                rows={4}
                maxLength={500}
                value={form.description}
                onChange={set('description')}
                placeholder="Fresh, simple food made to order."
              />
            </Field>
          </div>

          <details className={styles.advanced}>
            <summary>Drone pickup coordinates</summary>
            <p>Set the exact point where drones collect your food. Leave the defaults if you’re not sure.</p>
            <div className={styles.coords}>
              <Field label="Latitude">
                <Input type="number" step="any" value={form.lat} onChange={set('lat')} />
              </Field>
              <Field label="Longitude">
                <Input type="number" step="any" value={form.lng} onChange={set('lng')} />
              </Field>
            </div>
          </details>
        </Card>

        <Card as="section">
          <CardHeader title="Photos" hint="A clear logo and cover help customers recognise your restaurant. Images up to 2 MB each." />
          <div className={styles.uploads}>
            <div className={styles.upload}>
              <Media
                src={previews.logo || (restaurant?.logoUrl ? assetUrl(restaurant.logoUrl) : '')}
                alt="Logo preview"
                ratio="1 / 1"
                icon="store"
                className={styles.logo}
              />
              <Field label="Logo" optional>
                <Input type="file" accept={IMAGE_TYPES} onChange={onFile('logo')} aria-label="Logo image" />
              </Field>
            </div>
            <div className={styles.upload}>
              <Media
                src={previews.cover || (restaurant?.coverUrl ? assetUrl(restaurant.coverUrl) : '')}
                alt="Cover preview"
                ratio="16 / 9"
                icon="utensils"
                className={styles.cover}
              />
              <Field label="Cover" optional>
                <Input type="file" accept={IMAGE_TYPES} onChange={onFile('cover')} aria-label="Cover image" />
              </Field>
            </div>
          </div>
        </Card>

        <FormError error={saveError} />
        <div className={styles.saveRow}>
          <Button type="submit" variant="primary" loading={busy} disabled={Boolean(restaurant) && !dirty}>
            {restaurant ? 'Save changes' : 'Create restaurant'}
          </Button>
          {restaurant && !dirty && <span className={styles.saved}>All changes saved</span>}
        </div>
      </form>
      {restaurant && <ComplianceDocs />}
    </div>
  );
}
