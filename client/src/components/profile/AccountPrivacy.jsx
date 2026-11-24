import { useNavigate } from 'react-router-dom';
import { authApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAction } from '../../hooks/useAsync.js';
import { Button, Card, FormError, useConfirm, useToast } from '../ui/index.js';
import styles from './AccountPrivacy.module.css';

/** GDPR-style controls: download everything we hold, or delete the account. */
export default function AccountPrivacy() {
  const { user, logout } = useAuth();
  const { busy, error, run } = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();

  const download = async () => {
    const data = await run(() => authApi.exportData());
    if (!data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'goodpanda-export.json';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Your data export has been downloaded.');
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete your account?',
      message:
        'Your name, phone, address and photo are removed, and you are signed out. Past orders stay on file for restaurant and cash reconciliation, without your contact details.',
      confirmLabel: 'Delete my account',
      tone: 'danger',
    });
    if (!ok) return;
    const done = await run(async () => {
      await authApi.deleteMe();
      return true;
    });
    if (!done) return;
    logout();
    toast.success('Your account has been deleted.');
    navigate('/');
  };

  return (
    <Card as="section">
      <h2 className={styles.title}>Your data</h2>
      <p className={styles.hint}>Download a copy of your account, orders and reviews at any time.</p>
      <div className={styles.actions}>
        <Button variant="secondary" icon="download" loading={busy} onClick={download}>
          Download my data
        </Button>
        {user?.role === 'customer' ? (
          <Button variant="dangerGhost" icon="trash" disabled={busy} onClick={remove}>
            Delete account
          </Button>
        ) : (
          <span className={styles.note}>Staff accounts are removed by an administrator.</span>
        )}
      </div>
      <FormError error={error} />
    </Card>
  );
}
