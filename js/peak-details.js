/* Peak detail modal, private user photos/notes, and climb-date controls. */
(() => {
  'use strict';

  const BUCKET = 'peak-photos';
  const MAX_PHOTOS = 5;
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const DATE_KEY = 'peakLogClimbDates';
  const LAT_RADIUS = 0.061;
  const LON_RADIUS = 0.14;
  const grid = document.getElementById('peaksGrid');
  if (!grid) return;

  let detailsModal;
  let climbDateModal;
  let achievementModal;
  let activePeak = null;
  let savedPaths = [];
  let selectedFiles = [];
  let removedPaths = new Set();
  let recordsReady = false;
  let dates = readLocalDates();
  let coversByPeak = new Map();
  let signedUrlCache = new Map();
  let pendingAchievements = [];

  function element(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }

  function todayLocal() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function readLocalDates() {
    try {
      const value = JSON.parse(localStorage.getItem(DATE_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function writeLocalDates() {
    localStorage.setItem(DATE_KEY, JSON.stringify(dates));
  }

  function formattedDate(value) {
    if (!value) return '';
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed);
  }

  function currentUser() {
    return window.peakLogUser || null;
  }

  function buildDetailsModal() {
    const shell = element('div', 'modal fade');
    shell.id = 'peakDetailsModal';
    shell.tabIndex = -1;
    shell.setAttribute('aria-labelledby', 'peakDetailsTitle');
    shell.setAttribute('aria-hidden', 'true');
    shell.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
        <div class="modal-content peak-details-modal">
          <div class="modal-header">
            <div><h2 class="modal-title h4 fw-bold mb-1" id="peakDetailsTitle"></h2><div id="peakDetailsSubtitle" class="small text-muted"></div></div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close peak details"></button>
          </div>
          <div class="modal-body">
            <div class="d-flex flex-wrap gap-2 mb-4"><a id="peakDetailsAllTrails" class="btn btn-outline-success" target="_blank" rel="noopener noreferrer">View nearby routes on AllTrails ↗</a></div>
            <div id="peakDetailsPrivateNotice" class="alert alert-info py-2 small">Your photos and notes are private to your account.</div>
            <div id="peakDetailsSignIn" class="alert alert-warning d-none" role="status">Sign in to add and view your private photos and notes. <button type="button" class="btn btn-sm btn-warning ms-2" id="peakDetailsSignInButton">Sign in / Register</button></div>
            <form id="peakDetailsForm">
              <label for="peakPhotoInput" class="form-label fw-semibold">Photos <span id="peakPhotoCount" class="text-muted small"></span></label>
              <input id="peakPhotoInput" class="form-control" type="file" accept="image/jpeg,image/png,image/webp" multiple>
              <div class="form-text">Up to 5 photos per peak, max 5 MB each. JPG, PNG or WebP. The first photo is used as the card cover.</div>
              <div id="peakPhotoGallery" class="peak-photo-gallery mt-3"></div>
              <div class="mt-4"><label for="peakNotesInput" class="form-label fw-semibold">Your notes</label><textarea id="peakNotesInput" class="form-control" rows="5" maxlength="2000" placeholder="Route you took, conditions, memorable moments…"></textarea><div class="form-text text-end"><span id="peakNotesCount">0</span>/2000</div></div>
              <div id="peakDetailsFeedback" class="small mt-3" role="status" aria-live="polite"></div>
              <button id="peakDetailsSave" class="btn btn-alpine mt-2" type="submit">Save photos and notes</button>
            </form>
          </div>
        </div>
      </div>`;
    document.body.appendChild(shell);
    detailsModal = new bootstrap.Modal(shell);
    shell.querySelector('#peakDetailsSignInButton').addEventListener('click', () => {
      detailsModal.hide();
      document.querySelector('#accountControls button')?.click();
    });
    shell.querySelector('#peakPhotoInput').addEventListener('change', onFilesSelected);
    shell.querySelector('#peakNotesInput').addEventListener('input', event => {
      shell.querySelector('#peakNotesCount').textContent = String(event.target.value.length);
    });
    shell.querySelector('#peakDetailsForm').addEventListener('submit', savePeakDetails);
    shell.addEventListener('hidden.bs.modal', () => {
      activePeak = null;
      selectedFiles = [];
      removedPaths = new Set();
      shell.querySelector('#peakPhotoInput').value = '';
    });
  }

  function buildClimbDateModal() {
    const shell = element('div', 'modal fade');
    shell.id = 'climbDateModal';
    shell.tabIndex = -1;
    shell.setAttribute('aria-labelledby', 'climbDateTitle');
    shell.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content"><form id="climbDateForm"><div class="modal-header"><h2 class="modal-title h5" id="climbDateTitle">When did you climb this peak?</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cancel"></button></div><div class="modal-body"><label for="climbDateInput" class="form-label">Climb date</label><input id="climbDateInput" class="form-control" type="date" required><p class="form-text mb-0">You can choose a past date; today is selected by default.</p></div><div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-alpine">Save climb</button></div></form></div></div>`;
    document.body.appendChild(shell);
    climbDateModal = new bootstrap.Modal(shell);
    shell.querySelector('#climbDateInput').max = todayLocal();
    shell.querySelector('#climbDateForm').addEventListener('submit', event => {
      event.preventDefault();
      if (!activePeak) return;
      const name = activePeak.name;
      const value = shell.querySelector('#climbDateInput').value;
      if (!value || value > todayLocal()) return;
      dates[name] = value;
      writeLocalDates();
      window.toggleClimbed?.(name);
      void saveDateToCloud(name, value);
      void decorateCards();
      climbDateModal.hide();
    });
    shell.addEventListener('hidden.bs.modal', () => {
      activePeak = null;
      // Let Bootstrap finish hiding the date dialog before showing the award.
      window.setTimeout(showPendingAchievements, 180);
    });
  }

  function buildAchievementModal() {
    const shell = element('div', 'modal fade achievement-unlock-modal');
    shell.id = 'achievementUnlockModal';
    shell.tabIndex = -1;
    shell.setAttribute('aria-labelledby', 'achievementUnlockTitle');
    shell.setAttribute('aria-hidden', 'true');
    shell.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content text-center"><div class="modal-body p-4 p-md-5"><div class="achievement-unlock-confetti" aria-hidden="true">✦　✧　✦</div><div class="achievement-unlock-icon" id="achievementUnlockIcon" aria-hidden="true">🏆</div><p class="text-uppercase small fw-bold text-success mb-2">Achievement unlocked</p><h2 class="h3 fw-bold" id="achievementUnlockTitle"></h2><div id="achievementUnlockList" class="achievement-unlock-list mt-3"></div><button type="button" class="btn btn-alpine mt-4" data-bs-dismiss="modal">Brilliant!</button></div></div></div>`;
    document.body.appendChild(shell);
    achievementModal = new bootstrap.Modal(shell);
  }

  function buildAllTrailsUrl(peak) {
    const url = new URL('https://www.alltrails.com/explore');
    url.searchParams.set('b_br_lat', (peak.lat - LAT_RADIUS).toFixed(12));
    url.searchParams.set('b_br_lng', (peak.lon - LON_RADIUS).toFixed(12));
    url.searchParams.set('b_tl_lat', (peak.lat + LAT_RADIUS).toFixed(12));
    url.searchParams.set('b_tl_lng', (peak.lon + LON_RADIUS).toFixed(12));
    return url.toString();
  }

  function setFeedback(message, isError = false) {
    const feedback = detailsModal._element.querySelector('#peakDetailsFeedback');
    feedback.textContent = message;
    feedback.className = `small mt-3 ${isError ? 'text-danger' : 'text-success'}`;
  }

  function openPeakDetails(peak) {
    activePeak = peak;
    selectedFiles = [];
    removedPaths = new Set();
    recordsReady = false;
    const view = detailsModal._element;
    view.querySelector('#peakDetailsTitle').textContent = peak.name;
    view.querySelector('#peakDetailsSubtitle').textContent = `${peak.height} m · ${peak.county} · ${peak.difficulty}`;
    view.querySelector('#peakDetailsAllTrails').href = buildAllTrailsUrl(peak);
    view.querySelector('#peakDetailsFeedback').textContent = '';
    view.querySelector('#peakPhotoInput').value = '';
    view.querySelector('#peakNotesInput').value = '';
    view.querySelector('#peakNotesCount').textContent = '0';
    view.querySelector('#peakPhotoGallery').replaceChildren();
    const user = currentUser();
    view.querySelector('#peakDetailsSignIn').classList.toggle('d-none', Boolean(user));
    view.querySelector('#peakDetailsPrivateNotice').classList.toggle('d-none', !user);
    view.querySelector('#peakDetailsForm').classList.toggle('d-none', !user);
    view.querySelector('#peakDetailsSave').disabled = false;
    updatePhotoCount();
    detailsModal.show();
    if (user) void loadSavedDetails(peak);
  }

  async function loadSavedDetails(peak) {
    const client = window.peakLogSupabase;
    if (!client) return setFeedback('Account service is not ready. Please refresh and try again.', true);
    setFeedback('Loading your private peak memories…');
    try {
      const { data, error } = await client.from('peak_memories').select('notes, photo_paths').eq('peak_name', peak.name).maybeSingle();
      if (error) throw error;
      if (activePeak !== peak) return;
      savedPaths = Array.isArray(data?.photo_paths) ? data.photo_paths : [];
      detailsModal._element.querySelector('#peakNotesInput').value = data?.notes || '';
      detailsModal._element.querySelector('#peakNotesCount').textContent = String((data?.notes || '').length);
      recordsReady = true;
      await renderGallery();
      setFeedback('Your private peak memories are ready.');
    } catch (error) {
      setFeedback(`Could not load peak memories: ${error.message || 'check Supabase table access and RLS permissions.'}`, true);
    }
  }

  async function renderGallery() {
    const gallery = detailsModal._element.querySelector('#peakPhotoGallery');
    gallery.replaceChildren();
    const client = window.peakLogSupabase;
    const activePaths = savedPaths.filter(path => !removedPaths.has(path));
    for (const [index, path] of activePaths.entries()) {
      const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (error) throw error;
      const item = element('div', `peak-photo-item ${index === 0 ? 'is-cover' : ''}`);
      const image = element('img');
      image.src = data.signedUrl;
      image.alt = `${activePeak.name} photo ${index + 1}`;
      item.appendChild(image);
      if (index === 0) item.appendChild(element('span', 'peak-photo-cover-label', 'Card cover'));
      const remove = element('button', 'btn btn-sm btn-danger peak-photo-remove', 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', () => { removedPaths.add(path); void renderGallery(); updatePhotoCount(); });
      item.appendChild(remove);
      gallery.appendChild(item);
    }
    selectedFiles.forEach((file, index) => {
      const item = element('div', `peak-photo-item ${activePaths.length === 0 && index === 0 ? 'is-cover' : ''}`);
      const image = element('img');
      image.src = URL.createObjectURL(file);
      image.alt = `${activePeak.name} selected photo preview`;
      item.appendChild(image);
      if (activePaths.length === 0 && index === 0) item.appendChild(element('span', 'peak-photo-cover-label', 'Card cover'));
      const remove = element('button', 'btn btn-sm btn-danger peak-photo-remove', 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', () => { selectedFiles.splice(index, 1); void renderGallery(); updatePhotoCount(); });
      item.appendChild(remove);
      gallery.appendChild(item);
    });
    updatePhotoCount();
  }

  function photoTotal() {
    return savedPaths.filter(path => !removedPaths.has(path)).length + selectedFiles.length;
  }

  function updatePhotoCount() {
    if (!detailsModal) return;
    const count = photoTotal();
    const input = detailsModal._element.querySelector('#peakPhotoInput');
    detailsModal._element.querySelector('#peakPhotoCount').textContent = `(${count}/${MAX_PHOTOS})`;
    input.disabled = !recordsReady || count >= MAX_PHOTOS;
  }

  function onFilesSelected(event) {
    const files = [...event.target.files];
    event.target.value = '';
    const available = MAX_PHOTOS - photoTotal();
    if (files.length > available) setFeedback(`You can add only ${available} more photo${available === 1 ? '' : 's'} (maximum ${MAX_PHOTOS}).`, true);
    files.slice(0, available).forEach(file => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setFeedback('Use JPG, PNG or WebP image files only.', true);
      if (file.size > MAX_FILE_BYTES) return setFeedback(`${file.name} is over the 5 MB per-photo limit.`, true);
      selectedFiles.push(file);
    });
    void renderGallery();
  }

  async function savePeakDetails(event) {
    event.preventDefault();
    const user = currentUser();
    const client = window.peakLogSupabase;
    if (!user || !client || !activePeak || !recordsReady) return;
    const button = detailsModal._element.querySelector('#peakDetailsSave');
    const notes = detailsModal._element.querySelector('#peakNotesInput').value.trim();
    button.disabled = true;
    setFeedback('Saving your private photos and notes…');
    const uploads = [];
    try {
      const finalPaths = savedPaths.filter(path => !removedPaths.has(path));
      for (const file of selectedFiles) {
        const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(-80);
        const safePeakName = activePeak.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
        const path = `${user.id}/${safePeakName}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await client.storage.from(BUCKET).upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });
        if (error) throw error;
        uploads.push(path);
        finalPaths.push(path);
      }
      if (finalPaths.length > MAX_PHOTOS) throw new Error(`Maximum ${MAX_PHOTOS} photos per peak.`);
      const { error } = await client.from('peak_memories').upsert({ user_id: user.id, peak_name: activePeak.name, notes, photo_paths: finalPaths }, { onConflict: 'user_id,peak_name' });
      if (error) throw error;
      const oldPaths = savedPaths.filter(path => removedPaths.has(path));
      if (oldPaths.length) await client.storage.from(BUCKET).remove(oldPaths);
      savedPaths = finalPaths;
      selectedFiles = [];
      removedPaths = new Set();
      coversByPeak.set(activePeak.name, finalPaths[0] || null);
      signedUrlCache.delete(activePeak.name);
      await renderGallery();
      void decorateCards();
      setFeedback('Saved. Your notes and photos are private to your account.');
    } catch (error) {
      if (uploads.length) await client.storage.from(BUCKET).remove(uploads);
      setFeedback(error.message || 'Could not save your peak memories.', true);
    } finally {
      button.disabled = false;
      updatePhotoCount();
    }
  }

  async function signedPhotoUrl(name, path) {
    if (!path || !window.peakLogSupabase) return null;
    if (signedUrlCache.has(name)) return signedUrlCache.get(name);
    const { data, error } = await window.peakLogSupabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error) return null;
    signedUrlCache.set(name, data.signedUrl);
    return data.signedUrl;
  }

  async function decorateCards() {
    grid.querySelectorAll('.peak-card').forEach(card => {
      const name = card.querySelector('h3')?.textContent?.trim();
      if (!name) return;
      card.querySelector('.climb-date-label')?.remove();
      const isClimbed = card.querySelector('.btn-mark-climbed')?.classList.contains('climbed-active');
      if (isClimbed && dates[name]) {
        const label = element('p', 'small text-success fw-semibold mb-2 climb-date-label', `Climbed ${formattedDate(dates[name])}`);
        card.querySelector('h3')?.after(label);
      }
      card.querySelector('.peak-card-cover')?.remove();
      const path = coversByPeak.get(name);
      if (!path || !currentUser()) return;
      void signedPhotoUrl(name, path).then(url => {
        if (!url || !card.isConnected || card.querySelector('.peak-card-cover')) return;
        const image = element('img', 'peak-card-cover');
        image.src = url;
        image.alt = `${name} personal photo cover`;
        image.loading = 'lazy';
        card.prepend(image);
      });
    });
  }

  async function loadUserDetails() {
    if (!currentUser() || !window.peakLogSupabase) return;
    try {
      const { data, error } = await window.peakLogSupabase.from('peak_memories').select('peak_name, photo_paths');
      if (error) throw error;
      coversByPeak = new Map((data || []).map(row => [row.peak_name, row.photo_paths?.[0] || null]));
      signedUrlCache.clear();
      void decorateCards();
    } catch (error) {
      console.warn('Could not hydrate personal peak covers:', error.message);
    }
  }

  async function saveDateToCloud(name, date) {
    if (!currentUser() || !window.peakLogSupabase) return;
    const { error } = await window.peakLogSupabase.from('climb_dates').upsert({ user_id: currentUser().id, peak_name: name, climbed_on: date }, { onConflict: 'user_id,peak_name' });
    if (error) console.error('Could not sync climb date:', error.message);
  }

  async function removeDateFromCloud(name) {
    if (!currentUser() || !window.peakLogSupabase) return;
    const { error } = await window.peakLogSupabase.from('climb_dates').delete().eq('user_id', currentUser().id).eq('peak_name', name);
    if (error) console.error('Could not remove climb date:', error.message);
  }

  async function loadCloudDates() {
    if (!currentUser() || !window.peakLogSupabase) return;
    const { data, error } = await window.peakLogSupabase.from('climb_dates').select('peak_name, climbed_on');
    if (error) {
      console.warn('Climb dates are local until the climb_dates setup SQL is run:', error.message);
      void loadUserDetails();
      return;
    }
    (data || []).forEach(row => { dates[row.peak_name] = row.climbed_on; });
    writeLocalDates();
    void loadUserDetails();
    void decorateCards();
  }

  function unlockedTrophies() {
    return new Map([...document.querySelectorAll('#trophyCabinet .trophy-card.unlocked')].map(card => {
      const title = card.querySelector('h3')?.textContent?.trim();
      return [title, {
        title,
        description: card.querySelector('p')?.textContent?.trim() || '',
        icon: card.querySelector('.trophy-icon')?.textContent?.trim() || '🏆'
      }];
    }).filter(([title]) => title));
  }

  function seenAchievementTitles() {
    const key = `peakLogSeenAchievements:${currentUser()?.id || 'guest'}`;
    try { return { key, values: new Set(JSON.parse(localStorage.getItem(key) || '[]')) }; }
    catch (_) { return { key, values: new Set() }; }
  }

  function watchForAchievementUnlocks() {
    if (typeof window.toggleClimbed !== 'function' || window.toggleClimbed.peakLogAchievementWrapped) return;
    const originalToggle = window.toggleClimbed;
    const wrappedToggle = function (peakName) {
      const before = unlockedTrophies();
      const result = originalToggle.apply(this, arguments);
      const newlyUnlocked = [...unlockedTrophies().entries()]
        .filter(([title]) => !before.has(title))
        .map(([, achievement]) => achievement);
      if (newlyUnlocked.length) {
        const seen = seenAchievementTitles();
        const firstUnlocks = newlyUnlocked.filter(item => !seen.values.has(item.title));
        newlyUnlocked.forEach(item => seen.values.add(item.title));
        localStorage.setItem(seen.key, JSON.stringify([...seen.values]));
        if (firstUnlocks.length) {
          window.dispatchEvent(new CustomEvent('peaklog:achievements-unlocked', { detail: { achievements: firstUnlocks } }));
        }
      }
      return result;
    };
    wrappedToggle.peakLogAchievementWrapped = true;
    window.toggleClimbed = wrappedToggle;
  }

  function showPendingAchievements() {
    if (!pendingAchievements.length || !achievementModal) return;
    const unlocked = pendingAchievements.splice(0);
    const modal = achievementModal._element;
    modal.querySelector('#achievementUnlockIcon').textContent = unlocked.length === 1 ? unlocked[0].icon : '🏆';
    modal.querySelector('#achievementUnlockTitle').textContent = unlocked.length === 1 ? unlocked[0].title : `${unlocked.length} achievements unlocked!`;
    const list = modal.querySelector('#achievementUnlockList');
    list.replaceChildren();
    unlocked.forEach(item => {
      const row = element('div', 'achievement-unlock-item');
      row.append(element('span', 'achievement-unlock-item-icon', item.icon), element('span', '', item.title));
      if (item.description) row.appendChild(element('small', 'd-block text-muted mt-1', item.description));
      list.appendChild(row);
    });
    achievementModal.show();
  }

  function onGridClick(event) {
    const button = event.target.closest('.btn-mark-climbed');
    if (!button || !grid.contains(button)) return;
    const card = button.closest('.peak-card');
    const name = card?.querySelector('h3')?.textContent?.trim();
    if (!name) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    activePeak = { name };
    if (button.classList.contains('climbed-active')) {
      delete dates[name];
      writeLocalDates();
      window.toggleClimbed?.(name);
      void removeDateFromCloud(name);
      void decorateCards();
      return;
    }
    const dateInput = climbDateModal._element.querySelector('#climbDateInput');
    dateInput.value = todayLocal();
    dateInput.max = todayLocal();
    climbDateModal.show();
  }

  function attachCardInteractions() {
    grid.querySelectorAll('.peak-card').forEach(card => {
      if (card.dataset.detailsBound) return;
      card.dataset.detailsBound = 'true';
      const heading = card.querySelector('h3');
      if (!heading) return;
      const name = heading.textContent.trim();
      const peak = {
        name,
        height: Number.parseInt(card.querySelector('.peak-elevation')?.textContent, 10),
        county: card.querySelector('.pill-region')?.textContent.trim() || 'Ireland',
        difficulty: card.querySelector('.text-muted.fw-semibold')?.textContent.replace('Arderin List • ', '') || 'Peak',
        id: Number(card.querySelector('[id^="weather-"]')?.id.replace('weather-', '')) || 0,
        lat: undefined,
        lon: undefined
      };
      card.classList.add('peak-card-clickable');
      card.tabIndex = 0;
      card.setAttribute('aria-label', `Open ${name} details, photos and notes`);
      const open = element('button', 'btn btn-outline-secondary w-100 mt-2 peak-details-open', 'Peak details, photos & notes');
      open.type = 'button';
      open.addEventListener('click', () => openPeakDetails(peak));
      card.appendChild(open);
      card.addEventListener('click', click => {
        if (click.target.closest('button, a, input, select, textarea, label')) return;
        openPeakDetails(peak);
      });
      card.addEventListener('keydown', keyEvent => {
        if ((keyEvent.key === 'Enter' || keyEvent.key === ' ') && keyEvent.target === card) {
          keyEvent.preventDefault();
          openPeakDetails(peak);
        }
      });
    });
  }

  buildDetailsModal();
  buildClimbDateModal();
  buildAchievementModal();
  grid.addEventListener('click', onGridClick, true);
  window.addEventListener('peaklog:achievements-unlocked', event => {
    pendingAchievements.push(...(event.detail?.achievements || []));
  });
  const observer = new MutationObserver(() => {
    attachCardInteractions();
    void decorateCards();
  });
  observer.observe(grid, { childList: true, subtree: true });
  attachCardInteractions();
  watchForAchievementUnlocks();
  window.addEventListener('peaklog:auth-ready', () => {
    watchForAchievementUnlocks();
    void loadCloudDates();
  });
  if (currentUser()) void loadCloudDates();
})();
