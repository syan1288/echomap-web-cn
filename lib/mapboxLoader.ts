declare global {
  interface Window {
    mapboxgl?: any;
    _echoMapboxLoading?: Promise<any>;
  }
}

const MAPBOX_GL_JS_URL = 'https://api.mapbox.com/mapbox-gl-js/v3.19.1/mapbox-gl.js';

export async function loadMapbox(accessToken: string): Promise<any> {
  if (!accessToken) {
    throw new Error('VITE_MAPBOX_ACCESS_TOKEN is missing');
  }

  if (window.mapboxgl) {
    window.mapboxgl.accessToken = accessToken;
    return window.mapboxgl;
  }

  if (window._echoMapboxLoading) {
    const mapboxgl = await window._echoMapboxLoading;
    mapboxgl.accessToken = accessToken;
    return mapboxgl;
  }

  window._echoMapboxLoading = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${MAPBOX_GL_JS_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        if (!window.mapboxgl) {
          reject(new Error('Mapbox GL JS loaded without window.mapboxgl'));
          return;
        }
        window.mapboxgl.accessToken = accessToken;
        resolve(window.mapboxgl);
      });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Mapbox GL JS')));
      return;
    }

    const script = document.createElement('script');
    script.src = MAPBOX_GL_JS_URL;
    script.async = true;
    script.onload = () => {
      if (!window.mapboxgl) {
        reject(new Error('Mapbox GL JS loaded without window.mapboxgl'));
        return;
      }
      window.mapboxgl.accessToken = accessToken;
      resolve(window.mapboxgl);
    };
    script.onerror = () => reject(new Error('Failed to load Mapbox GL JS'));
    document.head.appendChild(script);
  });

  return window._echoMapboxLoading;
}
