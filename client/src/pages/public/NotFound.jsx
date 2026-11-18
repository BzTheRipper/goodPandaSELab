import { useAuth, homeFor } from '../../context/AuthContext.jsx';
import { Button, Card, EmptyState } from '../../components/ui/index.js';

export default function NotFound() {
  const { user } = useAuth();
  const home = homeFor(user);
  return (
    <Card padding="none">
      <EmptyState
        icon="mapPin"
        titleAs="h1"
        title="We couldn't find that page"
        action={
          <>
            <Button variant="primary" to={home} icon="home">
              {home === '/' ? 'Browse restaurants' : 'Go to dashboard'}
            </Button>
            <Button variant="ghost" onClick={() => window.history.back()}>
              Go back
            </Button>
          </>
        }
      >
        The link may be broken, or the page may have moved.
      </EmptyState>
    </Card>
  );
}
