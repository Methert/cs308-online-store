import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App.jsx';
import { ShopProvider } from './state/ShopContext.jsx';
import { loadCatalog } from './state/catalog.js';
import './styles.css';

// Load the server catalog without substituting demo records during outages.
loadCatalog();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ShopProvider><App /></ShopProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
