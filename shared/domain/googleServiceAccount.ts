export type GoogleServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

/**
 * Parse the inline service-account form used by serverless deployments.
 * Keeping credentials in memory avoids making the Vertex SDK depend on a
 * temporary file path that may not exist in a later serverless invocation.
 */
export function parseGoogleServiceAccountJson(
  value: string | undefined
): GoogleServiceAccountCredentials | null {
  const raw = value?.trim();
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must be a service-account object');
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.client_email !== 'string' || !record.client_email.trim()) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email');
  }
  if (typeof record.private_key !== 'string' || !record.private_key.includes('PRIVATE KEY')) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing private_key');
  }

  return {
    client_email: record.client_email,
    private_key: record.private_key,
    ...(typeof record.project_id === 'string' && record.project_id.trim()
      ? { project_id: record.project_id }
      : {}),
  };
}
