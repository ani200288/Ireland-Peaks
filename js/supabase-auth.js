/* PeakLog Supabase auth and per-user summit progress. Uses only the public publishable key. */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://ewcpzgopglgkhjgopfck.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_qjYjbMAYdzw4SJA-o0Clxg_ILMtPelb';
  const STORAGE_KEY = 'irelandClimbedNames';
  const supabaseApi = window.supabase;
  const controls = document.getElementById('accountControls');
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  let currentUser = null;
  let syncedNames = new Set();
  let appReady = false;

  if (!supabaseApi || typeof supabaseApi.createClient !== 'function') {
    showMessage('Could not load Supabase. Progress remains stored on this device.');
    return;
  }

  const client = supabaseApi.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  window.peakLogSupabase = client;

  function showMessage(message, isError = false) {
    let status = document.getElementById('accountStatus');
    if (!status && controls) {
      status = document.createElement('span');
      status.id = 'accountStatus';
      status.className = 'small d-block text-white-50 mt-1';
      controls.appendChild(status);
    }
    if (status) {
      status.textContent = message;
      status.classList.toggle('text-warning', isError);
    }
  }

  function renderAccount() {
    if (!controls) return;
    controls.replaceChildren();
    if (currentUser) {
      const row = document.createElement('div');
      row.className = 'd-flex align-items-center gap-2';
      const email = document.createElement('span');
      email.className = 'small text-white';
      email.textContent = currentUser.email || 'Signed in';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm btn-outline-light';
      button.textContent = 'Sign out';
      button.addEventListener('click', async () => {
        button.disabled = true;
        const { error } = await client.auth.signOut();
        if (error) {
          showMessage(error.message, true);
          button.disabled = false;
          return;
        }
        originalRemoveItem.call(localStorage, STORAGE_KEY);
        sessionStorage.removeItem('peakLogHydratedUser');
        location.reload();
      });
      row.append(email, button);
      controls.appendChild(row);
      showMessage('Your climbs sync to your account.');
      return;
    }

    const form = document.createElement('form');
    form.className = 'd-flex flex-wrap align-items-center gap-1';
    form.setAttribute('aria-label', 'Sign in or create a PeakLog account');
    const email = document.createElement('input');
    email.type = 'email'; email.required = true; email.autocomplete = 'email';
    email.placeholder = 'Email'; email.setAttribute('aria-label', 'Email');
    email.className = 'form-control form-control-sm'; email.style.width = '150px';
    const password = document.createElement('input');
    password.type = 'password'; password.required = true; password.minLength = 6;
    password.autocomplete = 'current-password'; password.placeholder = 'Password';
    password.setAttribute('aria-label', 'Password'); password.className = 'form-control form-control-sm'; password.style.width = '130px';
    const signIn = document.createElement('button');
    signIn.type = 'submit'; signIn.className = 'btn btn-sm btn-outline-light'; signIn.textContent = 'Sign in';
    const signUp = document.createElement('button');
    signUp.type = 'button'; signUp.className = 'btn btn-sm btn-warning'; signUp.textContent = 'Create account';

    async function authenticate(action) {
      if (!form.reportValidity()) return;
      signIn.disabled = signUp.disabled = true;
      showMessage(action === 'signup' ? 'Creating account…' : 'Signing in…');
      const result = action === 'signup'
        ? await client.auth.signUp({ email: email.value.trim(), password: password.value })
        : await client.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
      signIn.disabled = signUp.disabled = false;
      if (result.error) {
        showMessage(result.error.message, true);
      } else if (action === 'signup' && !result.data.session) {
        showMessage('Check your email to confirm your account, then sign in.');
      } else {
        location.reload();
      }
    }
    form.addEventListener('submit', event => { event.preventDefault(); authenticate('signin'); });
    signUp.addEventListener('click', () => authenticate('signup'));
    form.append(email, password, signIn, signUp);
    controls.appendChild(form);
    showMessage('Sign in to sync your climbs across devices.');
  }

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

    // Update local cache first; each database operation is scoped to the signed-in user by RLS.
    syncedNames = new Set(nextNames);
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
      showMessage('Progress synced.');
    } catch (error) {
      showMessage(`Could not sync progress: ${error.message}`, true);
      console.error('PeakLog progress sync failed:', error);
    }
  }

  Storage.prototype.setItem = function (key, value) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && key === STORAGE_KEY && currentUser) {
      try { persistChanges(new Set(JSON.parse(value))); }
      catch (error) { showMessage('Could not read the updated progress.', true); }
    }
  };

  async function initialize() {
    renderAccount();
    const { data, error } = await client.auth.getSession();
    if (error) {
      showMessage(`Authentication error: ${error.message}`, true);
      return;
    }
    currentUser = data.session?.user || null;
    renderAccount();
    if (!currentUser) return;

    try {
      const climbs = await fetchClimbs();
      syncedNames = new Set(climbs);
      originalSetItem.call(localStorage, STORAGE_KEY, JSON.stringify([...climbs]));
      // peaks-app reads localStorage during startup; reload once after loading the account's data.
      if (sessionStorage.getItem('peakLogHydratedUser') !== currentUser.id) {
        sessionStorage.setItem('peakLogHydratedUser', currentUser.id);
        location.reload();
        return;
      }
      appReady = true;
      showMessage('Your climbs are synced with Supabase.');
    } catch (error) {
      showMessage(`Could not load your saved climbs: ${error.message}`, true);
      console.error('PeakLog progress load failed:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
