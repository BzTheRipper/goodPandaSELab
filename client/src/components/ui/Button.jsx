import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import styles from './Button.module.css';
import Icon from './Icon.jsx';
import { Spinner } from './Spinner.jsx';

const cx = (...c) => c.filter(Boolean).join(' ');

/**
 * variant: primary | secondary | ghost | danger | dangerGhost; size: sm | md | lg.
 * Pass `to` to render a router link styled as a button. Icon-only buttons need `aria-label`.
 */
const Button = forwardRef(function Button(
  {
    variant = 'secondary',
    size = 'md',
    block,
    loading,
    disabled,
    icon,
    iconRight,
    iconOnly,
    to,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const cls = cx(
    styles.btn,
    styles[variant],
    size !== 'md' && styles[size],
    block && styles.block,
    iconOnly && styles.iconOnly,
    loading && styles.loading,
    className,
  );
  const iconSize = size === 'sm' ? 16 : 18;
  const inner = (
    <>
      <span className={styles.content}>
        {icon && <Icon name={icon} size={iconSize} />}
        {children}
        {iconRight && <Icon name={iconRight} size={iconSize} />}
      </span>
      {loading && (
        <span className={styles.spin}>
          <Spinner size={16} label="Working" />
        </span>
      )}
    </>
  );

  if (to) {
    return (
      <Link ref={ref} to={to} className={cls} {...rest}>
        {inner}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {inner}
    </button>
  );
});

export default Button;
