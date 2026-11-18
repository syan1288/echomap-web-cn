import React from 'react';
import type { ProcessedImage } from '../web/app/webMemoryTypes';
import type { BasemapThemeId } from '../lib/mapboxAdapter';
import { getPoiDotColor, getPoiDotSize } from '../lib/mapboxAdapter';

interface PoiDotMarkerProps {
  img: ProcessedImage;
  map: any;
  mapViewportTick?: number;
  isSelected: boolean;
  basemapTheme: BasemapThemeId;
  onInteractionStart: (e: React.PointerEvent<HTMLDivElement>, img: ProcessedImage) => void;
  onHoverChange?: (id: number | null) => void;
}

function hash32(id: number): number {
  return Math.imul(id, 2654435761) >>> 0;
}

function darkenHex(hex: string, ratio: number): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return hex;
  const toHex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${toHex(parseInt(match[1], 16) * ratio)}${toHex(parseInt(match[2], 16) * ratio)}${toHex(parseInt(match[3], 16) * ratio)}`;
}

/** 远距缩放：色/透明度/尺寸由 id 稳定派生，视觉随机但刷新不跳动。 */
export const PoiDotMarker: React.FC<PoiDotMarkerProps> = ({
  img,
  map,
  mapViewportTick: _mapViewportTick = 0,
  isSelected,
  basemapTheme: _basemapTheme,
  onInteractionStart,
  onHoverChange,
}) => {
  const screenPoint = map.latLngToContainerPoint([img.lat, img.lng]);
  const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 5;
  const h = hash32(img.id);
  const color = getPoiDotColor(img.id);
  const coreColor = darkenHex(color, 0.78);
  const borderColor = darkenHex(color, 0.62);
  const fillAlpha = 0.78 + ((h >>> 8) % 16) / 100;
  const baseD = getPoiDotSize(img.id, 9, 11);
  const zBoost = Math.max(1.04, Math.min(1.32, 0.94 + zoom * 0.055));
  let diameter = Math.max(14, Math.round(baseD * zBoost));
  let alpha = fillAlpha;
  let glowScale = 1;
  if (isSelected) {
    diameter = Math.round(diameter * 1.32);
    alpha = Math.min(1, fillAlpha + 0.12);
    glowScale = 1.12;
  }

  const glowSize = Math.round(diameter * 2.55 * glowScale);
  const ringSize = Math.max(13, Math.round(diameter * 0.95));
  const coreSize = Math.max(8, Math.round(diameter * 0.58));

  return (
    <div
      className="absolute z-10 flex items-center justify-center pointer-events-auto box-border"
      style={{
        left: screenPoint.x,
        top: screenPoint.y,
        width: diameter,
        height: diameter,
        transform: 'translate(-50%, -50%)',
        willChange: 'transform',
        cursor: 'pointer',
      }}
      onPointerDown={(e) => onInteractionStart(e, img)}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => onHoverChange?.(img.id)}
      onMouseLeave={() => onHoverChange?.(null)}
      data-map-ui="poi-dot-marker"
      data-poi-size={diameter}
      data-poi-color={color}
      aria-hidden
    >
      <div
        className="absolute rounded-full"
        style={{
          width: glowSize,
          height: glowSize,
          background: `radial-gradient(circle, ${color}42 0%, ${color}20 42%, ${color}0c 68%, transparent 82%)`,
          filter: 'blur(2px)',
          opacity: Math.min(0.62, 0.34 + alpha * 0.18),
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: ringSize,
          height: ringSize,
          background: `radial-gradient(circle, rgba(255,255,255,0.95) 0%, ${color}24 58%, ${color}58 100%)`,
          border: `1.5px solid ${borderColor}`,
          boxShadow: `0 2px 7px rgba(14,66,130,0.14), 0 0 10px ${color}3d`,
        }}
      />
      <div
        className="absolute rounded-full"
        data-map-ui="poi-dot-core"
        style={{
          width: coreSize,
          height: coreSize,
          background: coreColor,
          opacity: alpha,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.9), 0 0 8px ${color}78, 0 0 18px ${color}24`,
        }}
      />
    </div>
  );
};
