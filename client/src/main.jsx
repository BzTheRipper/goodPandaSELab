import '@fontsource-variable/inter';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { ConfirmProvider, ToastProvider } from './components/ui/index.js';
import { AuthProvider } from './context/AuthContext.jsx';
import { CartProvider } from './context/CartContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import './styles/tokens.css';
import './styles/base.css';
import { I18nProvider } from './i18n/useI18n.jsx';

// Register the service worker for PWA support (push notifications, offline fallback).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js')
    .then(() => console.log('[pwa] service worker registered'))
    .catch((err) => console.warn('[pwa] service worker registration failed:', err));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Last resort: if anything outside a single page crashes (header, menu, providers),
        show a friendly message with a Reload button instead of a white screen. */}
    <ErrorBoundary scope="app">
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <SocketProvider>
              <CartProvider>
                <I18nProvider>
                  <App />
                </I18nProvider>
              </CartProvider>
            </SocketProvider>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
