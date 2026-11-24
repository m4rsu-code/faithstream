import { API_BASE_URL } from './config';
import type { ApiFormField, ApiRequestBody, ApiRequestPayload } from '../shared/apiContracts';

export { API_BASE_URL } from './config';

/** Build a URL for a FaithStream Laravel API endpoint. */
export const apiUrl = (path: string) => {
  const endpoint = path.replace(/^\/+/, '');
  return `${API_BASE_URL}/${endpoint}`;
};

// Signed-in API reads are kept only in process memory so changing routes does
// not re-fetch the same account data. Live connectivity and session checks must
// always reach the server, and every successful write clears the read cache.
const LIVE_ACCOUNT_READ_PATHS = new Set(['connection-check', 'session/status']);
const accountReadCache = new Map<string, { generation: number; response: Response }>();
const accountReadFlights = new Map<string, Promise<Response>>();
let accountReadGeneration = 0;

const normalizedApiPath = (path: string) => path.replace(/^\/+/, '');

const isLiveAccountRead = (path: string) => LIVE_ACCOUNT_READ_PATHS.has(normalizedApiPath(path).split(/[?#]/, 1)[0]);

const accountReadKey = (token: string, path: string) => `${token}\u0000${normalizedApiPath(path)}`;

const invalidateAccountReadCache = (token: string | null) => {
  if (token) clearApiAccountReadCache();
};

export const clearApiAccountReadCache = () => {
  accountReadGeneration += 1;
  accountReadCache.clear();
  accountReadFlights.clear();
};

const invalidateAccountLibrary = (token: string | null, collection: string | null) => {
  if (!token || !collection) return;
  // These lists are small, so clear them together after a write. Advancing the
  // generation prevents an older in-flight read from putting stale data back.
  clearApiAccountReadCache();
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
const sendApiRequest = async (path: string, init: RequestInit): Promise<Response> => {
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

export const apiFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  const token = headers.get('Authorization');
  const cacheKey = token && !isLiveAccountRead(path) ? accountReadKey(token, path) : null;
  const canCache = method === 'GET' && cacheKey && !init.signal && init.cache !== 'no-store' && init.cache !== 'reload';

  if (canCache && cacheKey) {
    const cached = accountReadCache.get(cacheKey);
    if (cached?.generation === accountReadGeneration) return cached.response.clone();

    const currentFlight = accountReadFlights.get(cacheKey);
    if (currentFlight) return (await currentFlight).clone();

    const generation = accountReadGeneration;
    let flight: Promise<Response>;
    flight = sendApiRequest(path, init).then((response) => {
      if (response.ok && generation === accountReadGeneration) accountReadCache.set(cacheKey, { generation, response: response.clone() });
      return response;
    }).finally(() => { if (accountReadFlights.get(cacheKey) === flight) accountReadFlights.delete(cacheKey); });
    accountReadFlights.set(cacheKey, flight);
    return flight;
  }

  const response = await sendApiRequest(path, init);
  if (method !== 'GET' && response.ok) invalidateAccountReadCache(token);
  return response;
};
