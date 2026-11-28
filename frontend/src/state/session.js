import { request } from './api.js';
import { announceBag, readGuestToken, readToken, saveGuestToken, saveToken } from './storage.js';
import { fromServerCart } from './server-cart.js';

// One controller per provider. Shared startup prevents StrictMode from merging twice.
// Version checks keep responses from an earlier account out of the current session.
export function createShopSession() {
  let state = {
    user: null, authStatus: 'loading', cart: [], cartStatus: 'loading',
    cartBusy: false, cartError: '', mergePending: false, sessionError: '', message: '',
  };
  let token = readToken();
  let guestToken = readGuestToken();
  let guestPersisted = Boolean(guestToken);
  let version = 0;
  let bagRead = 0;
  let started;
  let locked = false;
  const listeners = new Set();
  const patch = next => {
    state = { ...state, ...next };
    listeners.forEach(listener => listener());
  };
  function guest() {
    if (!guestToken) {
      guestToken = crypto.randomUUID();
      guestPersisted = saveGuestToken(guestToken);
      if (!guestPersisted) patch({ sessionError: 'This browser cannot remember your guest bag. Keep this page open until you sign in.' });
    }
    return guestToken;
  }
  const identity = () => token ? { token } : { guestToken: guest() };
  const owner = () => token ? `user:${state.user?.id}` : guestToken;

  function changedGuestIdentity() {
    if (token || !guestPersisted) return false;
    const stored = readGuestToken();
    if (stored === guestToken) return false;
    version++;
    guestToken = stored;
    guestPersisted = Boolean(stored);
    patch({ cart: [], cartStatus: 'loading', cartError: '', cartBusy: false });
    return true;
  }

  async function expire() {
    version++;
    token = null;
    saveToken(null);
    patch({ user: null, authStatus: 'ready', cart: [], cartStatus: 'loading', cartBusy: false,
      cartError: '', mergePending: false, message: 'Your session has expired. Please sign in again.' });
    await refreshCart();
  }

  async function refreshCart() {
    const current = version;
    const read = ++bagRead;
    patch({ cartStatus: 'loading' });
    try {
      const data = await request('/cart', identity());
      if (current !== version || read !== bagRead) return false;
      patch({ cart: fromServerCart(data), cartStatus: 'ready', ...(state.mergePending ? {} : { cartError: '' }) });
      return true;
    } catch (error) {
      if (current !== version || read !== bagRead) return false;
      if (error.status === 401 && token) { await expire(); return false; }
      patch({ cartStatus: 'error', cartError: error.message });
      return false;
    }
  }

  async function mergeAndLoad() {
    const current = version;
    if (guestToken) {
      const mergingGuest = guestToken;
      patch({ mergePending: true, cartBusy: true, cartStatus: 'loading', cartError: '' });
      try {
        const combine = async () => {
          // Another tab may have consumed this guest cart while this tab waited.
          if (guestPersisted && readGuestToken() !== mergingGuest) return;
          await request('/cart/merge', { method: 'POST', token, body: { guestToken: mergingGuest } });
          if (current === version && (!guestPersisted || readGuestToken() === mergingGuest)) {
            if (!saveGuestToken(null)) patch({ sessionError: 'Your browser could not clear the old guest bag reference.' });
          }
        };
        if (navigator.locks) await navigator.locks.request(`peko-guest-merge:${mergingGuest}`, combine);
        else await combine();
        if (current !== version) return false;
        // The backend consumes the guest cart atomically. A retry after an uncertain
        // response sees an empty guest cart if the first merge already succeeded.
        guestToken = null;
        guestPersisted = false;
        patch({ mergePending: false, cartError: '' });
        announceBag(owner());
      } catch (error) {
        if (current !== version) return false;
        if (error.status === 401) { await expire(); return false; }
        patch({ mergePending: true, cartError: `You are signed in, but your guest bag could not be combined with your account bag. ${error.message}` });
      }
    }
    const loaded = await refreshCart();
    if (current === version) patch({ cartBusy: false });
    return loaded && !state.mergePending;
  }

  async function initialize() {
    const current = ++version;
    patch({ authStatus: 'loading', cartStatus: 'loading', cartError: '', sessionError: '' });
    if (token) {
      try {
        const data = await request('/auth/me', { token });
        if (current !== version) return;
        patch({ user: data.user, authStatus: 'ready' });
        await mergeAndLoad();
        return;
      } catch (error) {
        if (current !== version) return;
        if (error.status !== 401) {
          patch({ authStatus: 'error', sessionError: `We could not check your account. ${error.message}` });
          return;
        }
        token = null;
        saveToken(null);
        patch({ message: 'Your session has expired. Please sign in again.' });
      }
    }
    patch({ user: null, authStatus: 'ready' });
    await refreshCart();
  }

  async function authenticate(path, fields) {
    if (locked || state.cartBusy || state.authStatus !== 'ready') return false;
    locked = true;
    try {
      const data = await request(`/auth/${path}`, { method: 'POST', body: fields });
      if (!data?.token || !data.user?.id) throw new Error('The shop returned an incomplete sign-in response. Please try again.');
      version++;
      token = data.token;
      patch({ user: data.user, authStatus: 'ready', cart: [], cartStatus: 'loading',
        sessionError: saveToken(token) ? '' : 'Your browser could not remember this sign-in. Keep this page open.',
        message: `Signed in as ${data.user.name}.` });
      await mergeAndLoad();
      return true;
    } finally { locked = false; }
  }

  async function updateQuantity(id, delta) {
    if (locked || state.cartBusy || state.mergePending || state.authStatus !== 'ready' || state.cartStatus !== 'ready') return false;
    if (changedGuestIdentity()) { await refreshCart(); return false; }
    if (!Number.isSafeInteger(delta) || delta === 0) return false;
    const existing = state.cart.find(item => item.id === id);
    const quantity = (existing?.quantity ?? 0) + delta;
    if (quantity < 0 || quantity > 99) return false;
    const current = version;
    bagRead++;
    patch({ cartBusy: true, cartError: '' });
    try {
      await request(existing ? `/cart/items/${id}` : '/cart/items', {
        ...identity(), method: existing ? (quantity === 0 ? 'DELETE' : 'PUT') : 'POST',
        ...(quantity === 0 ? {} : { body: existing ? { quantity } : { productId: id, quantity } }),
      });
      if (current !== version) return false;
      announceBag(owner());
      const loaded = await refreshCart();
      if (loaded) patch({ message: delta > 0 ? 'Card added to your bag.' : 'Bag updated.' });
      return loaded;
    } catch (error) {
      if (current !== version) return false;
      if (error.status === 401 && token) { await expire(); return false; }
      // A timed out write may have succeeded. Read before allowing another write.
      await refreshCart();
      if (current === version) patch({ cartError: `${error.message} Check your bag before trying again.` });
      return false;
    } finally {
      if (current === version) patch({ cartBusy: false });
    }
  }

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => state,
    start() { started ??= initialize(); return started; },
    retrySession: initialize,
    signIn: fields => authenticate('login', fields),
    signUp: fields => authenticate('register', fields),
    updateQuantity,
    async placeOrder(body) {
      if (!token || !state.user) throw new Error('Please sign in to place your order.');
      if (locked || state.cartBusy || state.mergePending || state.cartStatus !== 'ready') throw new Error('Finish updating your bag before checkout.');
      locked = true;
      const current = version;
      bagRead++;
      patch({ cartBusy: true });
      try {
        const data = await request('/orders', { method: 'POST', token, body });
        if (current !== version) throw new Error('Your account changed. Check your orders before trying again.');
        await refreshCart();
        announceBag(owner());
        return data;
      } catch (error) {
        if (current === version) {
          if (error.status === 401) await expire();
          else await refreshCart();
        }
        throw error;
      } finally {
        locked = false;
        if (current === version) patch({ cartBusy: false });
      }
    },
    refreshCart,
    async retryCart() {
      if (state.cartBusy || locked || state.authStatus !== 'ready') return;
      locked = true;
      try { if (state.mergePending) await mergeAndLoad(); else await refreshCart(); }
      finally { locked = false; }
    },
    async signOut() {
      if (state.cartBusy) return;
      version++;
      token = null;
      const saved = saveToken(null);
      patch({ user: null, authStatus: 'ready', cart: [], cartStatus: 'loading', cartError: '', mergePending: false,
        sessionError: saved ? '' : 'Your browser could not clear the saved sign-in. Close this tab to finish signing out.', message: 'Signed out.' });
      // The account bag stays on the server. Guests only see their guest identity's bag.
      await refreshCart();
    },
    async authorizedRequest(path, options = {}) {
      if (!token || !state.user) throw new Error('Please sign in to continue.');
      const current = version;
      try {
        const data = await request(path, { ...options, token });
        if (current !== version) throw new Error('Your account changed. Please try again.');
        return data;
      } catch (error) {
        if (current === version && error.status === 401) await expire();
        throw error;
      }
    },
    setMessage: message => patch({ message }),
    onFocus() {
      if (state.authStatus === 'ready' && !state.cartBusy && !locked) {
        changedGuestIdentity();
        return refreshCart();
      }
    },
    onGuestIdentityChange() {
      if (!state.cartBusy && !locked && changedGuestIdentity()) return refreshCart();
    },
    onBagEvent(event) {
      try {
        if (JSON.parse(event.newValue)?.owner === owner() && !state.cartBusy && !locked && state.authStatus === 'ready') return refreshCart();
      } catch { /* Ignore malformed or unrelated notifications. */ }
    },
  };
}
