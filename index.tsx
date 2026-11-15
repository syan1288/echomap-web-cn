
import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import 'mapbox-gl/dist/mapbox-gl.css';
import { LocalizationProvider } from './context/LocalizationContext';
import { AuthProvider } from './context/AuthContext';
import { registerServiceWorker } from './lib/registerServiceWorker';

registerServiceWorker();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const RootApp = React.lazy(() =>
  import.meta.env.VITE_APP_TARGET === 'mobile'
    ? import('./mobile/app/MobileApp').then((module) => ({ default: module.MobileApp }))
    : import('./web/app/WebApp').then((module) => ({ default: module.WebApp }))
);

root.render(
  <React.StrictMode>
    <LocalizationProvider>
      <AuthProvider>
        <Suspense fallback={null}>
          <RootApp />
        </Suspense>
      </AuthProvider>
    </LocalizationProvider>
  </React.StrictMode>
);
