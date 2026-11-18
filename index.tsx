
import React, { Suspense, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import 'mapbox-gl/dist/mapbox-gl.css';
import { LocalizationProvider } from './context/LocalizationContext';
import { AuthProvider } from './context/AuthContext';
import { shouldUseMobileShell } from './lib/appShellTarget';
import { registerServiceWorker } from './lib/registerServiceWorker';

registerServiceWorker();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const forceMobileBuild = import.meta.env.VITE_APP_TARGET === 'mobile';
const MobileApp = React.lazy(() =>
  import('./mobile/app/MobileApp').then((module) => ({ default: module.MobileApp }))
);
const WebApp = React.lazy(() =>
  import('./web/app/WebApp').then((module) => ({ default: module.WebApp }))
);

function getAppTarget(): 'web' | 'mobile' {
  if (forceMobileBuild) return 'mobile';
  return shouldUseMobileShell({
    width: window.innerWidth,
    height: window.innerHeight,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
  })
    ? 'mobile'
    : 'web';
}

function AppEntry() {
  const [target, setTarget] = useState(getAppTarget);

  useEffect(() => {
    if (forceMobileBuild) return undefined;

    const updateTarget = () => {
      const nextTarget = getAppTarget();
      setTarget((currentTarget) => currentTarget === nextTarget ? currentTarget : nextTarget);
    };

    window.addEventListener('resize', updateTarget);
    window.addEventListener('orientationchange', updateTarget);
    return () => {
      window.removeEventListener('resize', updateTarget);
      window.removeEventListener('orientationchange', updateTarget);
    };
  }, []);

  const App = target === 'mobile' ? MobileApp : WebApp;
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}

root.render(
  <React.StrictMode>
    <LocalizationProvider>
      <AuthProvider>
        <AppEntry />
      </AuthProvider>
    </LocalizationProvider>
  </React.StrictMode>
);
