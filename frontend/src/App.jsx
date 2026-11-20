import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router';
import { Brand, Header } from './components/Header.jsx';
import { CartDialog } from './components/CartDialog.jsx';
import { ProductDialog } from './components/ProductDialog.jsx';
import { AccountPage } from './pages/AccountPage.jsx';
import { CatalogPage } from './pages/CatalogPage.jsx';
import { CheckoutPage } from './pages/CheckoutPage.jsx';
import { ManagePage } from './pages/ManagePage.jsx';
import { OrdersPage } from './pages/OrdersPage.jsx';
import { useShop } from './state/ShopContext.jsx';

export function App() {
  const location = useLocation();
  const { message, sessionError } = useShop();
  const [bagOpen, setBagOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [filters, setFilters] = useState({ query: '', rarity: 'all', sort: 'popular', descriptions: false });

  useEffect(() => {
    const titles = { '/sign-in': 'Sign in | Peko Cards', '/sign-up': 'Sign up | Peko Cards' };
    document.title = titles[location.pathname] ?? 'Peko Cards | Pokémon Trading Cards';
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return <>
    <a className="skip" href="#main">Skip to content</a>
    <Header onOpenBag={() => setBagOpen(true)} />
    <main className="shell" id="main">
      {sessionError && <p className="account-error" role="status">Your browser could not save the demo session. Keep this page open to remain signed in.</p>}
      <Routes>
        <Route path="/" element={<CatalogPage filters={filters} onFilters={patch => setFilters(current => ({ ...current, ...patch }))} onDetails={setSelectedCard} />} />
        <Route path="/sign-in" element={<AccountPage key="sign-in" />} />
        <Route path="/sign-up" element={<AccountPage key="sign-up" signUp />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/manage" element={<ManagePage />} />
        <Route path="*" element={<section className="account"><h1>Page not found</h1><Link className="back-link" to="/">Back to shop</Link></section>} />
      </Routes>
    </main>
    <footer className="footer">
      <div className="shell footer-inner">
        <Brand />
        <p>CS 308 storefront prototype. Placeholder art, sample prices and stock.</p>
        <a className="art-credit" href="https://www.pokemon.com/us/pokemon-tcg/scarlet-violet-151">Pokémon TCG: Scarlet &amp; Violet 151</a>
        <nav className="footer-links" aria-label="More pages">
          <Link to="/orders">My orders</Link>
          <Link to="/manage">Staff: manage products</Link>
        </nav>
      </div>
    </footer>
    <CartDialog open={bagOpen} onClose={() => setBagOpen(false)} />
    <ProductDialog card={selectedCard} onClose={() => setSelectedCard(null)} />
    <p className="toast" role="status">{message}</p>
  </>;
}
