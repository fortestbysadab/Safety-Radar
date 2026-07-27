/**
 * services/api.js
 * ---------------
 * Thin wrapper around fetch that:
 *   - prepends VITE_API_BASE_URL to /api/* paths,
 *   - auto-injects the active Supabase access_token as Authorization: Bearer <token>,
 *   - sets Content-Type: application/json,
 *   - JSON-serializes bodies,
 *   - throws a typed ApiError on non-2xx responses with the parsed JSON error
 *     message (so callers can show user-friendly text).
 */
import { getAccessToken } from './auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, { body, query, auth = true } = {}) {
  const url = new URL(path.startsWith('http') ? path : `${BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
  }

  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && data.error?.message) ||
      (typeof data === 'string' ? data : 'Request failed');
    throw new ApiError(res.status, msg, data?.error?.details);
  }
  return data;
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
};

// ---- Convenience endpoints ----

export function fetchHazards({ lat, lng, radius = 2000 }) {
  return api.get('/api/hazards', { query: { lat, lng, radius }, auth: false });
}

export function fetchHeatmap({ lat, lng, radius = 2000 }) {
  return api.get('/api/hazards/heatmap', { query: { lat, lng, radius }, auth: false });
}

export function createReport({ category, description, pin, deviceLocation }) {
  return api.post('/api/reports', { category, description, pin, deviceLocation });
}

export function voteReport(id, voteType) {
  return api.post(`/api/reports/${id}/vote`, { voteType });
}

export function clearReport(id) {
  return api.post(`/api/reports/${id}/clear`, {});
}
