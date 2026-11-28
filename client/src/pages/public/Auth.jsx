import { useRef, useState } from 'react';
import { assetUrl } from '../../api/http.js';
import { authApi } from '../../api/index.js';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  FormError,
  Icon,
  InfoTooltip,
  Input,
  PasswordInput,
  PhoneInput,
  useToast,
} from '../../components/ui/index.js';
import { homeFor, useAuth } from '../../context/AuthContext.jsx';
import NotificationPrefs from '../../components/profile/NotificationPrefs.jsx';
import AccountPrivacy from '../../components/profile/AccountPrivacy.jsx';
import Referrals from '../../components/profile/Referrals.jsx';
import { useAction } from '../../hooks/useAsync.js';
import styles from './Auth.module.css';

// Seeded accounts from server/src/seed/seedData.js (development builds only).
const DEMO_ACCOUNTS = import.meta.env.DEV
  ? [
      ['Customer', 'customer@goodpanda.test', 'customer123'],
      ['Owner', 'owner1@goodpanda.test', 'owner123'],
      ['Admin', 'admin@goodpanda.test', 'admin123'],
    ]
  : [];

const ROLE_LABEL = { customer: 'Customer', owner: 'Restaurant owner', admin: 'Admin' };

function AuthHeading({ title, subtitle }) {
  return (
    <div className={styles.head}>
      <h1 className={styles.title}>{title}</h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const { busy, error, run } = useAction();

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const user = await login(form);
      navigate(location.state?.from || homeFor(user), { replace: true });
    });
  };

  return (
    <>
      <AuthHeading title="Welcome back" subtitle="Log in to order, track your drone and chat with restaurants." />
      <form className={styles.form} onSubmit={submit}>
        <Field label="Email">
          <Input
            type="email"
            icon="mail"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Password">
          <PasswordInput
            icon="lock"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <FormError error={error} />
        <Button type="submit" variant="primary" size="lg" block loading={busy} className={styles.submit}>
          Log in
        </Button>
      </form>
      <p className={styles.switch}>
        New to GoodPanda? <Link to="/register">Create an account</Link>
      </p>

      {DEMO_ACCOUNTS.length > 0 && (
        <div className={styles.demo}>
          <div className={styles.demoHead}>
            Demo accounts
            <InfoTooltip
              content="Only shown in development. Fills in a seeded account so you can try each role."
              label="About demo accounts"
              size={14}
            />
          </div>
          <div className={styles.demoList}>
            {DEMO_ACCOUNTS.map(([label, email, password]) => (
              <Button key={email} size="sm" onClick={() => setForm({ email, password })}>
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const ROLES = [
  ['customer', 'Order food', 'utensils'],
  ['owner', 'Run a restaurant', 'store'],
];

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', address: '', role: 'customer' });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const user = await register(form);
      navigate(user.role === 'owner' ? '/owner' : '/', { replace: true });
    });
  };

  return (
    <>
      <AuthHeading title="Create your account" subtitle="It takes less than a minute." />
      <form className={styles.form} onSubmit={submit}>
        <fieldset className={styles.roles}>
          <legend className={styles.legend}>
            I want to
            <InfoTooltip
              content="Restaurant accounts need admin approval before they appear to customers."
              label="About account types"
              size={15}
            />
          </legend>
          <div className={styles.roleGrid}>
            {ROLES.map(([value, label, icon]) => (
              <label key={value} className={styles.role}>
                <input type="radio" name="role" value={value} checked={form.role === value} onChange={set('role')} />
                <span className={styles.roleCard}>
                  <Icon name={icon} size={22} />
                  <span className={styles.roleName}>{label}</span>
                </span>
                <span className={styles.check} aria-hidden="true">
                  <Icon name="check" size={14} strokeWidth={3} />
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Full name">
          <Input icon="user" autoComplete="name" required value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Email">
          <Input type="email" icon="mail" autoComplete="email" required value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Password" hint="At least 6 characters.">
          <PasswordInput icon="lock" autoComplete="new-password" required minLength={6} value={form.password} onChange={set('password')} />
        </Field>
        <div className={styles.row2}>
          <Field label="Mobile number" hint="Bangladeshi mobile only. Type the 10 digits after +880, e.g. 1712345678. Restaurants and support call this number about your orders.">
            <PhoneInput required value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          </Field>
          <Field label="Address" optional>
            <Input icon="home" autoComplete="street-address" value={form.address} onChange={set('address')} />
          </Field>
        </div>
        <FormError error={error} />
        <Button type="submit" variant="primary" size="lg" block loading={busy} className={styles.submit}>
          Create account
        </Button>
      </form>
      <p className={styles.switch}>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </>
  );
}

const MAX_AVATAR_MB = 5;

function AvatarEditor({ user }) {
  const { setAvatar, removeAvatar } = useAuth();
  const toast = useToast();
  const inputRef = useRef(null);
  const { busy, error, setError, run } = useAction();

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Choose an image file (JPG, PNG or WebP).');
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) return setError(`Images must be ${MAX_AVATAR_MB} MB or smaller.`);
    run(async () => {
      await setAvatar(file);
      toast.success('Profile photo updated');
    });
  };

  return (
    <div className={styles.avatarEditor}>
      <div className={styles.avatarWrap}>
        <Avatar name={user.name} src={assetUrl(user.avatarUrl)} size={72} />
        <button
          type="button"
          className={styles.avatarBtn}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label="Change profile photo"
        >
          <Icon name="camera" size={16} />
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onFile} />
      {user.avatarUrl && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await removeAvatar();
              toast.success('Profile photo removed');
            })
          }
        >
          Remove photo
        </Button>
      )}
      {busy && <span className={styles.avatarStatus}>Uploading…</span>}
      <FormError error={error} />
    </div>
  );
}

const EMPTY_PASSWORDS = { currentPassword: '', newPassword: '', confirm: '' };

function ChangePassword() {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_PASSWORDS);
  const { busy, error, setError, run } = useAction();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const mismatch = form.confirm && form.confirm !== form.newPassword;

  const submit = async (e) => {
    e.preventDefault();
    if (form.newPassword.length < 6) return setError('Your new password must be at least 6 characters.');
    if (mismatch) return setError('The new passwords don’t match.');
    const ok = await run(async () => {
      await authApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      return true;
    });
    if (ok) {
      setForm(EMPTY_PASSWORDS);
      toast.success('Password changed');
    }
  };

  return (
    <Card>
      <h2 className={styles.cardTitle}>
        <Icon name="lock" size={18} /> Change password
      </h2>
      <form className={styles.form} onSubmit={submit}>
        <Field label="Current password">
          <PasswordInput autoComplete="current-password" required value={form.currentPassword} onChange={set('currentPassword')} />
        </Field>
        <div className={styles.row2}>
          <Field label="New password" hint="At least 6 characters.">
            <PasswordInput autoComplete="new-password" required minLength={6} value={form.newPassword} onChange={set('newPassword')} />
          </Field>
          <Field label="Confirm new password" error={mismatch ? 'Passwords don’t match' : undefined}>
            <PasswordInput autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} />
          </Field>
        </div>
        <FormError error={error} />
        <div className={styles.actions}>
          <Button type="submit" variant="primary" loading={busy} disabled={!form.currentPassword || !form.newPassword || !form.confirm}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function Profile() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const initial = { name: user.name, phone: user.phone, address: user.address || '' };
  const [form, setForm] = useState(initial);
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const dirty = form.name !== user.name || form.phone !== user.phone || form.address !== (user.address || '');

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await updateProfile(form);
      toast.success('Profile saved');
    });
  };

  return (
    <div className={styles.profile}>
      <PageHeader title="Profile" />
      <Card>
        <div className={styles.identity}>
          <AvatarEditor user={user} />
          <div className={styles.identityText}>
            <div className={styles.identityName}>{user.name}</div>
            <div className={styles.identityMeta}>
              <Badge tone="brand">{ROLE_LABEL[user.role] || user.role}</Badge>
              <span>{user.email}</span>
            </div>
          </div>
        </div>
        <form className={styles.form} onSubmit={submit}>
          <Field label="Full name">
            <Input icon="user" autoComplete="name" required value={form.name} onChange={set('name')} />
          </Field>
          <div className={styles.row2}>
            <Field label="Mobile number" hint="Bangladeshi mobile only: the 10 digits after +880. Shown to restaurants and support so they can call you about an order.">
              <PhoneInput required value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
            </Field>
            <Field label="Address" optional>
              <Input icon="home" autoComplete="street-address" value={form.address} onChange={set('address')} />
            </Field>
          </div>
          <FormError error={error} />
          <div className={styles.actions}>
            <Button variant="ghost" disabled={!dirty || busy} onClick={() => setForm(initial)}>
              Reset
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>
              Save changes
            </Button>
          </div>
        </form>
      </Card>
      <ChangePassword />
      <NotificationPrefs />
      <AccountPrivacy />
      {user?.role === 'customer' && <Referrals />}
    </div>
  );
}
