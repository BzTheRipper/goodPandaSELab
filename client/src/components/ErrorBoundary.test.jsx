import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary.jsx';

function Crashes({ when }) {
  if (when) throw new Error('boom');
  return <p>Page content</p>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught render errors to the console; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the page normally when nothing crashes', () => {
    render(
      <MemoryRouter>
        <ErrorBoundary scope="page">
          <Crashes when={false} />
        </ErrorBoundary>
      </MemoryRouter>
    );
    expect(screen.getByText('Page content')).toBeTruthy();
  });

  it('shows a friendly message instead of a white screen when a page crashes', () => {
    render(
      <MemoryRouter>
        <ErrorBoundary scope="page">
          <Crashes when />
        </ErrorBoundary>
      </MemoryRouter>
    );
    expect(screen.getByRole('alert').textContent).toContain('This page couldn’t load');
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /go to home page/i }).getAttribute('href')).toBe('/');
  });

  it('"Try again" draws the page again once the problem is gone', async () => {
    function Harness() {
      const [broken, setBroken] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setBroken(false)}>
            fix it
          </button>
          <ErrorBoundary scope="page">
            <Crashes when={broken} />
          </ErrorBoundary>
        </>
      );
    }
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'fix it' }));
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('Page content')).toBeTruthy();
  });

  it('the app-level message offers a reload and works without the router', () => {
    render(
      <ErrorBoundary scope="app">
        <Crashes when />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy();
  });
});
