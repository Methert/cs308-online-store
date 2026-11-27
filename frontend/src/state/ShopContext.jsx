import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { cartTotals, changeQuantity, normalizeCart } from './cart.js';
import { subscribeCatalog, useCatalog } from './catalog.js';
import { CART_KEY, readCart, readToken, readUser, saveCart, saveToken, saveUser } from './storage.js';

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const [cart, setCart] = useState(readCart);
  const cartRef = useRef(cart);
  const [user, setUser] = useState(readUser);
  const [token, setToken] = useState(readToken);
  const [storageError, setStorageError] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  // When the cards change (the API answered), drop bag items that no longer exist and cap
  // quantities at the new stock.
  useEffect(() => subscribeCatalog(() => {
    const nextCart = normalizeCart(cartRef.current);
    setStorageError(!saveCart(nextCart));
    cartRef.current = nextCart;
    setCart(nextCart);
  }), []);
  // Re-render totals and labels when the cards change.
  useCatalog();

  useEffect(() => {
    function receiveCart(event) {
      if (event.storageArea !== window.localStorage || (event.key !== CART_KEY && event.key !== null)) return;
      try {
        cartRef.current = normalizeCart(JSON.parse(event.newValue));
      } catch {
        cartRef.current = [];
      }
      setCart(cartRef.current);
    }
    window.addEventListener('storage', receiveCart);
    return () => window.removeEventListener('storage', receiveCart);
  }, []);

  function updateQuantity(id, delta) {
    const nextCart = changeQuantity(cartRef.current, id, delta);
    // Save during the action so an immediate refresh cannot race a React effect.
    setStorageError(!saveCart(nextCart));
    cartRef.current = nextCart;
    setCart(nextCart);
  }

  function signInDemo(name, email) {
    // The backend public user uses "name". Its account-cart reconciliation policy is pending.
    const nextUser = { id: `demo:${email.trim().toLowerCase()}`, name: name.trim(), email: email.trim().toLowerCase() };
    setSessionError(!saveUser(nextUser));
    setUser(nextUser);
    setMessage(`Signed in as ${nextUser.name} in demo mode.`);
  }

  function signIn(newToken, userData) {
    saveToken(newToken);
    setToken(newToken);
    setSessionError(!saveUser(userData));
    setUser(userData);
    setMessage(`Signed in as ${userData.name}.`);
  }

  function signOut() {
    setSessionError(!saveUser(null));
    saveToken(null);
    setToken(null);
    setUser(null);
    setMessage('Signed out.');
  }

  return <ShopContext.Provider value={{
    cart, user, token, storageError, sessionError, message, setMessage,
    updateQuantity, signInDemo, signIn, signOut, ...cartTotals(cart),
  }}>{children}</ShopContext.Provider>;
}

export function useShop() {
  return useContext(ShopContext);
}
