export type GeminiTokenProbe = {
  mode: 'vertex' | 'apiKey' | 'none';
  ok: boolean;
};

export function isGeminiProviderAvailable(configured: boolean, probe: GeminiTokenProbe): boolean {
  return configured && probe.ok;
}
