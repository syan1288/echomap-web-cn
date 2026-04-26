import React, { useMemo } from 'react';
import type { ProcessedImage } from '../App';
import type { BasemapThemeId } from '../lib/mapboxAdapter';
import { getBasemapTheme } from '../lib/mapboxAdapter';

interface BuildingConnectionsOverlayProps {
  map: any;
  mapViewportTick: number;
  images: ProcessedImage[];
  visible: boolean;
  basemapTheme: BasemapThemeId;
}

type ProjectedNode = {
  id: number;
  x: number;
  y: number;
};

function distanceSq(a: ProjectedNode, b: ProjectedNode) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function buildEdges(nodes: ProjectedNode[]) {
  if (nodes.length < 2) return [];
  const edges: Array<{ from: ProjectedNode; to: ProjectedNode; key: string }> = [];
  const linked = new Set<string>();
  const maxNeighbors = nodes.length > 12 ? 1 : 2;

  for (const node of nodes) {
    const nearest = nodes
      .filter((other) => other.id !== node.id)
      .map((other) => ({ other, d: distanceSq(node, other) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, maxNeighbors);

    for (const candidate of nearest) {
      const fromId = Math.min(node.id, candidate.other.id);
      const toId = Math.max(node.id, candidate.other.id);
      const key = `${fromId}-${toId}`;
      if (linked.has(key)) continue;
      linked.add(key);
      edges.push({ from: node, to: candidate.other, key });
    }
  }

  return edges;
}

export function BuildingConnectionsOverlay({
  map,
  mapViewportTick,
  images,
  visible,
  basemapTheme,
}: BuildingConnectionsOverlayProps) {
  const theme = getBasemapTheme(basemapTheme);
  const overlay = useMemo(() => {
    const container = map.getContainer();
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = Math.max(100, Math.min(width, height) * 0.14);

    const nodes = images
      .map((img) => {
        const point = map.latLngToContainerPoint([img.lat, img.lng]);
        return { id: img.id, x: point.x, y: point.y };
      })
      .filter(
        (node) =>
          node.x >= -margin &&
          node.x <= width + margin &&
          node.y >= -margin &&
          node.y <= height + margin
      );

    return { width, height, edges: buildEdges(nodes) };
  }, [map, mapViewportTick, images]);

  if (!visible || overlay.edges.length === 0) return null;

  return (
    <div className="absolute inset-0 z-[6] pointer-events-none overflow-hidden" aria-hidden>
      <svg
        width={overlay.width}
        height={overlay.height}
        viewBox={`0 0 ${overlay.width} ${overlay.height}`}
        className="absolute inset-0 h-full w-full"
      >
        {overlay.edges.map((edge) => (
          <line
            key={edge.key}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
            stroke={theme.connection}
            strokeWidth={1.35}
            strokeDasharray="4 11"
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  );
}
