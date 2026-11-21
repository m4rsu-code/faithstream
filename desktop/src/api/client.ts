import { API_BASE_URL } from './config';
import type { ApiFormField, ApiRequestBody, ApiRequestPayload } from '../shared/apiContracts';

export { API_BASE_URL } from './config';

/** Build a URL for a FaithStream Laravel API endpoint. */
export const apiUrl = (path: string) => {
  const endpoint = path.replace(/^\/+/, '');
  return `${API_BASE_URL}/${endpoint}`;
};

const serializeApiBody = async (body: BodyInit | null | undefined): Promise<ApiRequestBody | undefined> => {
  if (body == null) return undefined;
  if (typeof body === 'string') return { kind: 'text', value: body };
  if (body instanceof URLSearchParams) return { kind: 'text', value: body.toString() };
  if (body instanceof FormData) {
    const fields: ApiFormField[] = [];
    for (const [name, value] of body.entries()) {
      if (typeof value === 'string') fields.push({ name, value });
      else fields.push({ name, file: { data: new Uint8Array(await value.arrayBuffer()), name: value.name, type: value.type } });
    }
    return { kind: 'form', fields };
  }
  throw new TypeError('This request body type is not supported by the desktop API bridge.');
};

/** Shared fetch entry point for all FaithStream API calls. Packaged builds use Electron's trusted network bridge to avoid file-origin CORS failures. */
export const apiFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  if (init.signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError');
  const bridge = window.faithstreamWindow?.requestApi;
  if (!bridge) return fetch(apiUrl(path), init);

  const body = await serializeApiBody(init.body);
  const request: ApiRequestPayload = {
    path: path.replace(/^\/+/, ''),
    method: (init.method ?? 'GET').toUpperCase(),
    headers: [...new Headers(init.headers).entries()],
    ...(body ? { body } : {}),
  };
  const result = await bridge(request);
  if (init.signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError');
  if (result.status < 200 || result.status > 599) throw new TypeError('Failed to fetch');
  return new Response([204, 205, 304].includes(result.status) ? null : result.body, {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
  });
};
