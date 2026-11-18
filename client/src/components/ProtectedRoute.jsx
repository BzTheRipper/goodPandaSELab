import { Navigate, useLocation } from 'react-router-dom';
import { homeFor, useAuth } from '../context/AuthContext.jsx';
import { Button, Card, EmptyState, PageLoader } from './ui/index.js';

export default function ProtectedRoute({ roles, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) {
    return (
      <Card padding="none">
        <EmptyState
          icon="lock"
          titleAs="h1"
          title="You don't have access to this page"
          action={
            <Button variant="primary" to={homeFor(user)} icon="home">
              Take me home
            </Button>
          }
        >
          It belongs to a different type of account.
        </EmptyState>
      </Card>
    );
  }
  return children;
}
