import assert from 'node:assert/strict';
import test from 'node:test';
import { MapboxAdapter, createRasterFallbackStyle } from './mapboxAdapter.ts';

test('creates a token-free raster style from the configured tile template', () => {
  const style = createRasterFallbackStyle(
    'https://webrd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}{r}',
    '© AutoNavi'
  );

  assert.equal(style.version, 8);
  assert.deepEqual(style.sources['echo-fallback'], {
    type: 'raster',
    tiles: ['https://webrd01.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}'],
    tileSize: 256,
    attribution: '© AutoNavi',
  });
  assert.equal(style.layers[0].source, 'echo-fallback');
});

test('switches to the raster style when the initial Mapbox style request fails', () => {
  class MockMap {
    handlers = new Map<string, Array<(event?: any) => void>>();
    styles: unknown[] = [];

    on(name: string, handler: (event?: any) => void) {
      this.handlers.set(name, [...(this.handlers.get(name) ?? []), handler]);
    }

    once(name: string, handler: (event?: any) => void) {
      this.on(name, handler);
    }

    emit(name: string, event?: any) {
      for (const handler of this.handlers.get(name) ?? []) handler(event);
    }

    setStyle(style: unknown) {
      this.styles.push(style);
    }

    scrollZoom = { enable() {} };
    boxZoom = { enable() {} };
    dragPan = { enable() {} };
    doubleClickZoom = { enable() {} };
    keyboard = { enable() {} };
    touchZoomRotate = { enable() {}, disableRotation() {} };
  }

  let mapInstance: MockMap | undefined;
  class MockMapbox {
    Map = class extends MockMap {
      constructor() {
        super();
        mapInstance = this;
      }
    };
  }

  const fallbackStyle = createRasterFallbackStyle('https://tiles.example/{z}/{x}/{y}.png');
  const adapter = new MapboxAdapter(new MockMapbox(), {} as HTMLDivElement, {
    center: [0, 0],
    zoom: 2,
    minZoom: 1,
    maxZoom: 18,
    style: 'mapbox://styles/mapbox/standard',
    fallbackStyle,
    fallbackStyleTimeoutMs: 60_000,
  });

  mapInstance?.emit('error', {
    error: { message: 'Failed to fetch https://api.mapbox.com/styles/v1/mapbox/standard?access_token=redacted' },
  });

  assert.deepEqual(mapInstance?.styles, [fallbackStyle]);
  adapter.destroy();
});
