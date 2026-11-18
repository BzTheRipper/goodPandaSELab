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
