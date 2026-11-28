export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status = 0, details = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = Array.isArray(details) ? details : [];
  }
}

export async function request(path, { token, guestToken, body, signal, timeout = 15000, fetchImpl = globalThis.fetch, ...options } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetchImpl(`${API_URL}/api${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(guestToken ? { 'x-guest-token': guestToken } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    if (response.status === 204) return null;
    let payload;
    try { payload = await response.json(); }
    catch {
      throw new ApiError(response.status >= 500
        ? 'The shop is temporarily unavailable. Please try again.'
        : 'The shop returned an unreadable response. Please try again.', response.status);
    }
    if (!payload || typeof payload !== 'object') throw new ApiError('The shop returned an incomplete response. Please try again.');
    if (!response.ok) throw new ApiError(payload.error || 'The request could not be completed.', response.status, payload.details);
    if (!Object.hasOwn(payload, 'data')) throw new ApiError('The shop returned an incomplete response. Please try again.');
    return payload.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal?.aborted) throw error;
    throw new ApiError(controller.signal.aborted
      ? 'The shop took too long to respond. Please try again.'
      : 'The shop could not be reached. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function fieldErrors(error) {
  return Object.fromEntries((error.details ?? []).map(item => [item.field, item.message]));
}
