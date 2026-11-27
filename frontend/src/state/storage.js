import { normalizeCart } from './cart.js';

// Keep the existing keys so bags and demo sessions survive the React migration.
export const CART_KEY = 'peko-cards-bag-v1';
export const USER_KEY = 'peko-cards-demo-user';
export const TOKEN_KEY = 'peko-cards-token';

export function readCart() {
  try {
    return normalizeCart(JSON.parse(window.localStorage.getItem(CART_KEY)));
  } catch {
    return [];
  }
}

export function saveCart(items) {
  try {
    const serialized = items.length ? JSON.stringify(items) : null;
    if (window.localStorage.getItem(CART_KEY) !== serialized) {
      if (serialized) window.localStorage.setItem(CART_KEY, serialized);
      else window.localStorage.removeItem(CART_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

export function readUser() {
  try {
    const user = JSON.parse(window.sessionStorage.getItem(USER_KEY));
    const name = user?.name ?? user?.displayName;
    if (typeof name !== 'string' || !name.trim()) return null;
    return { id: user.id ?? 'demo-user', name: name.trim().slice(0, 80), email: user.email ?? '' };
  } catch {
    return null;
  }
}

export function saveUser(user) {
  try {
    if (user) window.sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    else window.sessionStorage.removeItem(USER_KEY);
    return true;
  } catch {
    return false;
  }
}

export function readToken() {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveToken(token) {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
    return true;
  } catch {
    return false;
  }
}
