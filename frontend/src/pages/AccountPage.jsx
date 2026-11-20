import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useShop } from '../state/ShopContext.jsx';

export const demoAccount = { email: 'trainer@example.com', password: 'peko-demo', name: 'Peko Trainer' };

export function AccountPage({ signUp = false }) {
  const { user, signInDemo } = useShop();
  const navigate = useNavigate();
  const heading = useRef(null);
  const [fields, setFields] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  if (user) return <Navigate to="/" replace />;

  function updateField(event) {
    setFields({ ...fields, [event.target.name]: event.target.value });
    setError('');
  }

  function submit(event) {
    event.preventDefault();
    if (signUp && !fields.name.trim()) { setError('Enter a display name.'); return; }
    if (signUp && fields.password !== fields.confirm) { setError('Your passwords do not match.'); return; }
    if (!signUp && (fields.email.trim().toLowerCase() !== demoAccount.email || fields.password !== demoAccount.password)) {
      setError('Use the demo email and password shown above.');
      return;
    }
    signInDemo(signUp ? fields.name : demoAccount.name, fields.email);
    setFields({ name: '', email: '', password: '', confirm: '' });
    navigate('/');
  }

  return <section className="account" aria-labelledby="account-title">
    <Link className="back-link" to="/">Back to shop</Link>
    <div className="account-panel">
      <h1 id="account-title" ref={heading} tabIndex="-1">{signUp ? 'Create an account' : 'Sign in'}</h1>
      <p className="account-description">{signUp ? 'Join Peko Cards.' : 'Welcome back to Peko Cards.'}</p>
      <form id="account-form" aria-labelledby="account-title" aria-describedby="account-preview" onSubmit={submit}>
        {signUp && <div className="account-field">
          <label htmlFor="account-name">Display name</label>
          <input id="account-name" name="name" type="text" autoComplete="nickname" maxLength="80" required value={fields.name} onChange={updateField} />
        </div>}
        <div className="account-field">
          <label htmlFor="account-email">Email address</label>
          <input id="account-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck="false" required value={fields.email} onChange={updateField} />
        </div>
        <div className="account-field">
          <label htmlFor="account-password">Password</label>
          <div className="password-input">
            <input id="account-password" name="password" type={showPassword ? 'text' : 'password'}
              autoComplete={signUp ? 'new-password' : 'current-password'} required value={fields.password} onChange={updateField} />
            <button type="button" aria-controls={signUp ? 'account-password account-confirm' : 'account-password'}
              aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
          </div>
        </div>
        {signUp && <div className="account-field">
          <label htmlFor="account-confirm">Confirm password</label>
          <input id="account-confirm" name="confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={fields.confirm} onChange={updateField} />
        </div>}
        <p className="account-preview" id="account-preview">Demo mode. Your display name is kept for this tab. Use sample details.</p>
        {!signUp && <div className="demo-account">
          <p>Email <code>{demoAccount.email}</code><br />Password <code>{demoAccount.password}</code></p>
          <button className="secondary" type="button" onClick={() => {
            setFields({ ...fields, email: demoAccount.email, password: demoAccount.password }); setError('');
          }}>Fill demo details</button>
        </div>}
        {error && <p className="account-error" role="alert">{error}</p>}
        <button className="account-submit" type="submit">{signUp ? 'Create account' : 'Sign in'}</button>
      </form>
      <p className="account-switch">
        {signUp ? 'Already have an account? ' : 'New to Peko Cards? '}
        <Link to={signUp ? '/sign-in' : '/sign-up'}>{signUp ? 'Sign in' : 'Create an account'}</Link>
      </p>
    </div>
  </section>;
}
