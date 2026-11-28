import { Children, cloneElement, forwardRef, isValidElement, useId, useState } from 'react';
import styles from './Form.module.css';
import Icon from './Icon.jsx';
import InfoTooltip from './InfoTooltip.jsx';

const cx = (...c) => c.filter(Boolean).join(' ');

/**
 * Label + control + error. `hint` goes into an info tooltip; `error` is always shown inline.
 * The single child control receives id / aria-invalid / aria-describedby automatically.
 */
export function Field({ label, hint, error, optional, className, children }) {
  const id = useId();
  const errorId = `${id}-error`;
  const child = Children.only(children);
  const controlId = (isValidElement(child) && child.props.id) || id;
  const control = isValidElement(child)
    ? cloneElement(child, {
        id: controlId,
        'aria-invalid': error ? true : child.props['aria-invalid'],
        'aria-describedby': cx(child.props['aria-describedby'], error && errorId) || undefined,
      })
    : child;

  return (
    <div className={cx(styles.field, className)}>
      <div className={styles.labelRow}>
        <label htmlFor={controlId}>{label}</label>
        {optional && <span className={styles.optional}>(optional)</span>}
        {hint && <InfoTooltip content={hint} label={`About ${typeof label === 'string' ? label.toLowerCase() : 'this field'}`} size={15} />}
      </div>
      {control}
      {error && (
        <p id={errorId} className={styles.error}>
          <Icon name="alertCircle" size={14} />
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef(function Input({ icon, right, size, className, ...rest }, ref) {
  return (
    <div className={styles.control}>
      {icon && (
        <span className={styles.leading}>
          <Icon name={icon} size={18} />
        </span>
      )}
      <input
        ref={ref}
        className={cx(styles.input, size === 'sm' && styles.sm, icon && styles.withIcon, right && styles.withRight, className)}
        {...rest}
      />
      {right && <span className={styles.trailing}>{right}</span>}
    </div>
  );
});

export const PasswordInput = forwardRef(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      ref={ref}
      {...props}
      type={visible ? 'text' : 'password'}
      right={
        <button
          type="button"
          className={styles.reveal}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
        </button>
      }
    />
  );
});

/** Bangladeshi mobile: +880 followed by 10 digits starting 13–19 (operator prefixes 013–019). */
export const BD_MOBILE_DIGITS = /^1[3-9]\d{8}$/;

/** "+8801712345678", "01712345678" or "1712345678" (spaces/dashes ignored) → "1712345678". */
export const bdMobileDigits = (value = '') =>
  String(value).replace(/[\s-]/g, '').replace(/^(\+?880|0)/, '').replace(/\D/g, '').slice(0, 10);

/**
 * Phone box with a fixed +880 in front: the user types only the 10 digits after it.
 * `value` and `onChange(value)` use the full stored form ("+8801712345678", or "" when empty).
 * The browser blocks the form from submitting until the number matches BD_MOBILE_DIGITS.
 */
export const PhoneInput = forwardRef(function PhoneInput({ value, onChange, className, ...rest }, ref) {
  const digits = bdMobileDigits(value);
  return (
    <div className={styles.control}>
      <span className={styles.prefix} aria-hidden="true">
        +880
      </span>
      <input
        ref={ref}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="1712345678"
        // No maxLength: the browser would count "0", "-" or a pasted "+880" before they are
        // stripped and cut off real digits. bdMobileDigits() already limits it to 10 digits.
        pattern="1[3-9][0-9]{8}"
        title="10 digits after +880, starting with 13–19 (for example 1712345678)"
        className={cx(styles.input, styles.withPrefix, className)}
        {...rest}
        value={digits}
        onChange={(e) => {
          // Keep digits only; a pasted "+880…" or "01…" number is trimmed to the 10 digits.
          const next = bdMobileDigits(e.target.value);
          onChange?.(next ? `+880${next}` : '', e);
        }}
      />
    </div>
  );
});

export const Textarea = forwardRef(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(styles.textarea, className)} {...rest} />;
});

export const Select = forwardRef(function Select({ size, className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(styles.select, size === 'sm' && styles.sm, className)} {...rest}>
      {children}
    </select>
  );
});

export function Checkbox({ label, disabled, className, ...rest }) {
  return (
    <label className={cx(styles.check, disabled && styles.disabled, className)}>
      <input type="checkbox" className={styles.checkInput} disabled={disabled} {...rest} />
      <span>{label}</span>
    </label>
  );
}

/** Accessible switch. `label` can be visually hidden with `hideLabel`. */
export function Toggle({ label, hideLabel, checked, onChange, disabled, className, ...rest }) {
  return (
    <label className={cx(styles.toggle, disabled && styles.disabled, className)}>
      <input
        type="checkbox"
        role="switch"
        className={styles.switch}
        checked={checked}
        aria-checked={checked}
        onChange={(e) => onChange?.(e.target.checked, e)}
        disabled={disabled}
        {...rest}
      />
      <span className={hideLabel ? 'visually-hidden' : undefined}>{label}</span>
    </label>
  );
}
