export type EchoApiPath =
  | '/api/generate'
  | '/api/generation-quota'
  | '/api/geocode'
  | '/api/echo-health'
  | '/api/payments/create-order'
  | '/api/payments/status'
  | '/api/share-memories'
  | '/api/usage-quota';

export function createApiUrl(path: EchoApiPath, baseUrl = ''): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!path.startsWith('/')) throw new Error('createApiUrl: path must start with /');
  return base ? `${base}${path}` : path;
}
