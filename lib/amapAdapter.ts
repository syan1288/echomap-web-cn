type LatLngTuple = [number, number];
type BoundsTuple = Array<LatLngTuple>;

function toLngLat(AMap: any, latlng: LatLngTuple) {
  return new AMap.LngLat(latlng[1], latlng[0]);
}

export function createMapBounds(points: BoundsTuple) {
  return {
    points,
    pad(_ratio: number) {
      return this;
    },
  };
}

export class AMapAdapter {
  private map: any;
  private AMap: any;
  private listeners = new Map<Function, Function>();

  constructor(
    AMap: any,
    container: HTMLDivElement,
    options: {
      center: LatLngTuple;
      zoom: number;
      minZoom: number;
      maxZoom: number;
      mapStyle?: string;
    }
  ) {
    this.AMap = AMap;
    this.map = new AMap.Map(container, {
      viewMode: '2D',
      resizeEnable: true,
      center: [options.center[1], options.center[0]],
      zoom: options.zoom,
      zooms: [options.minZoom, options.maxZoom],
      mapStyle: options.mapStyle,
      features: ['bg'],
      showLabel: false,
    });
  }

  destroy() {
    this.map?.destroy?.();
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
    this.map.on('complete', handler);
  }

  getZoom(): number {
    return this.map.getZoom();
  }

  setView(latlng: LatLngTuple, zoom?: number) {
    if (typeof zoom === 'number') {
      this.map.setZoomAndCenter(zoom, [latlng[1], latlng[0]]);
      return;
    }
    this.map.setCenter([latlng[1], latlng[0]]);
  }

  fitBounds(bounds: { points: BoundsTuple }) {
    const lats = bounds.points.map((point) => point[0]);
    const lngs = bounds.points.map((point) => point[1]);
    const southWest = new this.AMap.LngLat(Math.min(...lngs), Math.min(...lats));
    const northEast = new this.AMap.LngLat(Math.max(...lngs), Math.max(...lats));
    this.map.setBounds(new this.AMap.Bounds(southWest, northEast), false, [80, 80, 80, 80]);
  }

  zoomIn() {
    this.map.zoomIn();
  }

  zoomOut() {
    this.map.zoomOut();
  }

  invalidateSize() {
    this.map.resize();
  }

  getContainer(): HTMLDivElement {
    return this.map.getContainer();
  }

  latLngToContainerPoint(latlng: LatLngTuple) {
    const pixel = this.map.lngLatToContainer(toLngLat(this.AMap, latlng));
    return { x: pixel.getX(), y: pixel.getY() };
  }

  containerPointToLatLng(point: { x: number; y: number }) {
    const lngLat = this.map.containerToLngLat(new this.AMap.Pixel(point.x, point.y));
    return {
      lat: lngLat.getLat(),
      lng: lngLat.getLng(),
    };
  }

  private wrapEvent(handler: (evt?: any) => void) {
    const existing = this.listeners.get(handler);
    if (existing) return existing as (evt?: any) => void;

    return (evt?: any) => {
      if (evt?.lnglat && typeof evt.lnglat.getLat === 'function' && typeof evt.lnglat.getLng === 'function') {
        handler({
          ...evt,
          latlng: {
            lat: evt.lnglat.getLat(),
            lng: evt.lnglat.getLng(),
          },
        });
        return;
      }
      handler(evt);
    };
  }
}
