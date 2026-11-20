'use strict';

const accountSection = document.querySelector('#account');
const shopSection = document.querySelector('#catalog');
const accountForm = document.querySelector('#account-form');
const accountTitle = document.querySelector('#account-title');
const accountName = document.querySelector('#account-name');
const accountEmail = document.querySelector('#account-email');
const accountPassword = document.querySelector('#account-password');
const accountConfirm = document.querySelector('#account-confirm');
const passwordToggle = document.querySelector('#show-password');
const accountSubmit = document.querySelector('#account-submit');
const accountError = document.querySelector('#account-error');
const sessionAnnouncement = document.querySelector('#session-announcement');

// These public credentials are only for the browser-local prototype.
const demoAccount = {
  email: 'trainer@example.com',
  password: 'peko-demo',
  displayName: 'Peko Trainer',
};
const demoSessionKey = 'peko-cards-demo-user';
let currentUser = readDemoSession();

function readDemoSession() {
  try {
    const user = JSON.parse(window.sessionStorage.getItem(demoSessionKey));
    if (typeof user?.displayName === 'string' && user.displayName.trim()) {
      return { displayName: user.displayName.trim().slice(0, 80) };
    }
  } catch {
    // The demo also works when browser storage is unavailable.
  }
  return null;
}

function renderAccountIndicator() {
  document.querySelector('#guest-actions').hidden = Boolean(currentUser);
  document.querySelector('#signed-in-account').hidden = !currentUser;
  const name = currentUser?.displayName ?? '';
  document.querySelector('#display-name').textContent = name;
  document.querySelector('#display-name').title = name;
  document.querySelector('#account-identity').setAttribute('aria-label', currentUser ? `Signed in as ${name}` : '');
}

function setDemoUser(user) {
  // The header only consumes { displayName }. Map the real account response here later.
  currentUser = user;
  try {
    if (user) window.sessionStorage.setItem(demoSessionKey, JSON.stringify(user));
    else window.sessionStorage.removeItem(demoSessionKey);
  } catch {
    // Keep the session in memory if storage is blocked.
  }
  renderAccountIndicator();
  sessionAnnouncement.textContent = user ? `Signed in as ${user.displayName} in demo mode.` : 'Signed out.';
}

function renderAccountRoute(focusHeading = false) {
  const signUp = window.location.hash === '#sign-up';
  const visible = signUp || window.location.hash === '#sign-in';
  if (currentUser && visible) {
    window.location.hash = '#catalog';
    return;
  }
  accountSection.hidden = !visible;
  shopSection.hidden = visible;
  document.title = visible ? `${signUp ? 'Sign up' : 'Sign in'} | Peko Cards` : 'Peko Cards | Pokémon Trading Cards';
  accountForm.reset();
  accountConfirm.setCustomValidity('');
  accountError.textContent = '';
  accountName.setCustomValidity('');
  accountPassword.type = 'password';
  accountConfirm.type = 'password';
  passwordToggle.textContent = 'Show';
  passwordToggle.setAttribute('aria-pressed', 'false');
  accountPassword.autocomplete = signUp ? 'new-password' : 'current-password';
  accountTitle.textContent = signUp ? 'Create an account' : 'Sign in';
  document.querySelector('#account-description').textContent = signUp ? 'Join Peko Cards.' : 'Welcome back to Peko Cards.';
  document.querySelector('#name-field').hidden = !signUp;
  document.querySelector('#confirm-field').hidden = !signUp;
  accountName.disabled = !signUp;
  accountName.required = signUp;
  accountConfirm.disabled = !signUp;
  accountConfirm.required = signUp;
  document.querySelector('#demo-account').hidden = signUp;
  accountSubmit.textContent = signUp ? 'Create account' : 'Sign in';
  document.querySelector('#account-switch-copy').textContent = signUp ? 'Already have an account?' : 'New to Peko Cards?';
  const switchLink = document.querySelector('#account-switch');
  switchLink.href = signUp ? '#sign-in' : '#sign-up';
  switchLink.textContent = signUp ? 'Sign in' : 'Create an account';
  if (visible && focusHeading) accountTitle.focus();
}

accountForm.addEventListener('input', () => {
  const mismatch = !accountConfirm.disabled && accountConfirm.value && accountConfirm.value !== accountPassword.value;
  accountConfirm.setCustomValidity(mismatch ? 'Your passwords do not match.' : '');
  accountName.setCustomValidity(!accountName.disabled && !accountName.value.trim() ? 'Enter a display name.' : '');
  accountError.textContent = '';
});

passwordToggle.addEventListener('click', () => {
  const show = accountPassword.type === 'password';
  accountPassword.type = show ? 'text' : 'password';
  accountConfirm.type = accountPassword.type;
  passwordToggle.textContent = show ? 'Hide' : 'Show';
  passwordToggle.setAttribute('aria-pressed', String(show));
});

accountForm.addEventListener('submit', event => {
  event.preventDefault();
  const signUp = window.location.hash === '#sign-up';
  accountName.setCustomValidity(signUp && !accountName.value.trim() ? 'Enter a display name.' : '');
  if (!accountForm.reportValidity()) return;
  if (!signUp && (accountEmail.value.trim().toLowerCase() !== demoAccount.email || accountPassword.value !== demoAccount.password)) {
    accountError.textContent = 'Use the demo email and password shown above.';
    return;
  }
  setDemoUser({ displayName: signUp ? accountName.value.trim() : demoAccount.displayName });
  accountForm.reset();
  accountPassword.value = '';
  accountConfirm.value = '';
  accountPassword.type = 'password';
  accountConfirm.type = 'password';
  passwordToggle.textContent = 'Show';
  passwordToggle.setAttribute('aria-pressed', 'false');
  window.location.hash = '#catalog';
  renderAccountRoute();
  document.querySelector('#account-identity').focus();
});

document.querySelector('#fill-demo').addEventListener('click', () => {
  accountEmail.value = demoAccount.email;
  accountPassword.value = demoAccount.password;
  accountError.textContent = '';
  accountSubmit.focus();
});

document.querySelector('#sign-out').addEventListener('click', () => {
  setDemoUser(null);
  renderAccountRoute();
  document.querySelector('.sign-in-link').focus();
});

window.addEventListener('hashchange', () => renderAccountRoute(true));
renderAccountIndicator();
renderAccountRoute();
accountSubmit.disabled = false;
