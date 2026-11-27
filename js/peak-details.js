/* Peak detail modal, private user photos and notes. */
(() => {
  'use strict';

  const BUCKET = 'peak-photos';
  const MAX_PHOTOS = 5;
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const MAX_NOTE_CHARS = 2000;
  const LATITUDE_RADIUS = 0.061;
  const LONGITUDE_RADIUS = 0.14;
  const grid = document.getElementById('peaksGrid');
  if (!grid) return;

  let modal;
  let activePeak = null;
  let savedPaths = [];
  let selectedFiles = [];
  let removedPaths = new Set();
  let recordsReady = false;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function buildModal() {
    const shell = node('div', 'modal fade');
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
            <div id="peakDetailsHero" class="peak-details-hero d-none"></div>
            <section class="peak-details-weather mb-3" aria-live="polite"><h3 class="h6 fw-bold">Weather at the summit</h3><div id="peakDetailsWeather" class="small text-muted">Loading current summit forecast…</div></section>
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
    modal = new bootstrap.Modal(shell);

    shell.querySelector('#peakDetailsSignInButton').addEventListener('click', () => {
      modal.hide();
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

  function buildAllTrailsUrl(peak) {
    const url = new URL('https://www.alltrails.com/explore');
    url.searchParams.set('b_br_lat', (peak.lat - LATITUDE_RADIUS).toFixed(12));
    url.searchParams.set('b_br_lng', (peak.lon - LONGITUDE_RADIUS).toFixed(12));
    url.searchParams.set('b_tl_lat', (peak.lat + LATITUDE_RADIUS).toFixed(12));
    url.searchParams.set('b_tl_lng', (peak.lon + LONGITUDE_RADIUS).toFixed(12));
    return url.toString();
  }

  function setFeedback(message, isError = false) {
    const feedback = modal._element.querySelector('#peakDetailsFeedback');
    feedback.textContent = message;
    feedback.className = `small mt-3 ${isError ? 'text-danger' : 'text-success'}`;
  }

  function currentUser() {
    return window.peakLogUser || null;
  }

  async function openPeakDetails(peak) {
    activePeak = peak;
    selectedFiles = [];
    removedPaths = new Set();
    recordsReady = false;
    const element = modal._element;
    element.querySelector('#peakDetailsTitle').textContent = peak.name;
    element.querySelector('#peakDetailsSubtitle').textContent = `${peak.height} m · ${peak.county} · ${peak.difficulty}`;
    element.querySelector('#peakDetailsAllTrails').href = buildAllTrailsUrl(peak);
    element.querySelector('#peakDetailsWeather').textContent = 'Loading current summit forecast…';
    element.querySelector('#peakDetailsFeedback').textContent = '';
    element.querySelector('#peakPhotoInput').value = '';
    element.querySelector('#peakNotesInput').value = '';
    element.querySelector('#peakNotesCount').textContent = '0';
    element.querySelector('#peakPhotoGallery').replaceChildren();
    element.querySelector('#peakDetailsSignIn').classList.toggle('d-none', Boolean(currentUser()));
    element.querySelector('#peakDetailsPrivateNotice').classList.toggle('d-none', !currentUser());
    element.querySelector('#peakDetailsForm').classList.toggle('d-none', !currentUser());
    element.querySelector('#peakDetailsSave').disabled = false;
    updatePhotoCount();
    modal.show();
    void loadWeather(peak);
    if (currentUser()) await loadSavedDetails(peak);
  }

  async function loadWeather(peak) {
    const target = modal._element.querySelector('#peakDetailsWeather');
    try {
      const parameters = new URLSearchParams({ latitude: String(peak.lat), longitude: String(peak.lon), current: 'temperature_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code', timezone: 'Europe/Dublin' });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${parameters}`);
      if (!response.ok) throw new Error('Summit forecast is unavailable right now.');
      const data = await response.json();
      if (!data.current) throw new Error('No current forecast is available.');
      const weather = data.current;
      target.textContent = `${Math.round(weather.temperature_2m)}°C (feels like ${Math.round(weather.apparent_temperature)}°C) · Wind ${Math.round(weather.wind_speed_10m)} km/h · Rain ${weather.precipitation} mm · ${weatherCodeLabel(weather.weather_code)}`;
    } catch (error) {
      target.textContent = error.message || 'Could not load summit forecast.';
    }
  }

  function weatherCodeLabel(code) {
    if (code === 0) return 'Clear';
    if ([1, 2, 3].includes(code)) return 'Partly cloudy';
    if ([45, 48].includes(code)) return 'Fog';
    if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
    if ([95, 96, 99].includes(code)) return 'Thunderstorm';
    return 'Conditions variable';
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
      modal._element.querySelector('#peakNotesInput').value = data?.notes || '';
      modal._element.querySelector('#peakNotesCount').textContent = String((data?.notes || '').length);
      recordsReady = true;
      await renderGallery();
      setFeedback('Your private peak memories are ready.');
    } catch (error) {
      setFeedback(`Could not load peak memories: ${error.message || ''}`, true);
    }
  }

  async function renderGallery() {
    const gallery = modal._element.querySelector('#peakPhotoGallery');
    gallery.replaceChildren();
    const client = window.peakLogSupabase;
    const paths = savedPaths.filter(path => !removedPaths.has(path));
    for (const [index, path] of paths.entries()) {
      const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (error) throw error;
      const item = node('div', `peak-photo-item ${index === 0 ? 'is-cover' : ''}`);
      const image = node('img');
      image.src = data.signedUrl;
      image.alt = `${activePeak.name} memory photo ${index + 1}${index === 0 ? ', card cover' : ''}`;
      item.appendChild(image);
      if (index === 0) item.appendChild(node('span', 'peak-photo-cover-label', 'Card cover'));
      const remove = node('button', 'btn btn-sm btn-danger peak-photo-remove', 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', () => { removedPaths.add(path); void renderGallery(); updatePhotoCount(); });
      item.appendChild(remove);
      gallery.appendChild(item);
    }
    selectedFiles.forEach((file, index) => {
      const item = node('div', `peak-photo-item ${paths.length === 0 && index === 0 ? 'is-cover' : ''}`);
      const image = node('img');
      image.src = URL.createObjectURL(file);
      image.alt = `${activePeak.name} selected photo preview`;
      item.appendChild(image);
      if (paths.length === 0 && index === 0) item.appendChild(node('span', 'peak-photo-cover-label', 'Card cover'));
      const remove = node('button', 'btn btn-sm btn-danger peak-photo-remove', 'Remove');
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
    if (!modal) return;
    const count = photoTotal();
    const input = modal._element.querySelector('#peakPhotoInput');
    modal._element.querySelector('#peakPhotoCount').textContent = `(${count}/${MAX_PHOTOS})`;
    input.disabled = !recordsReady || count >= MAX_PHOTOS;
  }

  function onFilesSelected(event) {
    const incoming = [...event.target.files];
    event.target.value = '';
    const available = MAX_PHOTOS - photoTotal();
    if (incoming.length > available) setFeedback(`You can add only ${available} more photo${available === 1 ? '' : 's'} (maximum ${MAX_PHOTOS}).`, true);
    for (const file of incoming.slice(0, available)) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setFeedback('Use JPG, PNG or WebP image files only.', true); continue; }
      if (file.size > MAX_FILE_BYTES) { setFeedback(`${file.name} is over the 5 MB per-photo limit.`, true); continue; }
      selectedFiles.push(file);
    }
    void renderGallery();
  }

  async function savePeakDetails(event) {
    event.preventDefault();
    const user = currentUser();
    const client = window.peakLogSupabase;
    if (!user || !client || !activePeak || !recordsReady) return;
    const button = modal._element.querySelector('#peakDetailsSave');
    const notes = modal._element.querySelector('#peakNotesInput').value.trim();
    button.disabled = true;
    setFeedback('Saving your private photos and notes…');
    const uploadedPaths = [];
    try {
      const finalPaths = savedPaths.filter(path => !removedPaths.has(path));
      for (const file of selectedFiles) {
        const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(-80);
        const path = `${user.id}/${activePeak.id}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await client.storage.from(BUCKET).upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });
        if (error) throw error;
        uploadedPaths.push(path);
        finalPaths.push(path);
      }
      if (finalPaths.length > MAX_PHOTOS) throw new Error(`Maximum ${MAX_PHOTOS} photos per peak.`);
      const { error } = await client.from('peak_memories').upsert({ user_id: user.id, peak_name: activePeak.name, notes, photo_paths: finalPaths }, { onConflict: 'user_id,peak_name' });
      if (error) throw error;
      const pathsToDelete = savedPaths.filter(path => removedPaths.has(path));
      if (pathsToDelete.length) await client.storage.from(BUCKET).remove(pathsToDelete);
      savedPaths = finalPaths;
      selectedFiles = [];
      removedPaths = new Set();
      await renderGallery();
      await updateCardCover(activePeak, finalPaths[0]);
      setFeedback('Saved. Your notes and photos are private to your account.');
    } catch (error) {
      if (uploadedPaths.length) await client.storage.from(BUCKET).remove(uploadedPaths);
      setFeedback(error.message || 'Could not save your peak memories.', true);
    } finally {
      button.disabled = false;
      updatePhotoCount();
    }
  }

  async function signedPhotoUrl(path) {
    if (!path || !window.peakLogSupabase) return null;
    const { data, error } = await window.peakLogSupabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    return error ? null : data.signedUrl;
  }

  const PROVINCE_THEMES = {
    munster: {
      label: 'Munster',
      className: 'placeholder-munster',
      // Sharp jagged ridges (MacGillycuddy's Reeks)
      svg: `<svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 120 L0 85 L65 42 L115 72 L185 20 L250 68 L315 35 L400 78 L400 120 Z" fill="rgba(255,255,255,0.10)"/>
              <path d="M0 120 L0 95 L90 58 L155 88 L225 45 L300 82 L365 55 L400 85 L400 120 Z" fill="rgba(255,255,255,0.16)"/>
            </svg>`
    },
    leinster: {
      label: 'Leinster',
      className: 'placeholder-leinster',
      // Rolling granite domes (Wicklow Mountains)
      svg: `<svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 120 L0 80 Q95 35 190 70 T400 60 L400 120 Z" fill="rgba(255,255,255,0.10)"/>
              <path d="M0 120 L0 92 Q130 52 240 82 T400 75 L400 120 Z" fill="rgba(255,255,255,0.16)"/>
            </svg>`
    },
    connacht: {
      label: 'Connacht',
      className: 'placeholder-connacht',
      // Conical quartzite peaks (Croagh Patrick / Twelve Bens)
      svg: `<svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 120 L0 90 L95 60 L195 22 L295 65 L400 48 L400 120 Z" fill="rgba(255,255,255,0.10)"/>
              <path d="M0 120 L0 98 L120 72 L225 44 L330 82 L400 68 L400 120 Z" fill="rgba(255,255,255,0.16)"/>
            </svg>`
    },
    ulster: {
      label: 'Ulster',
      className: 'placeholder-ulster',
      // Dramatic coastal cliffs & granite tors (Mournes / Slieve League)
      svg: `<svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 120 L0 45 L85 52 L145 85 L235 32 L290 38 L350 75 L400 65 L400 120 Z" fill="rgba(255,255,255,0.10)"/>
              <path d="M0 120 L0 72 L110 68 L185 92 L275 50 L345 82 L400 78 L400 120 Z" fill="rgba(255,255,255,0.16)"/>
            </svg>`
    }
  };

  function detectProvince(regionText = '') {
    const lower = regionText.toLowerCase();
    if (lower.includes('ulster')) return PROVINCE_THEMES.ulster;
    if (lower.includes('leinster')) return PROVINCE_THEMES.leinster;
    if (lower.includes('connacht') || lower.includes('connaught')) return PROVINCE_THEMES.connacht;
    return PROVINCE_THEMES.munster; // Default fallback
  }

  function createPlaceholderBanner(regionText) {
    const theme = detectProvince(regionText);
    const banner = node('div', `peak-card-placeholder ${theme.className}`);
    banner.innerHTML = `
      <span class="peak-placeholder-tag">${theme.label}</span>
      <span class="peak-placeholder-hint">+ Add summit photo</span>
      ${theme.svg}
    `;
    return banner;
  }

  async function updateCardCover(peak, path) {
    const card = [...grid.querySelectorAll('.peak-card')].find(item => item.querySelector('h3')?.textContent?.trim() === peak.name);
    if (!card) return;
    card.querySelector('.peak-card-cover')?.remove();
    card.querySelector('.peak-card-placeholder')?.remove();

    const regionText = card.querySelector('.pill-region')?.textContent || '';

    if (!path) {
      card.prepend(createPlaceholderBanner(regionText));
      return;
    }

    const url = await signedPhotoUrl(path);
    if (!card.isConnected) return;

    if (!url) {
      card.prepend(createPlaceholderBanner(regionText));
      return;
    }

    const image = node('img', 'peak-card-cover');
    image.src = url;
    image.alt = `${peak.name} personal photo cover`;
    image.loading = 'lazy';
    card.prepend(image);
  }

  function attachCardInteractions() {
    grid.querySelectorAll('.peak-card').forEach(card => {
      if (card.dataset.detailsBound) return;
      card.dataset.detailsBound = 'true';
      const heading = card.querySelector('h3');
      if (!heading) return;

      const regionText = card.querySelector('.pill-region')?.textContent.trim() || 'Ireland';

      // Render default province placeholder immediately if no cover exists yet
      if (!card.querySelector('.peak-card-cover') && !card.querySelector('.peak-card-placeholder')) {
        card.prepend(createPlaceholderBanner(regionText));
      }

      const name = heading.textContent.trim();
      const peak = {
        name,
        height: Number.parseInt(card.querySelector('.peak-elevation')?.textContent, 10),
        county: regionText,
        difficulty: card.querySelector('.text-muted.fw-semibold')?.textContent.replace('Arderin List • ', '') || 'Peak',
        id: Number(card.querySelector('[id^="weather-"]')?.id.replace('weather-', '')) || 0,
        lat: undefined,
        lon: undefined
      };

      card.classList.add('peak-card-clickable');
      card.tabIndex = 0;
      card.setAttribute('aria-label', `Open ${name} peak details, photos and notes`);
      const detailsButton = node('button', 'btn btn-outline-secondary w-100 mt-2 peak-details-open', 'Peak details, photos & notes');
      detailsButton.type = 'button';
      detailsButton.addEventListener('click', () => openPeakDetails(peak));
      card.appendChild(detailsButton);

      card.addEventListener('click', event => {
        if (event.target.closest('button, a, input, select, textarea, label')) return;
        openPeakDetails(peak);
      });
      card.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === card) {
          event.preventDefault();
          openPeakDetails(peak);
        }
      });
    });
  }


  async function hydrateCardCovers() {
    if (!currentUser() || !window.peakLogSupabase) return;
    try {
      const { data, error } = await window.peakLogSupabase.from('peak_memories').select('peak_name, photo_paths');
      if (error) throw error;
      for (const row of data || []) {
        if (row.photo_paths?.[0]) await updateCardCover({ name: row.peak_name }, row.photo_paths[0]);
      }
    } catch (error) {
      console.warn('Could not load private peak card covers:', error.message);
    }
  }



  buildModal();
  const observer = new MutationObserver(attachCardInteractions);
  observer.observe(grid, { childList: true, subtree: true });
  attachCardInteractions();
  window.addEventListener('peaklog:auth-ready', () => void hydrateCardCovers());
  if (window.peakLogUser) void hydrateCardCovers();
})();
