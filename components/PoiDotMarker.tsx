import React, { useRef } from 'react';
import type { ProcessedImage } from '../App';
import type { BasemapThemeId } from '../lib/mapboxAdapter';
import { getBasemapTheme } from '../lib/mapboxAdapter';

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

/** 远距缩放：蓝系发光节点；色/透明度由 id 稳定派生；直径在挂载时随机（不随 id） */
export const PoiDotMarker: React.FC<PoiDotMarkerProps> = ({
  img,
  map,
  mapViewportTick: _mapViewportTick = 0,
  isSelected,
  basemapTheme,
  onInteractionStart,
  onHoverChange,
}) => {
  const baseDiameterPxRef = useRef<number | null>(null);
  if (baseDiameterPxRef.current === null) {
    baseDiameterPxRef.current = 10 + Math.floor(Math.random() * 9);
  }
  const screenPoint = map.latLngToContainerPoint([img.lat, img.lng]);
  const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 5;
  const h = hash32(img.id);
  const colorPalette = getBasemapTheme(basemapTheme).nodePalette;
  const color = colorPalette[h % colorPalette.length];
  const fillAlpha = 0.26 + ((h >>> 8) % 52) / 100;
  const baseD = baseDiameterPxRef.current;
  const zBoost = Math.max(0.82, Math.min(1.18, 0.72 + zoom * 0.055));
  let diameter = Math.round(baseD * zBoost);
  let alpha = fillAlpha;
  let glowScale = 1;
  if (isSelected) {
    diameter = Math.round(diameter * 1.32);
    alpha = Math.min(0.92, fillAlpha + 0.22);
    glowScale = 1.24;
  }

  const glowSize = Math.round(diameter * 3.2 * glowScale);
  const ringSize = Math.max(8, Math.round(diameter * 0.88));
  const coreSize = Math.max(4, Math.round(diameter * 0.5));

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
      aria-hidden
    >
      <div
        className="absolute rounded-full"
        style={{
          width: glowSize,
          height: glowSize,
          background: `radial-gradient(circle, ${color}30 0%, ${color}18 34%, ${color}10 58%, transparent 78%)`,
          filter: 'blur(4px)',
          opacity: Math.min(0.95, 0.5 + alpha * 0.7),
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: ringSize,
          height: ringSize,
          background: `radial-gradient(circle, ${color}18 0%, ${color}08 70%, transparent 100%)`,
          border: `1px solid ${color}55`,
          boxShadow: `0 0 18px ${color}20`,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: coreSize,
          height: coreSize,
          background: color,
          opacity: alpha,
          boxShadow: `0 0 12px ${color}88, 0 0 28px ${color}2d`,
        }}
      />
    </div>
  );
};
