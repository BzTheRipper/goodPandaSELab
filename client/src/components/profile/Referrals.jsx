import { useState } from 'react';
import { authApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Card, EmptyState, Skeleton, useToast } from '../ui/index.js';
import styles from './Referrals.module.css';

/** Referral code, signup credit, loyalty stamps and invite history. */
export default function Referrals() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const refs = await authApi.referrals();
      setData(refs);
    } catch (err) {
      setError(err.message || 'Couldn’t load your referral page.');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Referral code copied.');
    } catch {
      toast.error("Couldn’t copy the code.");
    }
  };

  const progress =
    data?.loyalty.target > 0 ? Math.min((data.loyalty.stamps / data.loyalty.target) * 100, 100) : 0;

  const levelLabel = () => {
    const { stamps, target } = data?.loyalty ?? {};
    if (!target) return 'Loyalty rewards not configured.';
    if (stamps === 0) return "You haven't earned any stamps yet.";
    return `Stamp ${stamps} of ${target}.`;
  };

  return (
    <Card as="section">
      <CardHeader
        title="Refer & Earn"
        hint="Share your code. Your friend gets signup credit, you get rewarded when they collect their first order."
      />
      {loading && !data ? (
        <Skeleton height={220} />
      ) : error ? (
        <EmptyState icon="alertTriangle" title="Couldn’t load referrals" onRetry={load}>
          {error}
        </EmptyState>
      ) : (
        <>
          <div className={styles.row}>
            <div className={styles.stat}>
              <span className={styles.value}>{data.code}</span>
              <span className={styles.label}>Your code</span>
              <button type="button" className={styles.copyBtn} onClick={() => copyCode(data.code)}>
                Copy
              </button>
            </div>
            <div className={styles.stat}>
              <span className={styles.value}>{data.signupCredit > 0 ? `+${data.signupCredit}` : '—'}</span>
              <span className={styles.label}>Friend’s signup credit</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.value}>{data.rewardAmount}</span>
              <span className={styles.label}>Your reward per referral</span>
            </div>
          </div>
          <div className={styles.loyalty}>
            <div className={styles.loyaltyHead}>
              <strong>Loyalty</strong>
              <span className={styles.loyaltyValue}>{data.loyalty.rewards}</span>
            </div>
            <div className={styles.loyaltyBar}>
              <div className={styles.loyaltyTrack}>
                <div className={styles.loyaltyFill} style={{ width: `${progress}%` }} />
              </div>
              <span className={styles.loyaltyText}>{levelLabel()}</span>
            </div>
            <span className={styles.loyaltyHint}>
              Every collected order earns a stamp. Collect {data.loyalty.target} stamps for{' '}
              {data.loyalty.rewardAmount} credit.
            </span>
          </div>
          <div className={styles.invites}>
            <strong>Invites</strong>
            {data.invites.length ? (
              <ul className={styles.inviteList}>
                {data.invites.map((invite) => (
                  <li key={invite.id} className={styles.inviteRow}>
                    <span>{invite.name}</span>
                    <Badge tone={invite.status === 'REWARDED' ? 'success' : 'neutral'}>
                      {invite.status.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.invitesEmpty}>No one has used your code yet.</p>
            )}
          </div>
        </>
      )}
      <span className={styles.error}>{error}</span>
    </Card>
  );
}
