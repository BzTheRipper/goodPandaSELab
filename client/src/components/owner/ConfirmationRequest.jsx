import { useEffect, useId, useState } from 'react';
import { orderApi } from '../../api/index.js';
import { Alert, Button, Checkbox, Field, FormError, InfoTooltip, Modal, Textarea, useToast } from '../ui/index.js';
import { useAction } from '../../hooks/useAsync.js';
import styles from './ConfirmationRequest.module.css';

export const REQUEST_TYPES = {
  ITEM_UNAVAILABLE: {
    title: 'Some items aren’t available',
    description: 'Pick the items the kitchen can’t make. The customer can continue without them or cancel.',
    trigger: 'Item unavailable',
    toast: 'The customer has been asked to continue or cancel.',
  },
  NOTE_UNMET: {
    title: 'Can’t fully meet the request',
    description: 'Tell the customer which part of their note you can’t meet. They can accept the change or cancel.',
    trigger: 'Note can’t be met',
    toast: 'The customer has been asked to continue or cancel.',
  },
};

/** Owner-only form that pauses an order and asks the customer to choose. */
export default function ConfirmationRequestModal({ order, type, onClose, onChange }) {
  const formId = useId();
  const [message, setMessage] = useState('');
  const [itemIds, setItemIds] = useState([]);
  const [validation, setValidation] = useState('');
  const { busy, error, run } = useAction();
  const toast = useToast();
  const copy = type ? REQUEST_TYPES[type] : REQUEST_TYPES.ITEM_UNAVAILABLE;
  const unavailable = type === 'ITEM_UNAVAILABLE';
  const items = (order?.items || []).filter((i) => !i.removed);

  useEffect(() => {
    if (!type) return;
    setMessage('');
    setItemIds([]);
    setValidation('');
  }, [type]);

  const toggle = (id) => {
    setValidation('');
    setItemIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (unavailable && itemIds.length === 0) {
      setValidation('Select at least one item the kitchen can’t make.');
      return;
    }
    const updated = await run(() =>
      orderApi.requestConfirmation(order._id, { type, message: message.trim(), itemIds: unavailable ? itemIds : [] }),
    );
    if (updated) {
      onChange?.(updated);
      toast.warning(copy.toast, { title: 'Waiting for the customer' });
      onClose();
    }
  };

  return (
    <Modal
      open={Boolean(type && order)}
      onClose={busy ? undefined : onClose}
      title={copy.title}
      description={copy.description}
      size="md"
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={busy}>
            Ask customer to confirm
          </Button>
        </>
      }
    >
      {type && order && (
        <form id={formId} onSubmit={submit} className={styles.form}>
          {type === 'NOTE_UNMET' && order.customerNote && (
            <Alert tone="info" title="The customer’s note">
              “{order.customerNote}”
            </Alert>
          )}

          {unavailable && (
            <div>
              <div className={styles.sectionHead}>
                <div>
                  <span className={styles.title}>
                    Which items are unavailable?
                    <InfoTooltip
                      label="How removed items affect payment"
                      content="The customer only pays for the items that remain."
                      size={14}
                    />
                  </span>
                </div>
              </div>
              <div className={styles.itemList}>
                {items.map((item) => (
                  <Checkbox
                    key={item._id}
                    label={`${item.name} × ${item.quantity}`}
                    checked={itemIds.includes(item._id)}
                    onChange={() => toggle(item._id)}
                  />
                ))}
              </div>
              {items.length > 0 && itemIds.length === items.length && (
                <p className={styles.help}>Every item is selected, so the customer’s only option will be to cancel.</p>
              )}
            </div>
          )}

          <Field label="Message to customer" hint="Explain what’s wrong in your own words. It’s also posted in the order chat.">
            <Textarea
              autoFocus
              rows={3}
              required
              minLength={3}
              maxLength={500}
              value={message}
              placeholder={
                unavailable ? 'e.g. We’ve run out of the prawns today. Sorry about that.' : 'e.g. We can’t make it fully without onions.'
              }
              onChange={(e) => setMessage(e.target.value)}
            />
          </Field>

          <FormError error={validation || error} />
        </form>
      )}
    </Modal>
  );
}

/** Compact trigger used on detail pages and board cards. */
export function ConfirmationRequestButtons({ order, onChange, size = 'sm' }) {
  const [type, setType] = useState(null);
  const supported = ['PLACED', 'ACCEPTED', 'PREPARING'].includes(order.status);
  if (!supported) return null;

  return (
    <>
      <div className={styles.triggers}>
        <Button variant="ghost" size={size} icon="alertTriangle" onClick={() => setType('ITEM_UNAVAILABLE')}>
          {REQUEST_TYPES.ITEM_UNAVAILABLE.trigger}
        </Button>
        <Button variant="ghost" size={size} icon="message" onClick={() => setType('NOTE_UNMET')}>
          {REQUEST_TYPES.NOTE_UNMET.trigger}
        </Button>
      </div>
      <ConfirmationRequestModal order={order} type={type} onClose={() => setType(null)} onChange={onChange} />
    </>
  );
}

export function RequestChangeButton({ order, onChange, size = 'sm' }) {
  const [type, setType] = useState(null);
  if (!['PLACED', 'ACCEPTED', 'PREPARING'].includes(order.status)) return null;

  return (
    <>
      <Button variant="ghost" size={size} icon="alertTriangle" onClick={() => setType('ITEM_UNAVAILABLE')}>
        Request change
      </Button>
      <ConfirmationRequestModal order={order} type={type} onClose={() => setType(null)} onChange={onChange} />
    </>
  );
}
