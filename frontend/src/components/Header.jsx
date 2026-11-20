import { Link, useNavigate } from 'react-router';
import { useShop } from '../state/ShopContext.jsx';

export function Brand() {
  return <Link className="brand" to="/" aria-label="Peko Cards home">
    <img className="brand-mark" src="/assets/morpeko-full-belly.svg" width="32" height="32" alt="" />
    <span><span className="brand-accent">Peko</span> Cards</span>
  </Link>;
}

export function Header({ onOpenBag }) {
  const { user, count, signOut } = useShop();
  const navigate = useNavigate();
  return <header className="header">
    <div className="shell header-inner">
      <Brand />
      <nav className="header-actions" aria-label="Account and bag">
        {user ? <div className="signed-in-account">
          <span className="account-identity" aria-label={`Signed in as ${user.name}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg>
            <span id="display-name" title={user.name}>{user.name}</span>
          </span>
          <button className="sign-out-button" type="button" onClick={() => { signOut(); navigate('/'); }}>Sign out</button>
        </div> : <div className="guest-actions">
          <Link className="sign-in-link" to="/sign-in">Sign in</Link>
          <Link className="sign-up-link" to="/sign-up">Sign up</Link>
        </div>}
        <button className="cart-button" type="button" onClick={onOpenBag}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16l1 13H3L4 8Zm4 0V6a4 4 0 0 1 8 0v2" /></svg>
          Bag <span id="cart-count">{count}</span>
        </button>
      </nav>
    </div>
  </header>;
}
