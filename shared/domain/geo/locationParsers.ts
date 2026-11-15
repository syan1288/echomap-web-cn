export interface SearchSuggestion {
  key: string;
  label: string;
  lat: number;
  lng: number;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseLngLatPair(input: string | undefined): { lng: number; lat: number } | null {
  if (!input) return null;
  const [lngText, latText] = input.split(',');
  const lng = toNumber(lngText);
  const lat = toNumber(latText);
  if (lng == null || lat == null) return null;
  return { lng, lat };
}

function centerFromRectangle(input: string | undefined): { lng: number; lat: number } | null {
  if (!input) return null;
  const [sw, ne] = input.split(';');
  const a = parseLngLatPair(sw);
  const b = parseLngLatPair(ne);
  if (!a || !b) return null;
  return {
    lng: (a.lng + b.lng) / 2,
    lat: (a.lat + b.lat) / 2,
  };
}

export function parseSearchSuggestions(payload: unknown): SearchSuggestion[] {
  if (Array.isArray(payload)) {
    return payload
      .map((item, index) => {
        const row = item as {
          place_id?: number;
          display_name?: string;
          lat?: string;
          lon?: string;
        };
        const lat = toNumber(row.lat);
        const lng = toNumber(row.lon);
        if (!row.display_name || lat == null || lng == null) return null;
        return {
          key: String(row.place_id ?? `${row.display_name}-${index}`),
          label: row.display_name,
          lat,
          lng,
        };
      })
      .filter((item): item is SearchSuggestion => Boolean(item));
  }

  if (!payload || typeof payload !== 'object') return [];

  const amapTips = (payload as { tips?: Array<Record<string, unknown>> }).tips;
  if (Array.isArray(amapTips)) {
    return amapTips
      .map((tip, index) => {
        const point = parseLngLatPair(typeof tip.location === 'string' ? tip.location : undefined);
        if (!point) return null;
        const name = typeof tip.name === 'string' ? tip.name : '';
        const district = typeof tip.district === 'string' ? tip.district : '';
        const address = typeof tip.address === 'string' ? tip.address : '';
        const label = [name, district || address].filter(Boolean).join(' · ') || name;
        if (!label) return null;
        return {
          key: String(tip.id ?? `${label}-${index}`),
          label,
          lat: point.lat,
          lng: point.lng,
        };
      })
      .filter((item): item is SearchSuggestion => Boolean(item));
  }

  const amapPois = (payload as { pois?: Array<Record<string, unknown>> }).pois;
  if (Array.isArray(amapPois)) {
    return amapPois
      .map((poi, index) => {
        const point = parseLngLatPair(typeof poi.location === 'string' ? poi.location : undefined);
        if (!point) return null;
        const name = typeof poi.name === 'string' ? poi.name : '';
        const address = typeof poi.address === 'string' ? poi.address : '';
        const city = typeof poi.cityname === 'string' ? poi.cityname : '';
        const label = [name, city || address].filter(Boolean).join(' · ') || name;
        if (!label) return null;
        return {
          key: String(poi.id ?? `${label}-${index}`),
          label,
          lat: point.lat,
          lng: point.lng,
        };
      })
      .filter((item): item is SearchSuggestion => Boolean(item));
  }

  return [];
}

export function parseReverseGeocodeLabel(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';

  const nominatim = payload as {
    display_name?: string;
    address?: Record<string, string | undefined>;
  };
  if (nominatim.address) {
    const city =
      nominatim.address.city ||
      nominatim.address.town ||
      nominatim.address.village ||
      nominatim.address.municipality ||
      nominatim.address.state ||
      '';
    const country = nominatim.address.country || '';
    if (city && country) return `${city}, ${country}`;
    return nominatim.display_name || '';
  }

  const amap = payload as {
    regeocode?: {
      formatted_address?: string;
      addressComponent?: {
        city?: string | string[];
        province?: string;
        district?: string;
      };
    };
  };
  if (amap.regeocode) {
    const cityValue = amap.regeocode.addressComponent?.city;
    const city =
      typeof cityValue === 'string'
        ? cityValue
        : Array.isArray(cityValue)
          ? cityValue.find((item): item is string => typeof item === 'string' && item.length > 0) || ''
          : '';
    const province = amap.regeocode.addressComponent?.province || '';
    const district = amap.regeocode.addressComponent?.district || '';
    return [city || province, district].filter(Boolean).join(', ') || amap.regeocode.formatted_address || '';
  }

  return '';
}

export function parseReverseGeocodePlace(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';

  const nominatim = payload as {
    display_name?: string;
    name?: string;
    address?: Record<string, string | undefined>;
  };
  if (nominatim.address) {
    const poi =
      nominatim.address.tourism ||
      nominatim.address.amenity ||
      nominatim.address.shop ||
      nominatim.address.historic ||
      nominatim.address.public_building ||
      nominatim.name ||
      '';
    const city =
      nominatim.address.city || nominatim.address.town || nominatim.address.village || '';
    const country = nominatim.address.country || '';
    if (poi && city) return `${poi}, ${city}`;
    if (city && country) return `${city}, ${country}`;
    return nominatim.display_name || '';
  }

  const amap = payload as {
    regeocode?: {
      formatted_address?: string;
      pois?: Array<{ name?: string }>;
      addressComponent?: {
        city?: string | string[];
        province?: string;
      };
    };
  };
  if (amap.regeocode) {
    const poi = amap.regeocode.pois?.[0]?.name || '';
    const cityValue = amap.regeocode.addressComponent?.city;
    const city =
      typeof cityValue === 'string'
        ? cityValue
        : Array.isArray(cityValue)
          ? cityValue.find((item): item is string => typeof item === 'string' && item.length > 0) || ''
          : '';
    const province = amap.regeocode.addressComponent?.province || '';
    if (poi && (city || province)) return `${poi}, ${city || province}`;
    return amap.regeocode.formatted_address || '';
  }

  return '';
}

export function parseIpLocation(payload: unknown): { lat: number; lng: number } | null {
  if (!payload || typeof payload !== 'object') return null;

  const ipApi = payload as { latitude?: unknown; longitude?: unknown };
  const lat = toNumber(ipApi.latitude);
  const lng = toNumber(ipApi.longitude);
  if (lat != null && lng != null) return { lat, lng };

  const amap = payload as { rectangle?: string };
  return centerFromRectangle(amap.rectangle);
}

