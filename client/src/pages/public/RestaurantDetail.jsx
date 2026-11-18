import { useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { assetUrl, errorCode } from '../../api/http.js';
import { restaurantApi } from '../../api/index.js';
import FavoriteButton from '../../components/restaurant/FavoriteButton.jsx';
import ReviewsSection from '../../components/restaurant/ReviewsSection.jsx';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  CountBadge,
  EmptyState,
  ErrorState,
  Icon,
  InfoTooltip,
  Media,
  PhoneLink,
  QuantityStepper,
  RatingSummary,
  Skeleton,
} from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { useAddToCart } from '../../hooks/useAddToCart.js';
import { useAsync } from '../../hooks/useAsync.js';
import { reducedMotion, useScrollSpy } from '../../hooks/useScrollSpy.js';
import { money } from '../../utils/format.js';
import styles from './RestaurantDetail.module.css';

const slug = (s) => `cat-${s.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

const groupByCategory = (items) =>
  Object.entries(
    items.reduce((acc, i) => {
      (acc[i.category] ||= []).push(i);
      return acc;
    }, {}),
  ).map(([name, list]) => ({ name, id: slug(name), items: list }));

/** Unknown or malformed ids resolve to null so the page can show "not found" instead of a generic error. */
const loadRestaurant = (id) =>
  restaurantApi.detail(id).catch((err) => {
    if (['NOT_FOUND', 'BAD_REQUEST'].includes(errorCode(err))) return null;
    throw err;
  });

function FoodCard({ item, mode, quantity, onAdd, onQuantity }) {
  const unavailable = item.isAvailable === false;
  const addRef = useRef(null);
  const plusRef = useRef(null);
  const focusNext = useRef(null);

  // Keep keyboard focus on the control that replaces the one just pressed.
  useEffect(() => {
    if (focusNext.current === 'plus' && quantity > 0) plusRef.current?.focus();
    if (focusNext.current === 'add' && quantity === 0) addRef.current?.focus();
    focusNext.current = null;
  }, [quantity]);

  let action = null;
  if (unavailable) action = <Badge tone="neutral">Unavailable</Badge>;
  else if (mode === 'closed')
    action = (
      <Button size="sm" disabled aria-label={`${item.name} can’t be added while the restaurant is closed`}>
        Add
      </Button>
    );
  else if (mode === 'order' && quantity > 0)
    action = (
      <QuantityStepper
        ref={plusRef}
        value={quantity}
        label={item.name}
        onChange={(q) => {
          if (q === 0) focusNext.current = 'add';
          onQuantity(q);
        }}
      />
    );
  else if (mode === 'order')
    action = (
      <Button
        ref={addRef}
        size="sm"
        variant="primary"
        icon="plus"
        aria-label={`Add ${item.name}`}
        onClick={async () => {
          focusNext.current = 'plus';
          if (!(await onAdd())) focusNext.current = null;
        }}
      >
        Add
      </Button>
    );

  return (
    <article className={`${styles.food} ${unavailable ? styles.unavailable : ''}`}>
      <div className={styles.foodText}>
        <h3 className={styles.foodName}>{item.name}</h3>
        {item.description && <p className={styles.foodDesc}>{item.description}</p>}
        <div className={styles.foodFoot}>
          <span className={styles.price}>{money(item.price)}</span>
          {action}
        </div>
      </div>
      <Media src={assetUrl(item.imageUrl)} alt="" ratio="1 / 1" iconSize={28} className={styles.foodImg} />
    </article>
  );
}

function DetailSkeleton() {
  return (
    <div className={styles.page} aria-busy="true">
      <span className="visually-hidden" role="status">
        Loading menu
      </span>
      <Skeleton className={styles.coverSkeleton} />
      <div className={styles.identity}>
        <Skeleton width={72} height={72} className={styles.logo} />
        <div style={{ flex: 1 }}>
          <Skeleton variant="text" width="50%" />
          <Skeleton variant="text" width="70%" />
        </div>
      </div>
      <div className={styles.menuGrid}>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} height={128} />
        ))}
      </div>
    </div>
  );
}

function CategoryNav({ sections }) {
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const [active, scrollTo] = useScrollSpy(ids);
  const navRef = useRef(null);

  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector('[aria-current="true"]');
    if (!chip) return;
    nav.scrollTo({
      left: chip.offsetLeft - nav.clientWidth / 2 + chip.offsetWidth / 2,
      behavior: reducedMotion() ? 'auto' : 'smooth',
    });
  }, [active]);

  return (
    <nav className={styles.catNav} aria-label="Menu categories">
      <div ref={navRef} className={styles.catScroller}>
        {sections.map((s) => (
          <Chip
            key={s.id}
            toggle={false}
            selected={active === s.id}
            aria-current={active === s.id ? 'true' : undefined}
            onClick={() => scrollTo(s.id)}
          >
            {s.name}
          </Chip>
        ))}
      </div>
    </nav>
  );
}

export default function RestaurantDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { cart, count, subtotal, quantityOf, setQuantity, openCart } = useCart();
  const addToCart = useAddToCart();
  const { data, loading, error, reload } = useAsync(() => loadRestaurant(id), [id]);
  const sections = useMemo(() => groupByCategory(data?.menu || []), [data]);

  if (loading) return <DetailSkeleton />;
  if (error)
    return (
      <Card>
        <ErrorState title="We couldn’t load this menu" error={error} onRetry={reload} />
      </Card>
    );
  if (!data)
    return (
      <Card>
        <EmptyState
          icon="store"
          title="Restaurant not found"
          action={
            <Button variant="primary" to="/">
              Browse restaurants
            </Button>
          }
        >
          It may have closed its account or the link is wrong.
        </EmptyState>
      </Card>
    );

  const { restaurant, menu } = data;
  const shopper = !user || user.role === 'customer';
  const mode = !shopper ? 'view' : restaurant.isOpen ? 'order' : 'closed';
  const cartHere = shopper && cart.restaurant?._id === restaurant._id && count > 0;

  const about = (
    <>
      {restaurant.description && <span className={styles.aboutText}>{restaurant.description}</span>}
      {restaurant.categories.length > 0 && <span className={styles.aboutText}>Cuisine: {restaurant.categories.join(', ')}</span>}
    </>
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Media
          src={assetUrl(restaurant.coverUrl)}
          icon="store"
          iconSize={56}
          eager
          className={`${styles.cover} ${restaurant.isOpen ? '' : styles.closedCover}`}
        />
        <div className={styles.identity}>
          <Avatar name={restaurant.name} src={assetUrl(restaurant.logoUrl)} size={72} square className={styles.logo} />
          <div className={styles.identityText}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>{restaurant.name}</h1>
              {(restaurant.description || restaurant.categories.length > 0) && (
                <InfoTooltip content={about} label={`About ${restaurant.name}`} size={18} />
              )}
            </div>
            <div className={styles.meta}>
              <Badge tone={restaurant.isOpen ? 'success' : 'neutral'} dot>
                {restaurant.isOpen ? 'Open now' : 'Closed'}
              </Badge>
              {restaurant.ratingCount > 0 ? (
                <a href="#reviews-title" className={styles.metaItem}>
                  <RatingSummary avg={restaurant.ratingAvg} count={restaurant.ratingCount} />
                </a>
              ) : (
                <span className={styles.metaItem}>
                  <RatingSummary />
                </span>
              )}
              <span className={styles.metaItem}>
                <Icon name="mapPin" size={16} />
                {restaurant.address}
              </span>
              <PhoneLink phone={restaurant.phone} className={styles.metaItem} />
            </div>
          </div>
          <FavoriteButton restaurant={restaurant} className={styles.fav} />
        </div>
      </header>

      {mode === 'closed' && (
        <Alert tone="warning" icon="clock" title="Closed right now">
          You can browse the menu, but ordering is paused until the restaurant opens.
        </Alert>
      )}

      {menu.length === 0 ? (
        <Card>
          <EmptyState icon="utensils" title="Nothing on the menu right now">
            Check back a little later.
          </EmptyState>
        </Card>
      ) : (
        <>
          {sections.length > 1 && <CategoryNav sections={sections} />}
          {sections.map((s) => (
            <section key={s.id} id={s.id} className={styles.section} aria-labelledby={`${s.id}-title`}>
              <h2 id={`${s.id}-title`} className={styles.sectionTitle} tabIndex={-1}>
                {s.name}
              </h2>
              <div className={styles.menuGrid}>
                {s.items.map((item) => (
                  <FoodCard
                    key={item._id}
                    item={item}
                    mode={mode}
                    quantity={cartHere ? quantityOf(item._id) : 0}
                    onAdd={() => addToCart(restaurant, item)}
                    onQuantity={(q) => setQuantity(item._id, q)}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {restaurant.ratingCount > 0 && <ReviewsSection restaurant={restaurant} />}

      {cartHere && (
        <div className={styles.cartBar}>
          <button type="button" className={styles.cartBarBtn} onClick={openCart} aria-haspopup="dialog">
            <CountBadge count={count} tone="brand" className={styles.cartBarCount} />
            <span className={styles.cartBarLabel}>View cart</span>
            <span className={styles.cartBarTotal}>{money(subtotal)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
