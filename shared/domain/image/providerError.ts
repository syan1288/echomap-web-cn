export type ImageProviderLabel = 'Gemini' | 'Jimeng' | 'ChatGPT Image';
export type ProviderErrorCategory =
  | 'configuration'
  | 'timeout'
  | 'permission'
  | 'quota'
  | 'invalid_request'
  | 'model_unavailable'
  | 'internal'
  | 'upstream'
  | 'unknown';

export type ProviderErrorDetail = {
  message: string;
  status: number | null;
  code: string | null;
  category: ProviderErrorCategory;
};

function errorRecord(error: unknown): Record<string, unknown> {
  return error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '';
}

function providerStatus(error: unknown): number | null {
  const record = errorRecord(error);
  const response = errorRecord(record.response);
  const status = record.status ?? record.statusCode ?? response.status;
  const number = typeof status === 'number' ? status : Number(status);
  return Number.isInteger(number) && number >= 100 && number <= 599 ? number : null;
}

function providerCode(error: unknown): string | null {
  const record = errorRecord(error);
  const response = errorRecord(record.response);
  const body = errorRecord(response.data ?? record.error);
  const raw = record.code ?? record.status ?? body.code ?? body.status;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const code = String(raw).trim();
  return /^[A-Za-z0-9_.-]{1,48}$/.test(code) ? code : null;
}

function classifyProviderError(error: unknown, status: number | null, code: string | null): ProviderErrorCategory {
  const hint = `${code ?? ''} ${errorText(error)}`.toLowerCase();
  if (/missing|not configured|credential/.test(hint)) return 'configuration';
  if (/timeout|timed out|deadline/.test(hint) || status === 408 || status === 504) return 'timeout';
  if (/permission_denied|unauthorized|forbidden|permission/.test(hint) || status === 401 || status === 403) return 'permission';
  if (/resource_exhausted|rate.?limit|quota|billing/.test(hint) || status === 429) return 'quota';
  if (/invalid_argument|bad request|invalid request/.test(hint) || status === 400) return 'invalid_request';
  if (/model.*(not found|unavailable)|not_found/.test(hint) || status === 404) return 'model_unavailable';
  if (/internal|unavailable|server error/.test(hint) || (status !== null && status >= 500)) return 'internal';
  if (status !== null) return 'upstream';
  return 'unknown';
}

export function describeProviderError(provider: ImageProviderLabel, error: unknown): ProviderErrorDetail {
  const status = providerStatus(error);
  const code = providerCode(error);
  const category = classifyProviderError(error, status, code);
  const statusText = status ? `HTTP ${status}` : null;
  const codeText = code && !/^\d{3}$/.test(code) ? code : null;
  const detail = [statusText, codeText].filter(Boolean).join(', ');

  if (category === 'configuration') {
    return { message: `${provider} is not configured.`, status, code, category };
  }
  if (category === 'timeout') {
    return { message: `${provider} upstream failed (${detail || 'timeout'}).`, status, code, category };
  }
  return {
    message: `${provider} upstream failed${detail ? ` (${detail})` : ''}.`,
    status,
    code,
    category,
  };
}
