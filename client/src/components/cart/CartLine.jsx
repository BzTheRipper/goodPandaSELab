import { assetUrl } from '../../api/http.js';
import { money } from '../../utils/format.js';
import { Badge, Button, Media, QuantityStepper } from '../ui/index.js';
import styles from './CartLine.module.css';

/** One cart row. `unavailable` swaps the stepper for a Remove button; `children` renders under the name (e.g. a note). */
export default function CartLine({ item, onQuantity, unavailable, children }) {
  return (
    <li className={`${styles.line} ${unavailable ? styles.unavailable : ''}`}>
      <Media src={assetUrl(item.imageUrl)} ratio="1 / 1" iconSize={22} className={styles.thumb} />
      <div className={styles.info}>
        <div className={styles.name}>{item.name}</div>
        <div className={styles.unit}>{unavailable ? <Badge tone="danger">No longer available</Badge> : `${money(item.price)} each`}</div>
        {children}
      </div>
      <div className={styles.side}>
        {unavailable ? (
          <Button size="sm" variant="ghost" icon="trash" onClick={() => onQuantity(0)} aria-label={`Remove ${item.name}`}>
            Remove
          </Button>
        ) : (
          <>
            <strong className={styles.lineTotal}>{money(item.price * item.quantity)}</strong>
            <QuantityStepper size="sm" value={item.quantity} label={item.name} onChange={onQuantity} />
          </>
        )}
      </div>
    </li>
  );
}
