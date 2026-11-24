import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { assetUrl } from '../../api/http.js';
import { restaurantApi } from '../../api/index.js';
import FavoriteButton from '../../components/restaurant/FavoriteButton.jsx';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  InfoTooltip,
  Media,
  RatingSummary,
  Skeleton,
} from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import styles from './RestaurantList.module.css';

const HOW_IT_WORKS =
  'Order from a local restaurant, choose a drone hub near you, and we fly your food there. Show your pickup code and pay cash when you collect.';

function HeroSearch({ value, onSearch }) {
  const [term, setTerm] = useState(value);
  useEffect(() => setTerm(value), [value]);
  return (
    <form
      role="search"
      className={styles.search}
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(term.trim());
      }}
    >
      <label htmlFor="hero-search" className="visually-hidden">
        Search restaurants or dishes
      </label>
      <Icon name="search" size={20} className={styles.searchIcon} />
      <input
        id="hero-search"
        type="search"
        className={styles.searchInput}
        placeholder="Biryani, salads, cafés…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      <Button type="submit" variant="primary" className={styles.searchBtn}>
        Search
      </Button>
    </form>
  );
}

const SORTS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'rating', label: 'Top rated' },
  { value: 'name', label: 'Name (A–Z)' },
];

function RestaurantCard({ restaurant: r }) {
  return (
    <div className={styles.cardWrap}>
      <Card to={`/restaurants/${r._id}`} padding="none" className={styles.card}>
        <div className={styles.coverWrap}>
          <Media
            src={assetUrl(r.coverUrl)}
            ratio="16 / 9"
            icon="store"
            iconSize={40}
            className={r.isOpen ? undefined : styles.closedCover}
          />
          <Badge tone={r.isOpen ? 'success' : 'neutral'} dot className={styles.status}>
            {r.isOpen ? 'Open' : 'Closed'}
          </Badge>
        </div>
        <div className={styles.cardBody}>
          <Avatar name={r.name} src={assetUrl(r.logoUrl)} size={44} square className={styles.logo} />
          <div className={styles.cardText}>
            <div className={styles.nameRow}>
              <h3 className={styles.name}>{r.name}</h3>
              <RatingSummary avg={r.ratingAvg} count={r.ratingCount} compact />
            </div>
            {r.categories.length > 0 && (
              <ul className={styles.tags} aria-label="Categories">
                {r.categories.map((c) => (
                  <li key={c} className={styles.tag}>
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>
      <FavoriteButton restaurant={r} size="sm" className={styles.fav} />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className={styles.skeletonCard} aria-hidden="true">
      <Skeleton className={styles.skeletonCover} />
      <div className={styles.cardBody}>
        <Skeleton width={44} height={44} />
        <div className={styles.cardText}>
          <Skeleton variant="text" width="70%" />
          <Skeleton variant="text" width="45%" />
        </div>
      </div>
    </div>
  );
}

export default function RestaurantList() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const category = params.get('category') || '';
  const sort = SORTS.some((o) => o.value === params.get('sort')) ? params.get('sort') : 'recommended';
  const openNow = params.get('open') === '1';
  const savedOnly = params.get('saved') === '1';
  const queried = Boolean(q || category || openNow || sort !== 'recommended');
  const filtered = queried || savedOnly;
  const { user, isFavorite } = useAuth();
  const canSave = user?.role === 'customer';

  const all = useAsync(() => restaurantApi.list(), []);
  // Personalised rail: saved + previously ordered first, top-rated filler for guests.
  const picks = useAsync(() => restaurantApi.recommended({ limit: 5 }), [user?._id]);
  const results = useAsync(
    () =>
      queried
        ? restaurantApi.list({ ...(q && { q }), ...(category && { category }), ...(openNow && { openNow: 'true' }), sort })
        : Promise.resolve(null),
    [q, category, openNow, sort],
  );
  const { data: raw, error, ...source } = queried ? results : all;
  const data = raw && savedOnly ? raw.filter((r) => isFavorite(r._id)) : raw;
  // Filter changes render once before the new request starts, while `data` is still null.
  const loading = source.loading || (!data && !error);

  const categories = useMemo(
    () => [...new Set((all.data || []).flatMap((r) => r.categories))].sort((a, b) => a.localeCompare(b)),
    [all.data],
  );

  const update = (next) => {
    const merged = {
      q,
      category,
      sort: sort === 'recommended' ? '' : sort,
      open: openNow ? '1' : '',
      saved: savedOnly ? '1' : '',
      ...next,
    };
    setParams(Object.fromEntries(Object.entries(merged).filter(([, v]) => v)));
  };
  const retry = () => (queried ? results.reload() : all.reload());

  let heading = 'All restaurants';
  if (q) heading = `Results for “${q}”`;
  else if (category) heading = category;
  else if (savedOnly) heading = 'Saved restaurants';
  else if (openNow) heading = 'Open now';

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="home-title">
        <h1 id="home-title" className={styles.heroTitle}>
          Good food, flown to a hub near you
          <InfoTooltip content={HOW_IT_WORKS} label="How GoodPanda works" size={18} />
        </h1>
        <HeroSearch value={q} onSearch={(term) => update({ q: term })} />
      </section>

      <div className={styles.toolbar}>
        <div className={styles.quickFilters} role="group" aria-label="Quick filters">
          <Chip selected={openNow} icon="clock" onClick={() => update({ open: openNow ? '' : '1' })}>
            Open now
          </Chip>
          {canSave && (
            <Chip selected={savedOnly} icon="heart" onClick={() => update({ saved: savedOnly ? '' : '1' })}>
              Saved
            </Chip>
          )}
        </div>
        <label className={styles.sort}>
          <span>Sort by</span>
          <select value={sort} onChange={(e) => update({ sort: e.target.value === 'recommended' ? '' : e.target.value })}>
            {SORTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {categories.length > 0 && (
        <div className={styles.chips} role="group" aria-label="Filter by category">
          <Chip selected={!category} onClick={() => update({ category: '' })}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c} selected={category === c} onClick={() => update({ category: category === c ? '' : c })}>
              {c}
            </Chip>
          ))}
        </div>
      )}

      {!queried && !savedOnly && picks.data?.length > 0 && (
        <section aria-labelledby="picks-title">
          <div className={styles.resultsHead}>
            <h2 id="picks-title" className={styles.resultsTitle}>
              Picked for you
            </h2>
            <span className={styles.count}>{canSave ? 'From your saved and past orders' : 'Top rated and open now'}</span>
          </div>
          <ul className={styles.picks}>
            {picks.data.map((r) => (
              <li key={r._id}>
                <Card to={`/restaurants/${r._id}`} padding="none" className={styles.pick}>
                  <Media src={assetUrl(r.coverUrl)} ratio="4 / 3" icon="store" iconSize={28} />
                  <div className={styles.pickBody}>
                    <strong className={styles.pickName}>{r.name}</strong>
                    <span className={styles.pickReason}>
                      {r.reason === 'saved' ? 'Saved' : r.reason === 'ordered' ? 'Ordered before' : 'Top rated'}
                      {r.ratingCount > 0 && ` · ★ ${Number(r.ratingAvg).toFixed(1)}`}
                    </span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="results-title" aria-busy={loading}>
        <div className={styles.resultsHead}>
          <h2 id="results-title" className={styles.resultsTitle}>
            {heading}
          </h2>
          <span className={styles.count} aria-live="polite">
            {!loading && !error && data ? `${data.length} ${data.length === 1 ? 'restaurant' : 'restaurants'}` : ''}
          </span>
          {filtered && (
            <Button variant="ghost" size="sm" icon="x" onClick={() => setParams({})} className={styles.clear}>
              Clear filters
            </Button>
          )}
        </div>

        {loading ? (
          <div className={styles.grid}>
            <span className="visually-hidden" role="status">
              Loading restaurants
            </span>
            {Array.from({ length: 6 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <Card>
            <ErrorState title="We couldn’t load restaurants" error={error} onRetry={retry} />
          </Card>
        ) : data.length === 0 ? (
          <Card>
            {savedOnly && !q && !category && !openNow ? (
              <EmptyState
                icon="heart"
                title="No saved restaurants yet"
                action={
                  <Button variant="primary" onClick={() => setParams({})}>
                    Browse restaurants
                  </Button>
                }
              >
                Tap the heart on a restaurant to keep it here.
              </EmptyState>
            ) : filtered ? (
              <EmptyState
                icon="search"
                title="No matches"
                action={
                  <Button variant="primary" onClick={() => setParams({})}>
                    Show all restaurants
                  </Button>
                }
              >
                Try another dish, category or filter.
              </EmptyState>
            ) : (
              <EmptyState icon="store" title="No restaurants yet">
                New kitchens are joining soon.
              </EmptyState>
            )}
          </Card>
        ) : (
          <div className={styles.grid}>
            {data.map((r) => (
              <RestaurantCard key={r._id} restaurant={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
