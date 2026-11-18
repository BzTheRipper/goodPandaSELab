import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import styles from './Media.module.css';

/**
 * Fixed aspect-ratio image box: reserves space before load (no layout shift), lazy-loads,
 * and falls back to a branded placeholder when there's no image or it fails.
 * ratio: CSS aspect-ratio string, e.g. "16 / 9"; omit to set `--media-ratio` from CSS.
 */
export default function Media({ src, alt = '', ratio, icon = 'utensils', iconSize = 32, eager, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  return (
    <div className={`${styles.media} ${className}`} style={ratio ? { '--media-ratio': ratio } : undefined}>
      {src && !failed ? (
        <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span className={styles.placeholder} aria-hidden="true">
          <Icon name={icon} size={iconSize} strokeWidth={1.5} />
        </span>
      )}
    </div>
  );
}
