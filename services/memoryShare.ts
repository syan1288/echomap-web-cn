import { apiUrl } from '../lib/apiBase';
import type { MemorySharePayload, MemorySharePlatform } from '../shared/domain/share/memorySharePayload';

export type { MemorySharePlatform } from '../shared/domain/share/memorySharePayload';

export type MemoryShareRequest = {
  platform: MemorySharePlatform;
  buildingName: string;
  photoUrls: string[];
  note?: string;
};

export type MemoryShareResponse = MemorySharePayload;

export async function requestMemoryShare(
  payload: MemoryShareRequest
): Promise<MemoryShareResponse> {
  const res = await fetch(apiUrl('/api/share-memories'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json = (await res.json().catch(() => null)) as
    | MemoryShareResponse
    | { error?: string }
    | null;

  if (!res.ok || !json || !('ok' in json)) {
    throw new Error(json && 'error' in json && json.error ? json.error : 'Unable to prepare share payload.');
  }

  return json;
}
