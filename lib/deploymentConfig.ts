function readEnv(name: string): string {
  const raw = import.meta.env[name] as string | undefined;
  return raw?.trim() ?? '';
}

function replaceTemplate(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    return value == null ? '' : encodeURIComponent(String(value));
  });
}

const appVariant = readEnv('VITE_APP_VARIANT') || 'global';
const amapWebKey = readEnv('VITE_AMAP_WEB_KEY');
const amapJsKey = readEnv('VITE_AMAP_JS_KEY') || amapWebKey;
const mapboxAccessToken = readEnv('VITE_MAPBOX_ACCESS_TOKEN');
const mapboxStyle = readEnv('VITE_MAPBOX_STYLE') || 'mapbox://styles/mapbox/standard';

const defaultTileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const defaultTileAttribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const defaultTileSubdomains = 'abcd';

const defaultPlaceSearchTemplate =
  'https://nominatim.openstreetmap.org/search?format=jsonv2&q={query}&accept-language={lang}&limit={limit}';
const defaultReverseGeocodeTemplate =
  'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lng}&accept-language={lang}&zoom={zoom}';
const defaultIpGeoUrl = 'https://ipapi.co/json/';
const cnTileUrl =
  'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
const cnTileAttribution = '© AutoNavi';
const cnTileSubdomains = '1234';
const cnPlaceSearchTemplate =
  'https://restapi.amap.com/v3/assistant/inputtips?output=json&key={key}&keywords={query}&datatype=all&citylimit=false';
const cnReverseGeocodeTemplate =
  'https://restapi.amap.com/v3/geocode/regeo?output=json&location={lng},{lat}&key={key}&radius=1000&extensions=all';
const cnIpGeoUrl = 'https://restapi.amap.com/v3/ip?output=json&key={key}';
const cnMapStyle = '';

function withKey(template: string): string {
  return template.replace(/\{key\}/g, amapWebKey);
}

export const deploymentConfig = {
  appVariant,
  isCnVariant: appVariant === 'cn',
  amapWebKey,
  amapJsKey,
  mapboxAccessToken,
  mapboxStyle,
  mapTileUrl: readEnv('VITE_MAP_TILE_URL') || (appVariant === 'cn' ? cnTileUrl : defaultTileUrl),
  mapTileAttribution:
    readEnv('VITE_MAP_TILE_ATTRIBUTION') || (appVariant === 'cn' ? cnTileAttribution : defaultTileAttribution),
  mapTileSubdomains:
    readEnv('VITE_MAP_TILE_SUBDOMAINS') || (appVariant === 'cn' ? cnTileSubdomains : defaultTileSubdomains),
  placeSearchTemplate:
    readEnv('VITE_PLACE_SEARCH_TEMPLATE') ||
    (appVariant === 'cn' ? withKey(cnPlaceSearchTemplate) : defaultPlaceSearchTemplate),
  reverseGeocodeTemplate:
    readEnv('VITE_REVERSE_GEOCODE_TEMPLATE') ||
    (appVariant === 'cn' ? withKey(cnReverseGeocodeTemplate) : defaultReverseGeocodeTemplate),
  ipGeoUrl:
    readEnv('VITE_IP_GEO_URL') || (appVariant === 'cn' ? withKey(cnIpGeoUrl) : defaultIpGeoUrl),
  mapTileClassName: appVariant === 'cn' ? 'echo-map-tile-layer echo-map-tile-layer-cn' : 'echo-map-tile-layer',
  amapMapStyle: readEnv('VITE_AMAP_MAP_STYLE') || (appVariant === 'cn' ? cnMapStyle : ''),
};

export function buildPlaceSearchUrl(query: string, lang: string, limit = 5): string {
  return replaceTemplate(deploymentConfig.placeSearchTemplate, { query, lang, limit });
}

export function buildReverseGeocodeUrl(
  lat: number,
  lng: number,
  lang: string,
  zoom: number
): string {
  return replaceTemplate(deploymentConfig.reverseGeocodeTemplate, { lat, lng, lang, zoom });
}

export function getIpGeoUrl(): string {
  return deploymentConfig.ipGeoUrl;
}
