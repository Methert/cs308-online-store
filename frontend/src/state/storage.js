export const AUTH_KEY = 'peko-cards-auth-token-v1';
export const GUEST_KEY = 'peko-cards-guest-token-v1';
export const BAG_EVENT_KEY = 'peko-cards-bag-updated-v1';

export function readToken() {
  try { return window.sessionStorage.getItem(AUTH_KEY) || null; }
  catch { return null; }
}

export function saveToken(token) {
  try {
    if (token) window.sessionStorage.setItem(AUTH_KEY, token);
    else window.sessionStorage.removeItem(AUTH_KEY);
    return true;
  } catch { return false; }
}

export function readGuestToken() {
  try { return window.localStorage.getItem(GUEST_KEY) || null; }
  catch { return null; }
}

export function saveGuestToken(token) {
  try {
    if (token) window.localStorage.setItem(GUEST_KEY, token);
    else window.localStorage.removeItem(GUEST_KEY);
    return true;
  } catch { return false; }
}

export function announceBag(owner) {
  try { window.localStorage.setItem(BAG_EVENT_KEY, JSON.stringify({ owner, change: crypto.randomUUID() })); }
  catch { /* Server data stays authoritative if cross-tab notifications are blocked. */ }
}
