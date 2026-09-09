// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Admin from './Admin.jsx';
import './currentConditionsPrepaintGuard.js';
import './comparisonEnhancements.js';
import './currentConditionsBranding.js';
import './currentConditionsSubtitleStable.js';
import './index.css';

const isAdminRoute = window.location.pathname === '/admin' ||
  window.location.pathname.startsWith('/admin/');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAdminRoute ? <Admin /> : <App />}
  </React.StrictMode>
);
