import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import heroUrl from '../../assets/auth-hero.webp';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import CartDrawer from '../cart/CartDrawer.jsx';
import { Button, CountBadge, Drawer, Icon, PageLoader } from '../ui/index.js';
import AnnouncementBanner from './AnnouncementBanner.jsx';
import Logo from './Logo.jsx';
import NotificationBell from './NotificationBell.jsx';
import styles from './Shell.module.css';
import UserMenu from './UserMenu.jsx';

const SkipLink = () => (
  <a href="#main" className={styles.skip}>
    Skip to content
  </a>
);

function Content() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  // New pages start at the top; back/forward (POP) keeps the browser's restored position.
  useEffect(() => {
    if (navType !== 'POP') window.scrollTo(0, 0);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  );
}

function SearchForm({ className }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const urlQ = pathname === '/' ? params.get('q') || '' : '';
  const [q, setQ] = useState(urlQ);
  useEffect(() => setQ(urlQ), [urlQ]);

  const submit = (e) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/?q=${encodeURIComponent(term)}` : '/');
  };

  return (
    <form role="search" className={`${styles.search} ${className || ''}`} onSubmit={submit}>
      <span className={styles.searchIcon}>
        <Icon name="search" size={18} />
      </span>
      <input
        type="search"
        className={styles.searchInput}
        placeholder="Search restaurants or dishes"
        aria-label="Search restaurants or dishes"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  );
}

function CartButton() {
  const { count, drawerOpen, openCart } = useCart();
  return (
    <button
      type="button"
      className={styles.iconLink}
      onClick={openCart}
      aria-haspopup="dialog"
      aria-expanded={drawerOpen}
      aria-label={count ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart, empty'}
    >
      <Icon name="cart" size={22} />
      <CountBadge count={count} tone="brand" className={styles.iconBadge} />
    </button>
  );
}

/** Publishes the sticky header's height as --header-offset so page-level sticky bars sit below it. */
function useHeaderOffset() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty('--header-offset', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--header-offset');
    };
  }, []);
  return ref;
}

/** Guests and customers: header with search, cart, bell and account. */
export function PublicLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const headerRef = useHeaderOffset();
  const shopper = !user || user.role === 'customer';
  // Home has its own hero search; a second box in the header would be clutter.
  const showSearch = pathname !== '/';
  return (
    <div className={styles.publicShell}>
      <SkipLink />
      <header ref={headerRef} className={styles.header}>
        <div className={`${styles.container} ${styles.headerRow}`}>
          <Logo />
          {showSearch && <SearchForm className={styles.searchDesktop} />}
          <div className={styles.actions}>
            {user?.role === 'customer' && (
              <nav className={styles.navLinks} aria-label="Main">
                <NavLink to="/" end className={styles.navLink}>
                  Restaurants
                </NavLink>
                <NavLink to="/orders" className={styles.navLink}>
                  My orders
                </NavLink>
              </nav>
            )}
            {shopper && <CartButton />}
            {user ? (
              <>
                <NotificationBell />
                <UserMenu />
              </>
            ) : (
              <>
                <Button variant="ghost" to="/login" className={styles.hideXs}>
                  Log in
                </Button>
                <Button variant="primary" to="/register">
                  Sign up
                </Button>
              </>
            )}
          </div>
        </div>
        {showSearch && (
          <div className={`${styles.container} ${styles.searchMobile}`}>
            <SearchForm />
          </div>
        )}
      </header>
      <main id="main" tabIndex={-1} className={`${styles.container} ${styles.page}`}>
        <AnnouncementBanner />
        <Content />
      </main>
      <footer className={styles.footer}>
        <div className={`${styles.container} ${styles.footerRow}`}>
          <span>© {new Date().getFullYear()} GoodPanda</span>
          <span>Fresh food, delivered by drone to your nearest hub.</span>
        </div>
      </footer>
      {shopper && <CartDrawer />}
    </div>
  );
}

const NAV = {
  owner: {
    label: 'Restaurant',
    home: '/owner/orders',
    items: [
      ['/owner/orders', 'Orders', 'receipt'],
      ['/owner/menu', 'Menu', 'utensils'],
      ['/owner/insights', 'Insights', 'chart'],
      ['/owner/earnings', 'Earnings', 'cash'],
      ['/owner/reviews', 'Reviews', 'star'],
      ['/owner', 'My restaurant', 'store'],
    ],
  },
  admin: {
    label: 'Admin',
    home: '/admin',
    items: [
      ['/admin', 'Dashboard', 'grid'],
      ['/admin/orders', 'Orders', 'receipt'],
      ['/admin/payouts', 'Payouts', 'cash'],
      ['/admin/campaigns', 'Campaigns', 'send'],
      ['/admin/coupons', 'Coupons', 'star'],
      ['/admin/disputes', 'Disputes', 'alertTriangle'],
      ['/admin/pickup', 'Pickup verify', 'cash'],
      ['/admin/restaurants', 'Restaurants', 'store'],
      ['/admin/users', 'Users', 'users'],
      ['/admin/hub-staff', 'Hub operators', 'user'],
      ['/admin/hubs', 'Hubs', 'mapPin'],
      ['/admin/drones', 'Drones', 'drone'],
      ['/admin/audit', 'Audit log', 'history'],
      ['/admin/fleet-health', 'Fleet health', 'batteryCharging'],
      ['/admin/settings', 'Settings', 'settings'],
    ],
  },
  hub_operator: {
    label: 'Hub operator',
    home: '/hub',
    items: [
      ['/hub', 'Hub queue', 'inbox'],
      ['/admin/pickup', 'Pickup verify', 'cash'],
    ],
  },
};

function SideNav({ nav }) {
  return (
    <>
      <div className={styles.roleTag}>{nav.label}</div>
      <nav className={styles.sideNav} aria-label={nav.label}>
        {nav.items.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end className={styles.sideLink}>
            <Icon name={icon} size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

/** Owners and admins: sidebar on desktop, drawer on mobile. */
export function DashboardLayout() {
  const { user } = useAuth();
  const nav = NAV[user.role];
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className={styles.dash}>
      <SkipLink />
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHead}>
          <Logo to={nav.home} />
        </div>
        <div className={styles.sidebarBody}>
          <SideNav nav={nav} />
        </div>
      </aside>
      <div className={styles.dashMain}>
        <header className={styles.topbar}>
          <Button
            variant="ghost"
            icon="menu"
            iconOnly
            aria-label="Open menu"
            className={styles.menuBtn}
            onClick={() => setMenuOpen(true)}
          />
          <span className={styles.topbarLogo}>
            <Logo to={nav.home} />
          </span>
          <div className={styles.actions}>
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main id="main" tabIndex={-1} className={styles.dashContent}>
          <AnnouncementBanner />
          <Content />
        </main>
      </div>
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="GoodPanda">
        <SideNav nav={nav} />
      </Drawer>
    </div>
  );
}

/** Picks the shell for shared routes (profile, order page, 404…) by role. */
export function RoleLayout() {
  const { user, ready } = useAuth();
  if (!ready) return <PageLoader />;
  return user && NAV[user.role] ? <DashboardLayout /> : <PublicLayout />;
}

export function AuthLayout() {
  return (
    <div className={styles.auth}>
      <SkipLink />
      <div className={styles.authMain}>
        <Logo />
        <main id="main" tabIndex={-1} className={styles.authBody}>
          <div className={styles.authInner}>
            <Content />
          </div>
        </main>
      </div>
      <div className={styles.authHero} aria-hidden="true">
        <img src={heroUrl} alt="" />
        <div className={styles.heroCaption}>
          <strong>Your favourite food, flown to a hub near you.</strong>
          <span>Order from local restaurants. Pay cash when you collect.</span>
        </div>
      </div>
    </div>
  );
}
