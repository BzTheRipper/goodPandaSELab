import { errorCode } from '../../api/http.js';
import { ownerApi } from '../../api/index.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Icon,
  Skeleton,
  Table,
} from '../../components/ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { dateTime, money, shortId } from '../../utils/format.js';
import styles from './OwnerEarnings.module.css';

const loadEarnings = () =>
  ownerApi.earnings().catch((err) => {
    if (errorCode(err) === 'NOT_FOUND') return null;
    throw err;
  });

const tone = (status) => (status === 'PAID' ? 'success' : status === 'PENDING' ? 'warning' : 'neutral');

function Stat({ icon, label, value, hint }) {
  return (
    <Card className={styles.stat}>
      <span className={styles.statIcon}>
        <Icon name={icon} size={18} />
      </span>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
      {hint && <span className={styles.statHint}>{hint}</span>}
    </Card>
  );
}

const columns = [
  {
    key: 'order',
    header: 'Order',
    primary: true,
    render: (o) => <span className={styles.mono}>{shortId(o._id)}</span>,
  },
  {
    key: 'collected',
    header: 'Collected',
    render: (o) => <span className={styles.muted}>{dateTime(o.collectedAt)}</span>,
  },
  {
    key: 'gross',
    header: 'Food total',
    align: 'right',
    render: (o) => <span className={styles.muted}>{money(o.subtotal)}</span>,
  },
  {
    key: 'fee',
    header: 'Platform fee',
    align: 'right',
    render: (o) => <span className={styles.muted}>−{money(o.commissionAmount)}</span>,
  },
  {
    key: 'net',
    header: 'Your payout',
    align: 'right',
    render: (o) => <strong>{money(o.payoutAmount)}</strong>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (o) => <Badge tone={tone(o.payoutStatus)}>{o.payoutStatus}</Badge>,
  },
];

/** What the restaurant has earned and what is still owed, order by order. */
export default function OwnerEarnings() {
  const { data, loading, error, reload } = useAsync(loadEarnings, []);

  if (loading && !data) {
    return (
      <div className={styles.page}>
        <PageHeader title="Earnings" subtitle="Your payouts from the platform." />
        <div className={styles.stats}>
          <Skeleton height={104} />
          <Skeleton height={104} />
          <Skeleton height={104} />
        </div>
        <Skeleton height={220} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={styles.page}>
        <PageHeader title="Earnings" subtitle="Your payouts from the platform." />
        <Card>
          <ErrorState title="Couldn’t load your earnings" error={error} onRetry={reload} />
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.page}>
        <PageHeader title="Earnings" subtitle="Your payouts from the platform." />
        <Card>
          <EmptyState icon="store" title="Create your restaurant first" action={<Button to="/owner">Set up restaurant</Button>}>
            Earnings appear here once you are approved and start completing orders.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const { totals, recent } = data;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Earnings"
        subtitle="What you have earned from collected orders, and what is still owed."
        hint="Only collected orders are payable. The platform fee is your commission rate applied to the food total; delivery fees are kept by the platform."
      />

      <div className={styles.stats}>
        <Stat
          icon="cash"
          label="Owed to you"
          value={money(totals.pending)}
          hint="Collected orders the platform has not paid out yet."
        />
        <Stat icon="check" label="Paid out" value={money(totals.paid)} hint={`Across ${totals.orders} collected orders.`} />
        <Stat
          icon="chart"
          label="Platform fee"
          value={money(totals.commission)}
          hint={`Charged on ${money(totals.gross)} of food sales.`}
        />
      </div>

      <Card as="section">
        <CardHeader
          title="Recent payouts"
          hint="The ten most recent collected orders, newest first."
          actions={recent.length > 0 && <Button variant="ghost" icon="refresh" onClick={reload}>Refresh</Button>}
        />
        {recent.length === 0 ? (
          <EmptyState icon="receipt" title="No payouts yet">
            Complete an order and it will appear here once the customer collects it.
          </EmptyState>
        ) : (
          <Table columns={columns} rows={recent} rowTo={(o) => `/orders/${o._id}`} caption="Recent payouts" />
        )}
      </Card>
    </div>
  );
}
