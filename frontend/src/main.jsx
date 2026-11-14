import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { loadProfile } from './lib/profile';
import './index.css';

// The operator profile (fleets, name, feature switches) has to be known
// before any page module is evaluated - several pages build their fleet
// lists at import time - so load it first and only then import the app.
loadProfile()
  .then(() => Promise.all([import('./App'), import('./context/AuthContext')]))
  .then(([{ default: App }, { AuthProvider }]) => {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </React.StrictMode>,
    );
  });
