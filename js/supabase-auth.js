/* PeakLog Supabase auth and per-user summit progress. Uses only the public publishable key. */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://ewcpzgopglgkhjgopfck.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_qjYjbMAYdzw4SJA-o0Clxg_ILMtPelb';
  const STORAGE_KEY = 'irelandClimbedNames';
  const HYDRATED_USER_KEY = 'peakLogHydratedUser';
  const controls = document.getElementById('accountControls');
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  let currentUser = null;
  let syncedNames = new Set();
  let client;
  let authModal;

  function createAuthModal() {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'accountModal';
    modal.tabIndex = -1;
    modal.setAttribute('aria-labelledby', 'accountModalTitle');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title h5" id="accountModalTitle">PeakLog account</h2>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="btn-group w-100 mb-3" role="group" aria-label="Account action">
              <button type="button" class="btn btn-outline-success" id="showSignIn">Sign in</button>
              <button type="button" class="btn btn-outline-success" id="showRegister">Create account</button>
            </div>
            <form id="accountForm">
              <label for="accountEmail" class="form-label">Email</label>
              <input id="accountEmail" class="form-control mb-3" type="email" autocomplete="email" required>
              <label for="accountPassword" class="form-label">Password</label>
              <input id="accountPassword" class="form-control mb-3" type="password" autocomplete="current-password" minlength="6" required>
              <button id="accountSubmit" class="btn btn-alpine w-100" type="submit">Sign in</button>
            </form>
            <p id="accountFeedback" class="small mt-3 mb-0" role="status" aria-live="polite"></p>
          </div>
        </div>
      </div>`;
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
    showMessage(registering ? 'Your climbs will sync across your devices.' : 'Sign in to access your saved climbs.');
    document.getElementById('showSignIn').classList.toggle('active', !registering);
    document.getElementById('showRegister').classList.toggle('active', registering);
  }

  document.getElementById('showSignIn').addEventListener('click', () => setMode('signin'));
  document.getElementById('showRegister').addEventListener('click', () => setMode('signup'));

  function renderAccount() {
    if (!controls) return;
    controls.replaceChildren();
    if (currentUser) {
      const row = document.createElement('div');
      row.className = 'd-flex align-items-center gap-2';
      const email = document.createElement('span');
      email.className = 'small text-white';
      email.textContent = currentUser.email || 'Signed in';
      const signOut = document.createElement('button');
      signOut.type = 'button';
      signOut.className = 'btn btn-sm btn-outline-light';
      signOut.textContent = 'Sign out';
      signOut.addEventListener('click', async () => {
        signOut.disabled = true;
        const { error } = await client.auth.signOut();
        if (error) {
          signOut.disabled = false;
          setMode('signin');
          showMessage(error.message, true);
          authModal?.show();
          return;
        }
        originalRemoveItem.call(localStorage, STORAGE_KEY);
        sessionStorage.removeItem(HYDRATED_USER_KEY);
        location.reload();
      });
      row.append(email, signOut);
      controls.appendChild(row);
      return;
    }

    const group = document.createElement('div');
    group.className = 'btn-group btn-group-sm';
    const signIn = document.createElement('button');
    signIn.type = 'button';
    signIn.className = 'btn btn-outline-light';
    signIn.textContent = 'Sign in';
    signIn.addEventListener('click', () => { setMode('signin'); authModal?.show(); });
    const register = document.createElement('button');
    register.type = 'button';
    register.className = 'btn btn-warning';
    register.textContent = 'Register';
    register.addEventListener('click', () => { setMode('signup'); authModal?.show(); });
    group.append(signIn, register);
    controls.appendChild(group);
  }

  function getConfirmationRedirect() {
    // Relative to the currently served project directory (including GitHub Pages project sites).
    return new URL('./index.html', window.location.href).href;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!client) return;
    submitButton.disabled = true;
    showMessage(authMode === 'signup' ? 'Creating your account…' : 'Signing in…');
    try {
      const result = authMode === 'signup'
        ? await client.auth.signUp({
          email: emailInput.value.trim(),
          password: passwordInput.value,
          options: { emailRedirectTo: getConfirmationRedirect() }
        })
        : await client.auth.signInWithPassword({
          email: emailInput.value.trim(),
          password: passwordInput.value
        });
      if (result.error) throw result.error;
      if (authMode === 'signup' && !result.data.session) {
        showMessage('Registration received. Check your email and confirm your address, then sign in.');
      } else {
        location.reload();
      }
    } catch (error) {
      showMessage(error.message || 'Authentication failed. Please try again.', true);
    } finally {
      submitButton.disabled = false;
    }
  });

  async function fetchClimbs() {
    const { data, error } = await client.from('climbed_peaks')
      .select('peak_name').eq('user_id', currentUser.id);
    if (error) throw error;
    return new Set((data || []).map(row => row.peak_name));
  }

  async function persistChanges(nextNames) {
    if (!currentUser) return;
    const removed = [...syncedNames].filter(name => !nextNames.has(name));
    const added = [...nextNames].filter(name => !syncedNames.has(name));
    if (!removed.length && !added.length) return;

    try {
      if (removed.length) {
        const { error } = await client.from('climbed_peaks').delete()
          .eq('user_id', currentUser.id).in('peak_name', removed);
        if (error) throw error;
      }
      if (added.length) {
        const rows = added.map(peak_name => ({ user_id: currentUser.id, peak_name }));
        const { error } = await client.from('climbed_peaks').upsert(rows, { onConflict: 'user_id,peak_name' });
        if (error) throw error;
      }
      syncedNames = new Set(nextNames);
    } catch (error) {
      showMessage(error.message || 'Could not sync progress.', true);
      console.error('PeakLog progress sync failed:', error);
    }
  }

  Storage.prototype.setItem = function (key, value) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && key === STORAGE_KEY && currentUser) {
      try { void persistChanges(new Set(JSON.parse(value))); }
      catch (error) { console.error('Could not read updated peak progress:', error); }
    }
  };

  async function initialize() {
    renderAccount();
    if (!window.supabase || typeof window.supabase.createClient !== 'function' || !modalApi) {
      console.error('Supabase or Bootstrap failed to load.');
      return;
    }
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    window.peakLogSupabase = client;
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      currentUser = data.session?.user || null;
      renderAccount();
      if (!currentUser) return;

      const climbs = await fetchClimbs();
      syncedNames = new Set(climbs);
      originalSetItem.call(localStorage, STORAGE_KEY, JSON.stringify([...climbs]));
      if (sessionStorage.getItem(HYDRATED_USER_KEY) !== currentUser.id) {
        sessionStorage.setItem(HYDRATED_USER_KEY, currentUser.id);
        location.reload();
      }
    } catch (error) {
      console.error('PeakLog authentication/progress initialization failed:', error);
      setMode('signin');
      showMessage(error.message || 'Could not load your account. Please try again.', true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
