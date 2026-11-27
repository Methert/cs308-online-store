import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { fieldErrors } from '../state/api.js';
import { useShop } from '../state/ShopContext.jsx';
import { Loading, RequestError } from '../components/RequestState.jsx';

export const emptyAccount = { name: '', email: '', password: '', confirm: '', taxId: '', homeAddress: '' };

export function validateAccount(fields, signUp) {
  const errors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) errors.email = 'Enter a valid email address.';
  if (!fields.password) errors.password = 'Enter your password.';
  if (signUp) {
    if (fields.name.trim().length < 2) errors.name = 'Display name must be at least 2 characters.';
    if (fields.password.length < 8 || !/\p{L}/u.test(fields.password) || !/\d/.test(fields.password)) {
      errors.password = 'Use at least 8 characters, including a letter and a digit.';
    } else if (new TextEncoder().encode(fields.password).length > 72) errors.password = 'Password must be at most 72 bytes.';
    if (fields.password !== fields.confirm) errors.confirm = 'Your passwords do not match.';
    if (!/^\d{10,11}$/.test(fields.taxId.trim())) errors.taxId = 'Tax ID must be 10 or 11 digits.';
    if (fields.homeAddress.trim().length < 5) errors.homeAddress = 'Enter your home address (at least 5 characters).';
  }
  return errors;
}

export function AccountPage({ signUp = false }) {
  const { user, authStatus, signIn, signUp: register, retrySession } = useShop();
  const navigate = useNavigate();
  const location = useLocation();
  const heading = useRef(null);
  const pending = useRef(false);
  const [fields, setFields] = useState(emptyAccount);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const requested = location.state?.from;
  const destination = typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//')
    && !['/sign-in', '/sign-up'].includes(requested) ? requested : '/';
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  if (authStatus === 'loading') return <Loading>Checking your account...</Loading>;
  if (authStatus === 'error') return <RequestError message="Your account could not be checked. Please try again before signing in." onRetry={retrySession} />;
  if (user && !submitting) return <Navigate to={destination} replace />;

  function updateField(event) {
    const { name, value } = event.target;
    setFields(current => ({ ...current, [name]: value }));
    setErrors(current => ({ ...current, [name]: '' }));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const invalid = validateAccount(fields, signUp);
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      document.getElementById(`account-${Object.keys(invalid)[0]}`)?.focus();
      return;
    }
    pending.current = true;
    setSubmitting(true);
    setError('');
    try {
      const body = { email: fields.email.trim().toLowerCase(), password: fields.password };
      if (signUp) Object.assign(body, { name: fields.name.trim(), taxId: fields.taxId.trim(), homeAddress: fields.homeAddress.trim() });
      const success = await (signUp ? register(body) : signIn(body));
      if (success) {
        setFields(emptyAccount);
        navigate(destination, { replace: true });
      } else setError('Please wait for your bag to finish updating, then try again.');
    } catch (failure) {
      setErrors(fieldErrors(failure));
      setError(failure.message);
    } finally { pending.current = false; setSubmitting(false); }
  }

  function input(name, label, options = {}) {
    return <div className="account-field">
      <label htmlFor={`account-${name}`}>{label}</label>
      <input id={`account-${name}`} name={name} required value={fields[name]} onChange={updateField}
        aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `account-${name}-error` : undefined} {...options} />
      {errors[name] && <p className="account-error" id={`account-${name}-error`}>{errors[name]}</p>}
    </div>;
  }

  return <section className="account" aria-labelledby="account-title">
    <Link className="back-link" to="/">Back to shop</Link>
    <div className="account-panel">
      <h1 id="account-title" ref={heading} tabIndex="-1">{signUp ? 'Create an account' : 'Sign in'}</h1>
      <p className="account-description">{signUp ? 'Join Peko Cards.' : 'Welcome back to Peko Cards.'}</p>
      <form aria-labelledby="account-title" onSubmit={submit} noValidate aria-busy={submitting}>
        <fieldset className="account-fields" disabled={submitting}>
          {signUp && input('name', 'Display name', { autoComplete: 'nickname', maxLength: 100 })}
          {input('email', 'Email address', { type: 'email', autoComplete: 'email', autoCapitalize: 'none', spellCheck: false, maxLength: 254 })}
          <div className="account-field">
            <label htmlFor="account-password">Password</label>
            <div className="password-input">
              <input id="account-password" name="password" type={showPassword ? 'text' : 'password'} required
                autoComplete={signUp ? 'new-password' : 'current-password'} value={fields.password} onChange={updateField}
                aria-invalid={Boolean(errors.password)} aria-describedby={signUp ? 'password-help account-password-error' : 'account-password-error'} />
              <button type="button" aria-controls={signUp ? 'account-password account-confirm' : 'account-password'}
                aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
            </div>
            {signUp && <p className="field-help" id="password-help">At least 8 characters, including a letter and a digit.</p>}
            <p className="account-error" id="account-password-error">{errors.password}</p>
          </div>
          {signUp && <>
            {input('confirm', 'Confirm password', { type: showPassword ? 'text' : 'password', autoComplete: 'new-password' })}
            {input('taxId', 'Tax ID', { inputMode: 'numeric', maxLength: 11 })}
            {input('homeAddress', 'Home address', { autoComplete: 'street-address', maxLength: 500 })}
          </>}
          {error && <p className="account-error" role="alert">{error}</p>}
          <button className="account-submit" type="submit" disabled={submitting}>{submitting ? (signUp ? 'Creating account...' : 'Signing in...') : (signUp ? 'Create account' : 'Sign in')}</button>
        </fieldset>
        {submitting && <Loading>Checking your account and loading your bag...</Loading>}
      </form>
      <p className="account-switch">
        {signUp ? 'Already have an account? ' : 'New to Peko Cards? '}
        <Link to={signUp ? '/sign-in' : '/sign-up'} state={{ from: destination }}>{signUp ? 'Sign in' : 'Create an account'}</Link>
      </p>
    </div>
  </section>;
}
