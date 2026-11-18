import '@fontsource-variable/inter';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ConfirmProvider, ToastProvider } from './components/ui/index.js';
import { AuthProvider } from './context/AuthContext.jsx';
import { CartProvider } from './context/CartContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import './styles/tokens.css';
import './styles/base.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <SocketProvider>
              <CartProvider>
                <App />
              </CartProvider>
            </SocketProvider>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
