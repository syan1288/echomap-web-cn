export type ViewportCharacteristics = {
  width: number;
  height: number;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  coarsePointer: boolean;
};

export function shouldUseMobileShell({
  width,
  height,
  userAgent,
  platform,
  maxTouchPoints,
  coarsePointer,
}: ViewportCharacteristics): boolean {
  if (width <= 767) return true;
  if (/Android|iPhone|iPad|iPod/i.test(userAgent)) return true;
  if (platform === 'MacIntel' && maxTouchPoints > 1) return true;
  return coarsePointer && height <= 500;
}
