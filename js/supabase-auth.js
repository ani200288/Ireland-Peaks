/* PeakLog Supabase auth and per-user summit progress. */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://ewcpzgopglgkhjgopfck.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_qjYjbMAYdzw4SJA-o0Clxg_ILMtPelb';
  const STORAGE_KEY = 'irelandClimbedNames';
  const HYDRATED_USER_KEY = 'peakLogHydratedUser';
  const controls = document.getElementById('accountControls');
  let currentUser = null;
  let client;
  let authModal;

  function announceAuthReady() {
    window.peakLogUser = currentUser;
    window.dispatchEvent(new CustomEvent('peaklog:auth-ready', { detail: { user: currentUser } }));
  }

  function createAuthModal() {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'accountModal';
    modal.tabIndex = -1;
    modal.setAttribute('aria-labelledby', 'accountModalTitle');
    modal.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header"><h2 class="modal-title h5" id="accountModalTitle">PeakLog account</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body"><div id="signedInPanel" class="d-none"><p class="mb-3">Signed in as <strong id="accountEmailLabel"></strong></p><button type="button" id="accountSignOut" class="btn btn-outline-danger w-100">Sign out</button></div><div id="signedOutPanel"><div class="btn-group w-100 mb-3"><button type="button" class="btn btn-outline-success" id="showSignIn">Sign in</button><button type="button" class="btn btn-outline-success" id="showRegister">Create account</button></div><form id="accountForm"><label for="accountEmail" class="form-label">Email</label><input id="accountEmail" class="form-control mb-3" type="email" autocomplete="email" required><label for="accountPassword" class="form-label">Password</label><input id="accountPassword" class="form-control mb-3" type="password" autocomplete="current-password" minlength="6" required><button id="accountSubmit" class="btn btn-alpine w-100" type="submit">Sign in</button></form></div><p id="accountFeedback" class="small mt-3 mb-0" role="status" aria-live="polite"></p></div></div></div>`;
    document.body.appendChild(modal);
    return modal;
  }

  const modalElement = createAuthModal();
  const modalApi = window.bootstrap?.Modal;
  if (modalApi) authModal = new modalApi(modalElement);
  let authMode = 'signin';
  const form = document.getElementById('accountForm');
  const feedback = document.getElementById('accountFeedback');
  const submitButton = document.getElementById('accountSubmit');
  const emailInput = document.getElementById('accountEmail');
  const passwordInput = document.getElementById('accountPassword');

  function showMessage(message, isError = false) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.className = `small mt-3 mb-0 ${isError ? 'text-danger' : 'text-success'}`;
  }

  function setMode(mode) {
    authMode = mode;
    const registering = mode === 'signup';
    document.getElementById('accountModalTitle').textContent = registering ? 'Create your PeakLog account' : 'Sign in to PeakLog';
    submitButton.textContent = registering ? 'Register' : 'Sign in';
    passwordInput.autocomplete = registering ? 'new-password' : 'current-password';
    showMessage(registering ? 'Your climbs and private peak memories stay in your account.' : 'Sign in to access your saved climbs and private peak memories.');
  }

  document.getElementById('showSignIn').addEventListener('click', () => setMode('signin'));
  document.getElementById('showRegister').addEventListener('click', () => setMode('signup'));

  function renderAccount() {
    if (!controls) return;
    controls.replaceChildren();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-warning shadow';
    button.textContent = currentUser ? 'My account' : 'Sign in / Register';
    button.addEventListener('click', () => {
      document.getElementById('signedInPanel').classList.toggle('d-none', !currentUser);
      document.getElementById('signedOutPanel').classList.toggle('d-none', Boolean(currentUser));
      if (currentUser) {
        document.getElementById('accountModalTitle').textContent = 'Your PeakLog account';
        document.getElementById('accountEmailLabel').textContent = currentUser.email || 'Signed in';
      } else setMode('signin');
      authModal?.show();
    });
    controls.appendChild(button);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    submitButton.disabled = true;
    try {
      const result = authMode === 'signup'
        ? await client.auth.signUp({ email: emailInput.value.trim(), password: passwordInput.value, options: { emailRedirectTo: new URL('./index.html', window.location.href).href } })
        : await client.auth.signInWithPassword({ email: emailInput.value.trim(), password: passwordInput.value });
      if (result.error) throw result.error;
      if (authMode === 'signup' && !result.data.session) showMessage('Registration received. Check your email and confirm your address, then sign in.');
      else location.reload();
    } catch (error) {
      showMessage(error.message || 'Authentication failed. Please try again.', true);
    } finally {
      submitButton.disabled = false;
    }
  });

  document.getElementById('accountSignOut').addEventListener('click', async () => {
    await client.auth.signOut();
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(HYDRATED_USER_KEY);
    location.reload();
  });

  async function initialize() {
    if (controls) {
      controls.className = 'peaklog-account-control';
      controls.style.cssText = 'position:fixed;right:1rem;bottom:1rem;z-index:1030;';
      document.body.appendChild(controls);
    }
    renderAccount();
    if (!window.supabase || typeof window.supabase.createClient !== 'function' || !modalApi) {
      announceAuthReady();
      return;
    }
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    window.peakLogSupabase = client;
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      currentUser = data.session?.user || null;
      announceAuthReady();
      renderAccount();
      if (!currentUser) return;
      const { data: climbs, error: climbsError } = await client.from('climbed_peaks').select('peak_name').eq('user_id', currentUser.id);
      if (climbsError) throw climbsError;
      localStorage.setItem(STORAGE_KEY, JSON.stringify((climbs || []).map(row => row.peak_name)));
    } catch (error) {
      console.error('PeakLog authentication/progress initialization failed:', error);
      announceAuthReady();
    }

    client.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user || null;
      if (nextUser?.id === currentUser?.id) return;
      currentUser = nextUser;
      announceAuthReady();
      renderAccount();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
