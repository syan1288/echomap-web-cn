import { apiUrl } from '../lib/apiBase';

export type ImageProvider = 'gemini' | 'jimeng';
export type ImageProviderAvailability = Partial<Record<ImageProvider, boolean>>;

export async function fetchImageProviderAvailability(): Promise<ImageProviderAvailability | null> {
  try {
    const response = await fetch(apiUrl('/api/echo-health'), { cache: 'no-store' });
    if (!response.ok) return null;
    const health = (await response.json()) as {
      providers?: Partial<Record<ImageProvider, boolean>>;
      env?: {
        hasGeminiApiKey?: boolean;
        hasGoogleCloudProject?: boolean;
        hasGoogleApplicationCredentials?: boolean;
        hasOpenAiKey?: boolean;
        hasJimengKeys?: boolean;
      };
    };
    return {
      gemini:
        health.providers?.gemini ??
        Boolean(health.env?.hasGeminiApiKey || (health.env?.hasGoogleCloudProject && health.env?.hasGoogleApplicationCredentials)),
      jimeng: health.providers?.jimeng ?? Boolean(health.env?.hasJimengKeys),
    };
  } catch {
    return null;
  }
}
