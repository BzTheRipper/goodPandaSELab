import { Component } from 'react';
import { Button, ErrorState } from './ui/index.js';
import styles from './ErrorBoundary.module.css';

/**
 * Catches a crash while drawing part of the screen and shows a friendly message instead of
 * a blank white page.
 *
 * - `scope="page"` wraps one page: the header and menu stay usable. Give it a `key` that
 *   changes on navigation (e.g. the pathname) so moving to another page clears the error.
 * - `scope="app"` wraps the whole app as a last resort (e.g. the header itself crashed).
 *   It only uses plain links and a reload, because the router or providers may be broken.
 *
 * Note: React error boundaries catch errors thrown while rendering. Errors inside click
 * handlers or async requests are handled where they happen (toasts, ErrorState, etc.).
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the details in the browser console for whoever is debugging.
    console.error('[ErrorBoundary] crashed while rendering', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    if (this.props.scope === 'app') {
      return (
        <main className={styles.app}>
          <ErrorState
            title="Something went wrong"
            error="GoodPanda hit an unexpected problem. Reloading usually fixes it."
            action={
              <>
                <Button variant="primary" icon="refresh" onClick={() => window.location.reload()}>
                  Reload
                </Button>
                <Button variant="secondary" onClick={() => window.location.assign('/')}>
                  Go to home page
                </Button>
              </>
            }
          />
        </main>
      );
    }

    return (
      <div className={styles.page}>
        <ErrorState
          title="This page couldn’t load"
          error="Something went wrong on our side. Try again, or go back to the home page."
          onRetry={this.reset}
          action={
            <Button to="/" variant="secondary">
              Go to home page
            </Button>
          }
        />
      </div>
    );
  }
}
