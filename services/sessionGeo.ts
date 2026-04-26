export type SessionAnchor = { lat: number; lng: number };
import { buildReverseGeocodeUrl, getIpGeoUrl } from '../lib/deploymentConfig';
import { parseIpLocation, parseReverseGeocodeLabel } from '../lib/locationAdapters';

/** 浏览器定位失败时用 IP 兜底（无自建后端，标准化 JSON） */
export async function resolveSessionAnchor(): Promise<SessionAnchor> {
  return new Promise((resolve) => {
    const fallbackIp = async () => {
      try {
        const r = await fetch(getIpGeoUrl());
        const j = await r.json();
        const point = parseIpLocation(j);
        if (point) {
          resolve(point);
          return;
        }
      } catch {
        /* empty */
      }
      resolve({ lat: 20, lng: 0 });
    };

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      void fallbackIp();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        void fallbackIp();
      },
      { maximumAge: 120_000, timeout: 12_000, enableHighAccuracy: false }
    );
  });
}

/** 展示用：City, Country */
export async function formatCityCountry(lat: number, lng: number, lang: string): Promise<string> {
  try {
    const r = await fetch(buildReverseGeocodeUrl(lat, lng, lang, 10));
    if (!r.ok) return '';
    const data = await r.json();
    return parseReverseGeocodeLabel(data);
  } catch {
    return '';
  }
}
