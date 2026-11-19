type LatLngTuple = [number, number];
type BoundsTuple = Array<LatLngTuple>;
type RasterStyle = {
  version: 8;
  sources: Record<string, {
    type: 'raster';
    tiles: string[];
    tileSize: number;
    attribution?: string;
  }>;
  layers: Array<{
    id: string;
    type: 'raster';
    source: string;
    minzoom: number;
    maxzoom: number;
  }>;
};

export function createRasterFallbackStyle(tileUrl: string, attribution = ''): RasterStyle {
  const normalizedTileUrl = tileUrl.replace(/\{s\}/g, '1').replace(/\{r\}/g, '');
  return {
    version: 8,
    sources: {
      'echo-fallback': {
        type: 'raster',
        tiles: [normalizedTileUrl],
        tileSize: 256,
        ...(attribution ? { attribution } : {}),
      },
    },
    layers: [{
      id: 'echo-fallback-raster-layer',
      type: 'raster',
      source: 'echo-fallback',
      minzoom: 0,
      maxzoom: 22,
    }],
  };
}

export type BasemapThemeId = 'paper' | 'mist' | 'grey' | 'clove';

export const BASEMAP_THEME_OPTIONS: Array<{ id: BasemapThemeId; label: string }> = [
  { id: 'paper', label: 'Paper' },
  { id: 'mist', label: 'Mist' },
  { id: 'grey', label: 'Grey' },
  { id: 'clove', label: 'Clove' },
];

const PAPER_STUDIO_STYLE_URL = 'mapbox://styles/xushiyan/ckroumvat4k4a17o1ahqyj35n';
const CLOVE_STUDIO_STYLE_URL = 'mapbox://styles/xushiyan/ckrzqezy41kp517qo3dov4b6h';
const GREY_STUDIO_STYLE_URL = 'mapbox://styles/xushiyan/clczvbezi00lq14qnuujyqtoe';

type BasemapTheme = {
  land: string;
  water: string;
  landcover: string;
  boundary: string;
  waterway: string;
  nodePalette: string[];
  connection: string;
};

export const POI_DOT_COLOR_PALETTE = [
  '#7DD3FC',
  '#60A5FA',
  '#38BDF8',
  '#0EA5E9',
  '#3B82F6',
  '#2563EB',
  '#1D4ED8',
  '#0284C7',
];

function stableColorHash(value: number | string): number {
  const input = String(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getPoiDotColor(seed: number | string): string {
  return POI_DOT_COLOR_PALETTE[stableColorHash(seed) % POI_DOT_COLOR_PALETTE.length];
}

export function getPoiDotSize(seed: number | string, min = 9, spread = 11): number {
  return min + (stableColorHash(seed) % spread);
}

const BASEMAP_THEMES: Record<BasemapThemeId, BasemapTheme> = {
  paper: {
    land: '#f7f1e4',
    water: '#ece6d8',
    landcover: '#efe6d4',
    boundary: '#c3b8a6',
    waterway: '#d8ccb8',
    nodePalette: ['#d6b892', '#d9ba8c', '#cfae84', '#d8c09d'],
    connection: 'rgba(167, 144, 116, 0.28)',
  },
  mist: {
    land: '#f6f7f4',
    water: '#dde9ee',
    landcover: '#e9eef0',
    boundary: '#aab9c3',
    waterway: '#c2d4dd',
    nodePalette: ['#93c5fd', '#7dd3fc', '#60a5fa', '#38bdf8', '#3b82f6', '#2563eb', '#0ea5e9'],
    connection: 'rgba(97, 132, 166, 0.28)',
  },
  grey: {
    land: '#efefec',
    water: '#dcdedc',
    landcover: '#e3e4e1',
    boundary: '#a7acab',
    waterway: '#bcc1bf',
    nodePalette: ['#aeb7bf', '#a7b0b8', '#98a2ab', '#8a97a1'],
    connection: 'rgba(126, 136, 145, 0.28)',
  },
  clove: {
    land: '#f3eadf',
    water: '#dfd4c5',
    landcover: '#eadfce',
    boundary: '#baac97',
    waterway: '#cdbda7',
    nodePalette: ['#b79072', '#c2a086', '#ad8668', '#8d6f59'],
    connection: 'rgba(146, 117, 94, 0.28)',
  },
};

export function getBasemapTheme(themeId: BasemapThemeId): BasemapTheme {
  return BASEMAP_THEMES[themeId];
}

type MapBounds = {
  points: BoundsTuple;
  paddingRatio: number;
  pad: (ratio: number) => MapBounds;
};

function buildMapBounds(points: BoundsTuple, paddingRatio = 0): MapBounds {
  return {
    points,
    paddingRatio,
    pad(ratio: number) {
      return buildMapBounds(points, ratio);
    },
  };
}

export function createMapBounds(points: BoundsTuple): MapBounds {
  return buildMapBounds(points);
}

function toLngLat(latlng: LatLngTuple): [number, number] {
  return [latlng[1], latlng[0]];
}

function safelySetLayoutVisibility(map: any, layerId: string, visibility: 'visible' | 'none') {
  try {
    map.setLayoutProperty(layerId, 'visibility', visibility);
  } catch {
    // noop: some imported style layers are read-only / unavailable during transitions
  }
}

function safelySetPaint(map: any, layerId: string, prop: string, value: unknown) {
  try {
    map.setPaintProperty(layerId, prop, value);
  } catch {
    // noop
  }
}

export class MapboxAdapter {
  private map: any;
  private listeners = new Map<Function, Function>();
  private basemapTheme: BasemapThemeId = 'mist';
  private defaultStyle: string;
  private currentStyle: string;
  private editorialStyleBound = false;

  constructor(
    mapboxgl: any,
    container: HTMLDivElement,
    options: {
      center: LatLngTuple;
      zoom: number;
      minZoom: number;
      maxZoom: number;
      style: string;
      fallbackStyle?: RasterStyle;
      fallbackStyleTimeoutMs?: number;
    }
  ) {
    this.defaultStyle = options.style;
    this.fallbackStyle = options.fallbackStyle;
    this.currentStyle = this.resolveStyleForTheme(this.basemapTheme);
    this.map = new mapboxgl.Map({
      container,
      style: this.currentStyle,
      center: toLngLat(options.center),
      zoom: options.zoom,
      minZoom: options.minZoom,
      maxZoom: options.maxZoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      antialias: false,
      interactive: true,
      cooperativeGestures: false,
      projection: 'mercator',
      ...( /mapbox\/standard/i.test(this.currentStyle)
        ? {
            config: {
              basemap: {
                theme: 'monochrome',
                lightPreset: 'day',
                showPlaceLabels: false,
                showPointOfInterestLabels: false,
                showRoadLabels: false,
                showTransitLabels: false,
              },
            },
          }
        : {}),
    });
    this.enableInteractions();
  }

  destroy() {
    this.clearFallbackStyleTimer();
    this.map?.off?.('error', this.handleInitialStyleError);
    this.map?.remove?.();
  }

  setBasemapTheme(themeId: BasemapThemeId) {
    this.basemapTheme = themeId;
    if (this.fallbackStyleApplied) return;
    const nextStyle = this.resolveStyleForTheme(themeId);
    if (nextStyle !== this.currentStyle) {
      this.currentStyle = nextStyle;
      this.map.setStyle(nextStyle);
      this.map.once('style.load', () => this.applyEditorialStyle());
      return;
    }
    this.applyEditorialStyle();
  }

  applyEditorialStyle() {
    if (this.fallbackStyleApplied) return;
    const apply = () => {
      if (!this.shouldApplyEditorialPaint()) return;
      const style = this.map.getStyle?.();
      const layers = style?.layers ?? [];
      const isLightStyle = /light-v11/i.test(this.map.getStyle?.().name || '') || /light-v11/i.test(JSON.stringify(style?.sprite || ''));
      const theme = BASEMAP_THEMES[this.basemapTheme];
      for (const layer of layers) {
        const id = layer.id as string;
        const type = layer.type as string;

        if (type === 'symbol' || type === 'circle' || type === 'fill-extrusion') {
          safelySetLayoutVisibility(this.map, id, 'none');
          continue;
        }

        if (isLightStyle) {
          if (type === 'line') {
            if (/(road|bridge|tunnel|rail|transit|path|ferry|runway|aeroway)/i.test(id)) {
              safelySetLayoutVisibility(this.map, id, 'none');
              continue;
            }

            if (/(admin|boundary|country|state|province|disputed)/i.test(id)) {
              safelySetPaint(this.map, id, 'line-color', theme.boundary);
              safelySetPaint(this.map, id, 'line-width', 1.1);
              safelySetPaint(this.map, id, 'line-opacity', 0.7);
              continue;
            }

            if (/waterway/i.test(id)) {
              safelySetPaint(this.map, id, 'line-color', theme.waterway);
              safelySetPaint(this.map, id, 'line-width', 0.9);
              safelySetPaint(this.map, id, 'line-opacity', 0.72);
              continue;
            }
          }

          if (type === 'fill') {
            if (/(building|airport|runway|road|bridge|tunnel|land-structure)/i.test(id)) {
              safelySetLayoutVisibility(this.map, id, 'none');
              continue;
            }

            if (id === 'water' || /water/i.test(id)) {
              safelySetPaint(this.map, id, 'fill-color', theme.water);
              safelySetPaint(this.map, id, 'fill-opacity', 1);
              continue;
            }

            if (/(national-park|landuse|landcover)/i.test(id)) {
              safelySetPaint(this.map, id, 'fill-color', theme.landcover);
              safelySetPaint(this.map, id, 'fill-opacity', 0.85);
              continue;
            }
          }

          if (type === 'background' && id === 'land') {
            safelySetPaint(this.map, id, 'background-color', theme.land);
            continue;
          }

          continue;
        }

        if (type === 'line') {
          if (/(road|bridge|tunnel|rail|transit|path|ferry|runway|aeroway)/i.test(id)) {
            safelySetLayoutVisibility(this.map, id, 'none');
            continue;
          }

          if (/(admin|boundary|country|state|province|disputed)/i.test(id)) {
            safelySetPaint(this.map, id, 'line-color', theme.boundary);
            safelySetPaint(this.map, id, 'line-width', 1.25);
            safelySetPaint(this.map, id, 'line-opacity', 0.82);
            continue;
          }

          if (/water/i.test(id)) {
            safelySetPaint(this.map, id, 'line-color', theme.waterway);
            safelySetPaint(this.map, id, 'line-width', 1.1);
            safelySetPaint(this.map, id, 'line-opacity', 0.62);
            continue;
          }

          safelySetLayoutVisibility(this.map, id, 'none');
          continue;
        }

        if (type === 'fill') {
          if (/(building|airport|runway|road|bridge|tunnel)/i.test(id)) {
            safelySetLayoutVisibility(this.map, id, 'none');
            continue;
          }

          if (/water/i.test(id)) {
            safelySetPaint(this.map, id, 'fill-color', theme.water);
            safelySetPaint(this.map, id, 'fill-opacity', 1);
            continue;
          }

          if (/(landcover|landuse|park|forest|wood|grass|glacier|wetland)/i.test(id)) {
            safelySetPaint(this.map, id, 'fill-color', theme.landcover);
            safelySetPaint(this.map, id, 'fill-opacity', 0.9);
            continue;
          }

          if (/(admin|country|state|province)/i.test(id)) {
            safelySetPaint(this.map, id, 'fill-color', theme.land);
            safelySetPaint(this.map, id, 'fill-opacity', 0.94);
            continue;
          }
        }

        if (type === 'background') {
          safelySetPaint(this.map, id, 'background-color', theme.land);
        }
      }
    };

    if (this.map.isStyleLoaded?.()) {
      apply();
    } else {
      this.map.once('style.load', apply);
    }
    if (!this.editorialStyleBound) {
      this.editorialStyleBound = true;
      this.map.on('style.load', apply);
    }
  }

  private resolveStyleForTheme(themeId: BasemapThemeId) {
    if (themeId === 'paper') return PAPER_STUDIO_STYLE_URL;
    if (themeId === 'grey') return GREY_STUDIO_STYLE_URL;
    if (themeId === 'clove') return CLOVE_STUDIO_STYLE_URL;
    return this.defaultStyle;
  }

  private shouldApplyEditorialPaint() {
    return this.currentStyle === this.defaultStyle || /light-v11|standard/i.test(this.currentStyle);
  }

  on(event: string, handler: (evt?: any) => void) {
    const wrapped = this.wrapEvent(handler);
    this.listeners.set(handler, wrapped);
    this.map.on(event, wrapped);
  }

  off(event: string, handler: (evt?: any) => void) {
    const wrapped = this.listeners.get(handler);
    if (!wrapped) return;
    this.map.off(event, wrapped);
    this.listeners.delete(handler);
  }

  once(event: string, handler: (evt?: any) => void) {
    const wrapped = this.wrapEvent(handler);
    this.listeners.set(handler, wrapped);
    this.map.once(event, wrapped);
  }

  whenReady(handler: () => void) {
    let completed = false;
    const complete = () => {
      if (completed) return;
      completed = true;
      handler();
    };

    if (this.map.loaded?.() || this.map.isStyleLoaded?.()) {
      complete();
      return;
    }

    this.map.once('load', complete);
    this.map.once('style.load', complete);
    this.map.once('idle', complete);

    if (typeof window !== 'undefined') {
      window.setTimeout(complete, 1200);
    }
  }

  getZoom(): number {
    return this.map.getZoom();
  }

  setView(latlng: LatLngTuple, zoom?: number) {
    if (typeof zoom === 'number') {
      this.map.jumpTo({ center: toLngLat(latlng), zoom });
      return;
    }
    this.map.jumpTo({ center: toLngLat(latlng) });
  }

  fitBounds(bounds: MapBounds) {
    const points = bounds.points.map(toLngLat);
    const paddingRatio = bounds.paddingRatio || 0;
    const width = this.map.getContainer().clientWidth || 0;
    const height = this.map.getContainer().clientHeight || 0;
    const padding = Math.max(80, Math.round(Math.min(width, height) * paddingRatio));
    this.map.fitBounds(points as any, {
      padding,
      duration: 280,
      essential: true,
    });
  }

  zoomIn() {
    const currentZoom = this.map.getZoom();
    const maxZoom = this.map.getMaxZoom?.() ?? 18;
    this.map.easeTo({ zoom: Math.min(maxZoom, currentZoom + 1), duration: 180, essential: true });
  }

  zoomOut() {
    const currentZoom = this.map.getZoom();
    const minZoom = this.map.getMinZoom?.() ?? 0;
    this.map.easeTo({ zoom: Math.max(minZoom, currentZoom - 1), duration: 180, essential: true });
  }

  private enableInteractions() {
    this.map.scrollZoom?.enable?.();
    this.map.boxZoom?.enable?.();
    this.map.dragPan?.enable?.();
    this.map.doubleClickZoom?.enable?.();
    this.map.keyboard?.enable?.();
    this.map.touchZoomRotate?.enable?.();
    this.map.touchZoomRotate?.disableRotation?.();
  }

  invalidateSize() {
    this.safeResize();
    this.safeTriggerRepaint();
  }

  refreshRender() {
    this.safeResize();
    if (this.map.isStyleLoaded?.()) {
      this.applyEditorialStyle();
    }
    this.safeTriggerRepaint();
  }

  getContainer(): HTMLDivElement {
    return this.map.getContainer();
  }

  latLngToContainerPoint(latlng: LatLngTuple) {
    const point = this.map.project(toLngLat(latlng));
    return { x: point.x, y: point.y };
  }

  containerPointToLatLng(point: { x: number; y: number }) {
    const lngLat = this.map.unproject([point.x, point.y]);
    return {
      lat: lngLat.lat,
      lng: lngLat.lng,
    };
  }

  private wrapEvent(handler: (evt?: any) => void) {
    const existing = this.listeners.get(handler);
    if (existing) return existing as (evt?: any) => void;

    return (evt?: any) => {
      if (evt?.lngLat && typeof evt.lngLat.lat === 'number' && typeof evt.lngLat.lng === 'number') {
        handler({
          ...evt,
          latlng: {
            lat: evt.lngLat.lat,
            lng: evt.lngLat.lng,
          },
        });
        return;
      }
      handler(evt);
    };
  }

  private safeResize() {
    try {
      const container = this.map.getContainer?.();
      const hasSize = Boolean(container?.clientWidth && container?.clientHeight);
      const canvas = this.map.getCanvas?.();
      if (!hasSize || !canvas) return;
      this.map.resize();
    } catch {
      // Mapbox can emit late lifecycle callbacks after a dev StrictMode cleanup.
    }
  }

  private safeTriggerRepaint() {
    try {
      this.map.triggerRepaint?.();
    } catch {
      // noop
    }
  }
}
