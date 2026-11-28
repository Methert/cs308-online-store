import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { cartTotals } from './cart.js';
import { createShopSession } from './session.js';
import { BAG_EVENT_KEY, GUEST_KEY } from './storage.js';

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const [session] = useState(createShopSession);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => {
    session.start();
    const focus = () => session.onFocus();
    const storage = event => {
      if (event.key === BAG_EVENT_KEY) session.onBagEvent(event);
      if (event.key === GUEST_KEY || event.key === null) session.onGuestIdentityChange();
    };
    window.addEventListener('focus', focus);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('focus', focus);
      window.removeEventListener('storage', storage);
    };
  }, [session]);
  useEffect(() => {
    if (!state.message) return;
    const timer = window.setTimeout(() => session.setMessage(''), 5000);
    return () => window.clearTimeout(timer);
  }, [session, state.message]);
  return <ShopContext.Provider value={{ ...session, ...state, ...cartTotals(state.cart) }}>{children}</ShopContext.Provider>;
}

export function useShop() { return useContext(ShopContext); }
