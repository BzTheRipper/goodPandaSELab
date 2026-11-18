import { useId, useState } from 'react';
import { Button, Field, FormError, Modal, Textarea } from './ui/index.js';
import { useAction } from '../hooks/useAsync.js';

/**
 * A button that opens a small confirmation dialog with a required reason.
 * `onConfirm(reason)` should throw on failure (the API does this automatically); the dialog
 * stays open and shows the error, then closes on success.
 */
export default function ReasonButton({
  label,
  title,
  description,
  placeholder = 'Tell the customer why…',
  confirmLabel = 'Confirm',
  onConfirm,
  required = true,
  variant = 'dangerGhost',
  icon = 'x',
  size = 'md',
  className,
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();

  const close = () => {
    if (busy) return;
    setOpen(false);
    setReason('');
  };

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const result = await onConfirm(reason.trim());
      if (result !== false) {
        setOpen(false);
        setReason('');
      }
    });
  };

  return (
    <>
      <Button variant={variant} icon={icon} size={size} className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={title || label}
        description={description}
        size="sm"
        dismissible={!busy}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Back
            </Button>
            <Button type="submit" form={formId} variant="danger" loading={busy}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit}>
          <Field label="Reason" hint="The customer sees this on their order page and in the order history.">
            <Textarea
              autoFocus
              rows={3}
              required={required}
              minLength={required ? 3 : undefined}
              maxLength={300}
              value={reason}
              placeholder={placeholder}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <FormError error={error} />
        </form>
      </Modal>
    </>
  );
}
