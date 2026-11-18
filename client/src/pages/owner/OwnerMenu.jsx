import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage, assetUrl } from '../../api/http.js';
import { ownerApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Input,
  Media,
  Modal,
  Select,
  Skeleton,
  Textarea,
  Toggle,
  useConfirm,
  useToast,
} from '../../components/ui/index.js';
import { useAction, useAsync } from '../../hooks/useAsync.js';
import { money } from '../../utils/format.js';
import styles from './OwnerMenu.module.css';

const blank = { name: '', description: '', price: '', category: '', image: null };
const IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif';

function ItemModal({ open, item, categories, onClose, onSaved }) {
  const formId = useId();
  const [form, setForm] = useState(blank);
  const [preview, setPreview] = useState('');
  const { busy, error, run } = useAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setForm(
      item
        ? {
            name: item.name || '',
            description: item.description || '',
            price: String(item.price ?? ''),
            category: item.category || '',
            image: null,
          }
        : blank,
    );
    setPreview(item?.imageUrl ? assetUrl(item.imageUrl) : '');
  }, [open, item?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm((f) => ({ ...f, image: file }));
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    const fields = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      category: form.category.trim() || 'General',
      ...(form.image ? { image: form.image } : {}),
    };
    const saved = await run(() => (item ? ownerApi.updateItem(item._id, fields) : ownerApi.createItem(fields)));
    if (saved) {
      onSaved(saved);
      toast.success(item ? 'Menu item updated.' : 'Menu item added.', { title: saved.name });
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={item ? `Edit ${item.name}` : 'Add a menu item'}
      description="Customers see these details on your public menu."
      size="md"
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={busy}>
            {item ? 'Save changes' : 'Add item'}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={submit}>
        <div className={styles.formGrid}>
          <Field label="Name" hint="Keep it short and recognisable. It appears on the public menu and on order tickets.">
            <Input required maxLength={80} value={form.name} placeholder="e.g. Chicken Wrap" onChange={set('name')} autoFocus />
          </Field>
          <Field label="Price (BDT)" hint="The price customers pay. Delivery is added at checkout.">
            <Input required type="number" min="0" max="100000" step="0.01" value={form.price} placeholder="260" onChange={set('price')} />
          </Field>
          <Field label="Category" hint="Groups dishes on your menu and in the customer's category filter.">
            <Input list={`${formId}-categories`} value={form.category} placeholder="General" maxLength={40} onChange={set('category')} />
          </Field>
          <datalist id={`${formId}-categories`}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <Field label="Description" optional hint="A sentence about the dish. Ingredients and allergens are useful here.">
          <Textarea
            rows={3}
            maxLength={500}
            value={form.description}
            placeholder="Fresh herbs, house dressing, toasted bread"
            onChange={set('description')}
          />
        </Field>

        <Field
          label="Image"
          optional
          hint="PNG, JPG, WEBP or GIF, up to 2 MB. Leave empty to keep the current image. Preview updates as soon as you choose a file; it is saved when you save the item."
        >
          <div className={styles.uploadRow}>
            <Media src={preview} alt={form.name ? `${form.name} preview` : 'Item preview'} ratio="4 / 3" className={styles.preview} />
            <div className={styles.uploadText}>
              <Input type="file" accept={IMAGE_TYPES} onChange={onFile} aria-label="Menu item image" />
            </div>
          </div>
        </Field>

        <FormError error={error} />
      </form>
    </Modal>
  );
}

/** Card-based menu manager with instant availability saves and a modal editor. */
export default function OwnerMenu() {
  const { data: items, setData, loading, error, reload } = useAsync(() => ownerApi.listMenu(), []);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState('all');
  const [busyId, setBusyId] = useState('');
  const confirm = useConfirm();
  const toast = useToast();

  const categories = useMemo(() => [...new Set((items || []).map((i) => i.category).filter(Boolean))].sort(), [items]);
  const shown = (items || []).filter((i) => category === 'all' || i.category === category);

  const replace = (updated) => setData((list) => list.map((i) => (i._id === updated._id ? updated : i)));

  const toggleAvailability = async (item) => {
    setBusyId(item._id);
    try {
      const updated = await ownerApi.setAvailability(item._id, !item.isAvailable);
      replace(updated);
      toast.success(updated.isAvailable ? `${item.name} is available again.` : `${item.name} is hidden from customers.`, {
        title: 'Availability saved',
      });
    } catch (err) {
      toast.error(errorMessage(err), { title: 'Couldn’t save availability' });
    } finally {
      setBusyId('');
    }
  };

  const remove = async (item) => {
    const ok = await confirm({
      title: `Delete ${item.name}?`,
      message: 'Customers will no longer see it. Orders already placed are not affected. This can’t be undone.',
      confirmLabel: 'Delete item',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await ownerApi.deleteItem(item._id);
      setData((list) => list.filter((i) => i._id !== item._id));
      toast.success(`${item.name} was deleted.`);
    } catch (err) {
      toast.error(errorMessage(err), { title: 'Couldn’t delete item' });
    }
  };

  const actions = (
    <Button icon="plus" onClick={() => setAdding(true)}>
      Add item
    </Button>
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Menu"
        subtitle="Add dishes, set prices and control what customers can order."
        hint="Availability saves as soon as you flip the switch. Hidden items stay saved but don’t appear on the public menu."
        badge={items?.length ? <Badge tone="neutral">{items.length} items</Badge> : null}
        actions={!loading && !error && items?.length > 0 ? actions : null}
      />

      {loading && (
        <div className={styles.grid} aria-busy="true" aria-label="Loading menu">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={340} />
          ))}
        </div>
      )}

      {!loading && error && (
        <ErrorState
          title="We couldn’t load your menu"
          error={error}
          onRetry={reload}
          action={
            <Button variant="secondary" to="/owner">
              Go to restaurant profile
            </Button>
          }
        />
      )}

      {!loading && !error && items?.length === 0 && (
        <EmptyState icon="utensils" title="Your menu is empty" action={actions}>
          Add your first dish so customers can order from your restaurant.
        </EmptyState>
      )}

      {!loading && !error && items?.length > 0 && (
        <>
          <div className={styles.filters}>
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter by category"
              className={styles.filter}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <span className={styles.count}>
              {shown.length} of {items.length}
            </span>
          </div>

          {shown.length === 0 ? (
            <EmptyState
              icon="inbox"
              title="No items in this category"
              action={
                <Button variant="secondary" onClick={() => setCategory('all')}>
                  Show all
                </Button>
              }
            />
          ) : (
            <div className={styles.grid}>
              {shown.map((item) => (
                <Card as="article" key={item._id} className={styles.itemCard}>
                  <Media src={item.imageUrl ? assetUrl(item.imageUrl) : ''} alt="" ratio="4 / 3" className={styles.media} />
                  <div className={styles.body}>
                    <div className={styles.top}>
                      <h2 className={styles.name}>{item.name}</h2>
                      <Badge tone={item.isAvailable ? 'success' : 'neutral'}>{item.isAvailable ? 'Available' : 'Hidden'}</Badge>
                    </div>
                    <p className={styles.category}>{item.category || 'General'}</p>
                    <p className={styles.description}>{item.description || 'No description yet.'}</p>
                    <div className={styles.priceRow}>
                      <strong>{money(item.price)}</strong>
                      <span className={styles.availability}>
                        <Toggle
                          label={`Available ${item.name}`}
                          checked={Boolean(item.isAvailable)}
                          disabled={busyId === item._id}
                          onChange={() => toggleAvailability(item)}
                        />
                        <span>Available</span>
                      </span>
                    </div>
                    <div className={styles.actions}>
                      <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(item)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="dangerGhost" icon="trash" onClick={() => remove(item)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {items?.length === 0 && error && (
        <p className={styles.helpLink}>
          Need a restaurant profile first? <Link to="/owner">Create one here</Link>.
        </p>
      )}

      <ItemModal
        open={adding || Boolean(editing)}
        item={editing}
        categories={categories}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSaved={(saved) => {
          if (editing) replace(saved);
          else setData((list) => [...(list || []), saved]);
        }}
      />
    </div>
  );
}
