import Icon from './Icon.jsx';

/** tel: link with a phone icon. Renders nothing when there is no number. `hideNumber` keeps compact buttons tidy. */
export default function PhoneLink({ label, phone, hideNumber = false, className = '' }) {
  if (!phone) return null;
  return (
    <a href={`tel:${phone.replace(/\s/g, '')}`} className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Icon name="phone" size={16} />
      {label ? `Call ${label}` : phone}
      {label && !hideNumber && <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>({phone})</span>}
    </a>
  );
}
