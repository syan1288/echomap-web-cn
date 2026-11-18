import mapboxgl from 'mapbox-gl';

let prewarmed = false;

function prewarmMapboxRuntime() {
  if (prewarmed) return;
  prewarmed = true;
  mapboxgl.prewarm?.();
}

export async function loadMapbox(accessToken: string): Promise<any> {
  if (!accessToken) {
    throw new Error('VITE_MAPBOX_ACCESS_TOKEN is missing');
  }
  mapboxgl.accessToken = accessToken;
  prewarmMapboxRuntime();
  return mapboxgl;
}

export function prewarmMapbox(accessToken: string): void {
  if (!accessToken) return;
  mapboxgl.accessToken = accessToken;
  prewarmMapboxRuntime();
}
