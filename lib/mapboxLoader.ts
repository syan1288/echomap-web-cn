import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export async function loadMapbox(accessToken: string): Promise<any> {
  if (!accessToken) {
    throw new Error('VITE_MAPBOX_ACCESS_TOKEN is missing');
  }
  mapboxgl.accessToken = accessToken;
  return mapboxgl;
}
