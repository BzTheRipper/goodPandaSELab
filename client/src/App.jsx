import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthLayout, RoleLayout } from './components/layout/Layouts.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { usePageTitle } from './hooks/usePageTitle.js';

const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));

const RestaurantList = lazy(() => import('./pages/public/RestaurantList.jsx'));
const RestaurantDetail = lazy(() => import('./pages/public/RestaurantDetail.jsx'));
const NotFound = lazy(() => import('./pages/public/NotFound.jsx'));
const loadAuth = () => import('./pages/public/Auth.jsx');
const Login = named(loadAuth, 'Login');
const Register = named(loadAuth, 'Register');
const ForgotPassword = named(loadAuth, 'ForgotPassword');
const ResetPassword = named(loadAuth, 'ResetPassword');
const Profile = named(loadAuth, 'Profile');
const Checkout = lazy(() => import('./pages/customer/Checkout.jsx'));
const MyOrders = lazy(() => import('./pages/customer/MyOrders.jsx'));
const OrderPage = lazy(() => import('./pages/orders/OrderPage.jsx'));
const Receipt = lazy(() => import('./pages/orders/Receipt.jsx'));
const Notifications = lazy(() => import('./pages/customer/Notifications.jsx'));
const OwnerRestaurant = lazy(() => import('./pages/owner/OwnerRestaurant.jsx'));
const OwnerMenu = lazy(() => import('./pages/owner/OwnerMenu.jsx'));
const OwnerOrders = lazy(() => import('./pages/owner/OwnerOrders.jsx'));
const OwnerInsights = lazy(() => import('./pages/owner/OwnerInsights.jsx'));
const OwnerReviews = lazy(() => import('./pages/owner/OwnerReviews.jsx'));
const OwnerEarnings = lazy(() => import('./pages/owner/OwnerEarnings.jsx'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard.jsx'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders.jsx'));
const AdminPickup = lazy(() => import('./pages/admin/AdminPickup.jsx'));
const loadManage = () => import('./pages/admin/AdminManage.jsx');
const AdminRestaurants = named(loadManage, 'AdminRestaurants');
const AdminUsers = named(loadManage, 'AdminUsers');
const AdminSettings = named(loadManage, 'AdminSettings');
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit.jsx'));
const AdminHubStaff = lazy(() => import('./pages/admin/AdminHubStaff.jsx'));
const loadFleet = () => import('./pages/admin/AdminFleet.jsx');
const AdminHubs = named(loadFleet, 'AdminHubs');
const AdminDrones = named(loadFleet, 'AdminDrones');
const AdminFleetHealth = lazy(() => import('./pages/admin/AdminFleetHealth.jsx'));
const AdminPayouts = lazy(() => import('./pages/admin/AdminPayouts.jsx'));
const AdminCampaigns = lazy(() => import('./pages/admin/AdminCampaigns.jsx'));
const AdminCoupons = lazy(() => import('./pages/admin/AdminCoupons.jsx'));
const AdminDisputes = lazy(() => import('./pages/admin/AdminDisputes.jsx'));
const HubQueue = lazy(() => import('./pages/hub/HubQueue.jsx'));

/**
 * Sets the document title and applies the role guard.
 * auth: undefined = public, true = any signed-in user, [roles] = only those roles.
 */
function Page({ title, auth, el: El }) {
  usePageTitle(title);
  const content = <El />;
  if (!auth) return content;
  return <ProtectedRoute roles={auth === true ? null : auth}>{content}</ProtectedRoute>;
}

const ROUTES = [
  ['/', { title: 'Restaurants', el: RestaurantList }],
  ['/restaurants/:id', { title: 'Restaurant', el: RestaurantDetail }],
  ['/checkout', { title: 'Checkout', el: Checkout }],
  ['/profile', { title: 'Profile', el: Profile, auth: true }],
  ['/orders', { title: 'My orders', el: MyOrders, auth: ['customer'] }],
  ['/orders/:id', { title: 'Order', el: OrderPage, auth: true }],
  ['/orders/:id/receipt', { title: 'Receipt', el: Receipt, auth: true }],
  ['/notifications', { title: 'Notifications', el: Notifications, auth: true }],
  ['/owner', { title: 'My restaurant', el: OwnerRestaurant, auth: ['owner'] }],
  ['/owner/menu', { title: 'Menu', el: OwnerMenu, auth: ['owner'] }],
  ['/owner/orders', { title: 'Orders', el: OwnerOrders, auth: ['owner'] }],
  ['/owner/insights', { title: 'Insights', el: OwnerInsights, auth: ['owner'] }],
  ['/owner/earnings', { title: 'Earnings', el: OwnerEarnings, auth: ['owner'] }],
  ['/owner/reviews', { title: 'Reviews', el: OwnerReviews, auth: ['owner'] }],
  ['/admin', { title: 'Dashboard', el: AdminDashboard, auth: ['admin'] }],
  ['/admin/orders', { title: 'Orders', el: AdminOrders, auth: ['admin'] }],
  ['/admin/payouts', { title: 'Payouts', el: AdminPayouts, auth: ['admin'] }],
  ['/admin/campaigns', { title: 'Campaigns', el: AdminCampaigns, auth: ['admin'] }],
  ['/admin/coupons', { title: 'Coupons', el: AdminCoupons, auth: ['admin'] }],
  ['/admin/disputes', { title: 'Disputes', el: AdminDisputes, auth: ['admin'] }],
  ['/admin/pickup', { title: 'Verify pickup', el: AdminPickup, auth: ['admin', 'hub_operator'] }],
  ['/admin/restaurants', { title: 'Restaurants', el: AdminRestaurants, auth: ['admin'] }],
  ['/admin/users', { title: 'Users', el: AdminUsers, auth: ['admin'] }],
  ['/admin/hubs', { title: 'Hubs', el: AdminHubs, auth: ['admin'] }],
  ['/admin/drones', { title: 'Drones', el: AdminDrones, auth: ['admin'] }],
  ['/admin/audit', { title: 'Audit log', el: AdminAudit, auth: ['admin'] }],
  ['/admin/hub-staff', { title: 'Hub operators', el: AdminHubStaff, auth: ['admin'] }],
  ['/admin/fleet-health', { title: 'Fleet health', el: AdminFleetHealth, auth: ['admin'] }],
  ['/admin/settings', { title: 'Settings', el: AdminSettings, auth: ['admin'] }],
  ['/hub', { title: 'Hub queue', el: HubQueue, auth: ['hub_operator'] }],
  ['*', { title: 'Page not found', el: NotFound }],
];

export default function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Page title="Log in" el={Login} />} />
        <Route path="/register" element={<Page title="Create account" el={Register} />} />
        <Route path="/forgot-password" element={<Page title="Forgot password" el={ForgotPassword} />} />
        <Route path="/reset-password" element={<Page title="Reset password" el={ResetPassword} />} />
      </Route>
      <Route element={<RoleLayout />}>
        {ROUTES.map(([path, props]) => (
          <Route key={path} path={path} element={<Page {...props} />} />
        ))}
      </Route>
    </Routes>
  );
}
