import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/http.js';
import { Icon, useToast } from '../ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import styles from './FavoriteButton.module.css';

/** Heart toggle for saving a restaurant. Guests are sent to log in; staff accounts don't see it. */
export default function FavoriteButton({ restaurant, className = '', size = 'md' }) {
  const { user, isFavorite, toggleFavorite } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (user && user.role !== 'customer') return null;

  const saved = isFavorite(restaurant._id);
  const onClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      navigate('/login', { state: { from: location.pathname + location.search } });
      return;
    }
    setBusy(true);
    try {
      const nowSaved = await toggleFavorite(restaurant._id);
      toast.success(nowSaved ? `Saved ${restaurant.name}` : `Removed ${restaurant.name} from saved`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`${styles.btn} ${styles[size]} ${saved ? styles.saved : ''} ${className}`}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${restaurant.name} from saved` : `Save ${restaurant.name}`}
      disabled={busy}
      onClick={onClick}
    >
      <Icon name="heart" size={size === 'sm' ? 18 : 20} fill={saved ? 'currentColor' : 'none'} strokeWidth={2} />
    </button>
  );
}
