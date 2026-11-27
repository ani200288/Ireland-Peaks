/* ==========================================================================
   PeakLog Ireland
   409 Arderins tracker, weather forecasts, trophies and Leaflet map
   ========================================================================== */

'use strict';

const PEAKS_PER_PAGE = 24;
const WEATHER_CACHE = new Map();
const WEATHER_MAX_FORECAST_DAYS = 7;

let allPeaks = [];
let climbedNames = loadClimbedNames();
let currentPage = 1;
let trophyFilter = 'all';
let leafletMap = null;
let markersLayer = null;

const regionMap = {
  '43A': 'Armagh & South Down',
  '43B': 'Ulster • Mourne Mountains',
  '43C': 'Ulster • Antrim Hills',
  '44B': 'Ulster • Sperrin Mountains',
  '45A': 'Ulster • Inishowen',
  '45B': 'Ulster • North Donegal',
  '45C': 'Ulster • Bluestack Mountains',
  '45D': 'Connacht/Ulster • Dartry & Cuilcagh',
  '45E': 'Connacht • Ox Mountains',
  '46B': 'Connacht • Nephin Beg Range',
  '46C': 'Connacht • Achill & Corraun',
  '47A': 'Connacht • Mweelrea & Croagh Patrick',
  '47B': 'Connacht • Twelve Bens',
  '47C': 'Connacht • Maumturks & Partry',
  '48A': 'Munster • Clare Hills',
  '48C': 'Munster • Derrynasaggart',
  '49A': 'Munster • Brandon Group',
  '49B': 'Munster • Slieve Mish',
  '50A': 'Munster • Iveragh West',
  '50B': 'Munster • Dunkerron Mountains',
  '50C': "Munster • MacGillycuddy's Reeks",
  '51A': 'Munster • Caha & Beara',
  '52A': 'Munster • Mangerton & Shehy',
  '52B': 'Munster • West Cork Hills',
  '53A': 'Munster • Galtee Mountains',
  '53B': 'Munster • Silvermines & Keeper',
  '54A': 'Munster • Comeragh & Knockmealdown',
  '54B': 'Leinster • Blackstairs & Slievenamon',
  '55A': 'Leinster • South Wicklow',
  '55B': 'Leinster • North Wicklow & Dublin',
  '56A': 'Leinster • Cooley Mountains',
  '56B': 'Leinster • Slieve Bloom Mountains'
};

const peaksReady = loadArderinsCSV();

/* ==========================================================================
   Initialization
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  setDefaultDate();

  try {
    await peaksReady;
  } catch (error) {
    console.error(error);
    const grid = document.getElementById('peaksGrid');
    if (grid) grid.textContent = 'Could not load the peak data. Please refresh the page.';
    return;
  }

  populateCountyDropdowns();
  setupControls();
  renderDashboard();
  if (document.getElementById('irelandMap')) initIrelandMap();
});

/* ==========================================================================
   State and storage
   ========================================================================== */

function loadClimbedNames() {
  try {
    const saved = JSON.parse(localStorage.getItem('irelandClimbedNames') || '[]');
    return new Set(Array.isArray(saved) ? saved : []);
  } catch (error) {
    console.warn('Could not read saved climbed peaks.', error);
    return new Set();
  }
}

function saveClimbedNames() {
  localStorage.setItem('irelandClimbedNames', JSON.stringify([...climbedNames]));
}

function setDefaultDate() {
  const dateInput = document.getElementById('freeDateInput');
  if (!dateInput) return;
  const today = new Date();
  const latest = new Date(today);
  latest.setDate(latest.getDate() + WEATHER_MAX_FORECAST_DAYS);
  dateInput.value = formatLocalDate(today);
  dateInput.min = formatLocalDate(today);
  dateInput.max = formatLocalDate(latest);
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/* ==========================================================================
   Peak data
   ========================================================================== */

async function loadArderinsCSV() {
  const response = await fetch('arderins.csv');
  if (!response.ok) throw new Error(`Could not load arderins.csv (${response.status})`);

  const text = await response.text();
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('arderins.csv contains no peak records');

  const headers = splitCSVRow(lines[0]).map(header => header.toLowerCase().trim());
  const index = {
    name: headers.indexOf('hillname'),
    height: headers.indexOf('metres'),
    region: headers.indexOf('region'),
    drop: headers.indexOf('drop'),
    feature: headers.indexOf('feature'),
    class: headers.indexOf('classification'),
    lat: headers.indexOf('latitude'),
    lon: headers.indexOf('longitude')
  };

  allPeaks = lines.slice(1).map((line, indexValue) => {
    const columns = splitCSVRow(line);
    const rawRegion = (columns[index.region] || '').trim();
    const height = Math.round(parseFloat(columns[index.height]) || 500);
    const exactHeight = parseFloat(columns[index.height]) || 500;
    const drop = Math.round(parseFloat(columns[index.drop]) || 30);
    const feature = (columns[index.feature] || '').trim();
    const classification = (columns[index.class] || '').trim();
    const isCountyHighPoint = classification.split(',').map(value => value.trim()).includes('CoH');

    let difficulty = 'Moderate';
    if (height >= 850) difficulty = 'Hard';
    else if (height >= 650) difficulty = 'Moderate–Hard';

    const hasFeature = feature && feature !== 'not recorded' && feature !== 'no feature';
    const note = hasFeature
      ? `Prominence ${drop}m • Summit marker: ${feature}.`
      : `Prominence ${drop}m • 500m+ Official Arderin summit.`;

    const lat = parseFloat(columns[index.lat]);
    const lon = parseFloat(columns[index.lon]);

    return {
      id: indexValue + 1,
      name: (columns[index.name] || `Summit ${indexValue + 1}`).trim(),
      height,
      exactHeight,
      isCountyHighPoint,
      difficulty,
      note,
      county: regionMap[rawRegion] || rawRegion || 'Ireland',
      lat,
      lon
    };
  }).filter(peak => Number.isFinite(peak.lat) && Number.isFinite(peak.lon));
}

function splitCSVRow(row) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"') inQuotes = !inQuotes;
    else if (character === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else current += character;
  }
  result.push(current.trim());
  return result;
}

function populateCountyDropdowns() {
  const ranges = [...new Set(allPeaks.map(peak => peak.county))].sort();
  ['countyFilter', 'recommenderCounty', 'mapRangeFilter'].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    ranges.forEach(range => {
      const option = document.createElement('option');
      option.value = range;
      option.textContent = range;
      select.appendChild(option);
    });
  });
}

/* ==========================================================================
   Dashboard
   ========================================================================== */

function renderDashboard() {
  const searchTerm = (document.getElementById('peakSearch')?.value || '').trim().toLowerCase();
  const countyFilter = document.getElementById('countyFilter')?.value || 'all';
  const statusFilter = document.getElementById('statusFilter')?.value || 'all';

  const filteredPeaks = allPeaks.filter(peak => {
    const matchesSearch = peak.name.toLowerCase().includes(searchTerm) || peak.county.toLowerCase().includes(searchTerm);
    const matchesCounty = countyFilter === 'all' || peak.county === countyFilter;
    const isClimbed = climbedNames.has(peak.name);
    if (statusFilter === 'climbed') return matchesSearch && matchesCounty && isClimbed;
    if (statusFilter === 'unclimbed') return matchesSearch && matchesCounty && !isClimbed;
    return matchesSearch && matchesCounty;
  });

  const totalPages = Math.max(1, Math.ceil(filteredPeaks.length / PEAKS_PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PEAKS_PER_PAGE;
  renderPeakCards(filteredPeaks.slice(start, start + PEAKS_PER_PAGE));

  const pageIndicator = document.getElementById('pageIndicator');
  const previousButton = document.getElementById('prevPageBtn');
  const nextButton = document.getElementById('nextPageBtn');
  if (pageIndicator) pageIndicator.textContent = `Page ${currentPage} of ${totalPages} (${filteredPeaks.length} peaks)`;
  if (previousButton) previousButton.disabled = currentPage === 1;
  if (nextButton) nextButton.disabled = currentPage === totalPages;
  updateCounterAndTrophies();
}

function renderPeakCards(peaks) {
  const container = document.getElementById('peaksGrid');
  if (!container) return;
  const fragment = document.createDocumentFragment();

  peaks.forEach(peak => {
    const isClimbed = climbedNames.has(peak.name);
    const column = document.createElement('div');
    column.className = 'col-12 col-md-6 col-lg-4';

    const card = document.createElement('div');
    card.className = `peak-card ${isClimbed ? 'is-climbed' : ''}`;

    const information = document.createElement('div');
    const headingRow = document.createElement('div');
    headingRow.className = 'd-flex justify-content-between align-items-center mb-2';

    const region = document.createElement('span');
    region.className = 'pill-region';
    region.textContent = peak.county;

    const elevation = document.createElement('span');
    elevation.className = 'peak-elevation';
    elevation.textContent = `${peak.height}m`;
    headingRow.append(region, elevation);

    const heading = document.createElement('h3');
    heading.className = 'h4 fw-bold mb-1';
    heading.textContent = peak.name;

    const difficulty = document.createElement('p');
    difficulty.className = 'small text-muted fw-semibold mb-2';
    difficulty.textContent = `Arderin List • ${peak.difficulty}`;

    const note = document.createElement('p');
    note.className = 'small text-secondary mb-2';
    note.textContent = peak.note;
    information.append(headingRow, heading, difficulty, note);

    const actions = document.createElement('div');
    const weather = document.createElement('div');
    weather.id = `weather-${peak.id}`;
    weather.className = 'weather-strip d-flex justify-content-between align-items-center';
    const weatherPrompt = document.createElement('span');
    weatherPrompt.className = 'text-muted';
    weatherPrompt.textContent = 'Click forecast for live summit weather';
    weather.appendChild(weatherPrompt);

    const buttonRow = document.createElement('div');
    buttonRow.className = 'row g-2';

    const climbedColumn = document.createElement('div');
    climbedColumn.className = 'col-6';
    const climbedButton = document.createElement('button');
    climbedButton.type = 'button';
    climbedButton.className = `btn btn-mark-climbed w-100 ${isClimbed ? 'climbed-active' : ''}`;
    climbedButton.textContent = isClimbed ? '✓ Climbed' : 'Mark Climbed';
    climbedButton.addEventListener('click', () => toggleClimbed(peak.name));
    climbedColumn.appendChild(climbedButton);

    const weatherColumn = document.createElement('div');
    weatherColumn.className = 'col-6';
    const weatherButton = document.createElement('button');
    weatherButton.type = 'button';
    weatherButton.className = 'btn btn-alpine w-100';
    weatherButton.textContent = 'Current Forecast';
    weatherButton.addEventListener('click', () => fetchSummitWeather(peak.id, peak.lat, peak.lon));
    weatherColumn.appendChild(weatherButton);

    buttonRow.append(climbedColumn, weatherColumn);
    actions.append(weather, buttonRow);
    card.append(information, actions);
    column.appendChild(card);
    fragment.appendChild(column);
  });

  container.replaceChildren(fragment);
}

function toggleClimbed(peakName) {
  const willBeClimbed = !climbedNames.has(peakName);

  if (willBeClimbed) climbedNames.add(peakName);
  else climbedNames.delete(peakName);

  saveClimbedNames();

  // Update the existing card and controls in place. Do not replace the card DOM,
  // so a private photo cover that peak-details.js already attached remains visible.
  const grid = document.getElementById('peaksGrid');
  grid?.querySelectorAll('.peak-card').forEach(card => {
    const name = card.querySelector('h3')?.textContent?.trim();
    if (name !== peakName) return;
    card.classList.toggle('is-climbed', willBeClimbed);
    const button = card.querySelector('.btn-mark-climbed');
    if (button) {
      button.classList.toggle('climbed-active', willBeClimbed);
      button.textContent = willBeClimbed ? '✓ Climbed' : 'Mark Climbed';
    }
  });

  // A filter may need to remove a card after the status changes.
  const statusFilter = document.getElementById('statusFilter')?.value || 'all';
  if (statusFilter !== 'all') {
    renderDashboard();
  } else {
    updateCounterAndTrophies();
  }

  if (leafletMap) renderMapMarkers(false);
}

function setTrophyFilter(filter) {
  if (!['all', 'unlocked', 'locked'].includes(filter)) return;
  trophyFilter = filter;
  updateCounterAndTrophies();
}

/* ==========================================================================
   Trophies
   ========================================================================== */

function updateCounterAndTrophies() {
  const counter = document.getElementById('climbedCounter');
  if (counter) counter.textContent = `${climbedNames.size} / ${allPeaks.length} Arderins Climbed`;

  const has = name => [...climbedNames].some(climbed => climbed.toLowerCase().includes(name.toLowerCase()));
  const count = climbedNames.size;
  const sortedByHeight = [...allPeaks].sort((first, second) => second.exactHeight - first.exactHeight);
  const top10Names = sortedByHeight.slice(0, 10).map(peak => peak.name);
  const top20Names = sortedByHeight.slice(0, 20).map(peak => peak.name);
  const countyHighPoints = allPeaks.filter(peak => peak.isCountyHighPoint);
  const climbedCountyHighPoints = countyHighPoints.filter(peak => climbedNames.has(peak.name)).length;

  const trophies = [
    { icon: '🥾', title: 'First Summit', desc: 'Log your first 500m+ Irish mountain.', unlocked: count >= 1 },
    { icon: '👑', title: 'King of Ireland', desc: "Summit Carrauntoohil, Ireland's highest peak.", unlocked: has('Carrauntoohil') },
    { icon: '🏔️', title: 'The 1,000m Club', desc: 'Climb Carrauntoohil, Beenkeragh and Caher.', unlocked: has('Carrauntoohil') && has('Beenkeragh') && has('Caher') },
    { icon: '🏆', title: 'Four Provincial Peaks', desc: 'Conquer Carrauntoohil, Lugnaquillia, Slieve Donard and Mweelrea.', unlocked: has('Carrauntoohil') && has('Lugnaquillia') && has('Slieve Donard') && has('Mweelrea') },
    { icon: '🔟', title: 'Top 10 in Ireland', desc: 'Summit all 10 highest peaks in Ireland.', unlocked: top10Names.length === 10 && top10Names.every(name => climbedNames.has(name)) },
    { icon: '🥇', title: 'Top 20 in Ireland', desc: 'Summit all 20 highest peaks in Ireland.', unlocked: top20Names.length === 20 && top20Names.every(name => climbedNames.has(name)) },
    { icon: '📍', title: 'First County High Point', desc: 'Summit the highest peak of any Irish county.', unlocked: climbedCountyHighPoints >= 1 },
    { icon: '🟢', title: 'Leinster County Tops', desc: 'Conquer the Leinster county high points.', unlocked: has('Lugnaquillia') && has('Mount Leinster') && has('Kippure') && has('Arderin') && has('Croghan Mountain') },
    { icon: '🔵', title: 'Munster County Tops', desc: 'Conquer the Munster county high points.', unlocked: has('Carrauntoohil') && has('Galtymore') && has('Knockboy') && has('Knockmealdown') && has('Moylussa') },
    { icon: '🟡', title: 'Connacht County Tops', desc: 'Conquer the Connacht county high points.', unlocked: has('Mweelrea') && has('Benbaun') && has('Truskmore') && has('Slieve Anierin') },
    { icon: '🔴', title: 'Ulster County Tops', desc: 'Conquer the Ulster county high points.', unlocked: has('Slieve Donard') && has('Errigal') && has('Sawel') && has('Cuilcagh') && has('Trostan') && has('Slieve Gullion') },
    { icon: '🇮🇪', title: 'All-Ireland County Tops', desc: 'Conquer every 500m+ County High Point in Ireland.', unlocked: countyHighPoints.length > 0 && climbedCountyHighPoints === countyHighPoints.length },
    { icon: '🏙️', title: 'Dublin Mountains Duo', desc: 'Climb Kippure and Two Rock Mountain.', unlocked: has('Kippure') && has('Two Rock') },
    { icon: '🌲', title: 'Wicklow Wanderer', desc: 'Climb Lugnaquillia, Tonelagee and Djouce.', unlocked: has('Lugnaquillia') && has('Tonelagee') && has('Djouce') },
    { icon: '🧱', title: 'Mourne Wall Challenge', desc: 'Complete the Mourne Wall route challenge.', unlocked: has('Slieve Donard') && has('Slieve Commedagh') && has('Slieve Bearnagh') && has('Slieve Meelmore') && has('Slieve Meelbeg') && has('Slieve Binnian') && has('Slieve Muck') },
    { icon: '⛪', title: 'Holy Mountain Pilgrim', desc: 'Reach the summit of Croagh Patrick.', unlocked: has('Croagh Patrick') },
    { icon: '⛰️', title: '5 Arderins Club', desc: 'Reach 5 summits on the Arderins list.', unlocked: count >= 5 },
    { icon: '🔟', title: '10 Peaks Explorer', desc: 'Log 10 Irish mountains.', unlocked: count >= 10 },
    { icon: '🥾', title: '20 Peaks Trailblazer', desc: 'Log 20 Irish mountains.', unlocked: count >= 20 },
    { icon: '🧭', title: '30 Peaks Navigator', desc: 'Log 30 Irish mountains.', unlocked: count >= 30 },
    { icon: '⭐', title: '50 Peaks Half-Century', desc: 'Log 50 Irish mountains.', unlocked: count >= 50 },
    { icon: '💯', title: '100 Peaks Centurion', desc: 'Log 100 Irish mountains.', unlocked: count >= 100 },
    { icon: '🌗', title: '205 Halfway Hero', desc: 'Pass the halfway mark of the Arderins list.', unlocked: count >= 205 },
    { icon: '🔥', title: '300 Peaks Legend', desc: 'Log 300 Irish mountains.', unlocked: count >= 300 },
    { icon: '🏅', title: '409 Arderins Complete', desc: 'Climb every peak on the 500m+ Arderins list!', unlocked: allPeaks.length > 0 && count >= allPeaks.length }
  ];

  const unlockedCount = trophies.filter(trophy => trophy.unlocked).length;
  const visibleTrophies = trophies.filter(trophy => trophyFilter === 'unlocked' ? trophy.unlocked : trophyFilter === 'locked' ? !trophy.unlocked : true);
  const cabinet = document.getElementById('trophyCabinet');
  if (!cabinet) return;
  cabinet.replaceChildren();

  const summaryColumn = document.createElement('div');
  summaryColumn.className = 'col-12 d-flex flex-wrap justify-content-between align-items-center gap-2 mb-1';
  const summary = document.createElement('span');
  summary.className = 'small fw-bold text-success';
  summary.textContent = `${unlockedCount} of ${trophies.length} Trophies Unlocked`;

  const buttonGroup = document.createElement('div');
  buttonGroup.className = 'btn-group btn-group-sm';
  buttonGroup.setAttribute('role', 'group');
  [['all', `All (${trophies.length})`], ['unlocked', `Unlocked (${unlockedCount})`], ['locked', `Locked (${trophies.length - unlockedCount})`]].forEach(([filter, text]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn ${trophyFilter === filter ? 'btn-alpine' : 'btn-outline-secondary'}`;
    button.textContent = text;
    button.addEventListener('click', () => setTrophyFilter(filter));
    buttonGroup.appendChild(button);
  });
  summaryColumn.append(summary, buttonGroup);
  cabinet.appendChild(summaryColumn);

  visibleTrophies.forEach(trophy => {
    const column = document.createElement('div');
    column.className = 'col-12 col-sm-6 col-md-4 col-lg-3';
    const card = document.createElement('div');
    card.className = `trophy-card ${trophy.unlocked ? 'unlocked' : 'locked'}`;

    const information = document.createElement('div');
    const icon = document.createElement('div');
    icon.className = 'trophy-icon';
    icon.textContent = trophy.icon;
    const title = document.createElement('h3');
    title.className = 'h6 fw-bold mb-1';
    title.textContent = trophy.title;
    const description = document.createElement('p');
    description.className = 'small text-muted mb-3';
    description.textContent = trophy.desc;
    information.append(icon, title, description);

    const status = document.createElement('div');
    const badge = document.createElement('span');
    badge.className = trophy.unlocked ? 'badge-unlocked' : 'badge-locked';
    badge.textContent = trophy.unlocked ? 'Unlocked' : 'Locked';
    status.appendChild(badge);
    card.append(information, status);
    column.appendChild(card);
    cabinet.appendChild(column);
  });
}

/* ==========================================================================
   Weather
   ========================================================================== */

async function getSummitWeather(lat, lon) {
  const cacheKey = `${lat},${lon}`;
  if (WEATHER_CACHE.has(cacheKey)) return WEATHER_CACHE.get(cacheKey);
  const parameters = new URLSearchParams({ latitude: String(lat), longitude: String(lon), daily: 'temperature_2m_max,precipitation_sum,windspeed_10m_max', timezone: 'Europe/Dublin' });

  const request = (async () => {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${parameters}`);
    if (!response.ok) throw new Error(`Weather API returned ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.reason || 'Weather API error');
    if (!data.daily || !Array.isArray(data.daily.time) || !Array.isArray(data.daily.temperature_2m_max) || !Array.isArray(data.daily.precipitation_sum) || !Array.isArray(data.daily.windspeed_10m_max)) throw new Error('Weather response is incomplete');
    return data;
  })();

  WEATHER_CACHE.set(cacheKey, request);
  try { return await request; }
  catch (error) { WEATHER_CACHE.delete(cacheKey); throw error; }
}

async function fetchSummitWeather(id, lat, lon) {
  const box = document.getElementById(`weather-${id}`);
  if (!box) return;
  box.replaceChildren();
  const loading = document.createElement('span');
  loading.className = 'text-muted';
  loading.textContent = 'Loading summit forecast...';
  box.appendChild(loading);

  try {
    const data = await getSummitWeather(lat, lon);
    const temperature = data.daily.temperature_2m_max[0];
    const rain = data.daily.precipitation_sum[0];
    const wind = data.daily.windspeed_10m_max[0];
    if (temperature == null || rain == null || wind == null) throw new Error('No forecast data is available');

    const status = rain > 1.5 ? 'Wet Conditions' : wind > 35 ? 'Windy Ridge' : 'Clear Hike';
    box.replaceChildren();
    const summary = document.createElement('span');
    summary.append(document.createElement('strong'));
    summary.firstElementChild.textContent = 'Now: ';
    summary.append(`${Math.round(temperature)}°C • Wind ${Math.round(wind)} km/h`);
    const condition = document.createElement('span');
    condition.className = 'fw-semibold text-secondary';
    condition.textContent = status;
    box.append(summary, condition);
  } catch (error) {
    console.error(error);
    box.replaceChildren();
    const unavailable = document.createElement('span');
    unavailable.className = 'text-danger';
    unavailable.textContent = 'Weather unavailable';
    box.appendChild(unavailable);
  }
}

async function suggestBestUnclimbedPeak() {
  const dateInput = document.getElementById('freeDateInput');
  const countySelect = document.getElementById('recommenderCounty');
  const resultBox = document.getElementById('recommenderResult');
  if (!dateInput || !countySelect || !resultBox) return;

  const dateVal = dateInput.value;
  const countyVal = countySelect.value;
  if (!dateVal) { resultBox.classList.remove('d-none'); resultBox.textContent = 'Please select a date.'; return; }

  const today = formatLocalDate(new Date());
  const latest = new Date(); latest.setDate(latest.getDate() + WEATHER_MAX_FORECAST_DAYS);
  if (dateVal < today || dateVal > formatLocalDate(latest)) { resultBox.classList.remove('d-none'); resultBox.textContent = 'Please select a date within the next 7 days.'; return; }

  resultBox.classList.remove('d-none');
  resultBox.textContent = 'Scanning unclimbed peaks and checking summit weather...';
  let candidates = allPeaks.filter(peak => !climbedNames.has(peak.name));
  if (countyVal !== 'all') candidates = candidates.filter(peak => peak.county === countyVal);
  if (candidates.length === 0) { resultBox.textContent = 'You have climbed every peak in this selection!'; return; }

  const sample = [...candidates].sort(() => Math.random() - 0.5).slice(0, 6);
  let bestPeak = null;
  let bestScore = Infinity;
  await Promise.all(sample.map(async peak => {
    try {
      const data = await getSummitWeather(peak.lat, peak.lon);
      const dayIndex = data.daily.time.indexOf(dateVal);
      if (dayIndex === -1) return;
      const rain = data.daily.precipitation_sum[dayIndex];
      const wind = data.daily.windspeed_10m_max[dayIndex];
      const temperature = data.daily.temperature_2m_max[dayIndex];
      if (rain == null || wind == null || temperature == null) return;
      const score = rain * 2 + wind * 1.5 - temperature * 0.5;
      if (score < bestScore) bestPeak = { ...peak, rain, wind, temp: temperature };
    } catch (error) { console.warn(`Could not retrieve weather for ${peak.name}`, error); }
  }));

  if (!bestPeak) { resultBox.textContent = 'Could not find weather data for the selected date.'; return; }
  resultBox.replaceChildren();
  const resultHeading = document.createElement('strong'); resultHeading.textContent = 'Recommended Peak: ';
  const peakText = document.createTextNode(`${bestPeak.name} (${bestPeak.height}m — ${bestPeak.county})`);
  const breakElement = document.createElement('br');
  const forecastHeading = document.createElement('strong'); forecastHeading.textContent = `Forecast for ${dateVal}: `;
  const forecastText = document.createTextNode(`${Math.round(bestPeak.temp)}°C, Wind ${Math.round(bestPeak.wind)} km/h, Rain ${bestPeak.rain}mm`);
  resultBox.append(resultHeading, peakText, breakElement, forecastHeading, forecastText);
}

/* ==========================================================================
   Controls
   ========================================================================== */

function setupControls() {
  document.getElementById('peakSearch')?.addEventListener('input', () => { currentPage = 1; renderDashboard(); });
  document.getElementById('countyFilter')?.addEventListener('change', () => { currentPage = 1; renderDashboard(); });
  document.getElementById('statusFilter')?.addEventListener('change', () => { currentPage = 1; renderDashboard(); });
  document.getElementById('prevPageBtn')?.addEventListener('click', () => { if (currentPage > 1) { currentPage -= 1; renderDashboard(); } });
  document.getElementById('nextPageBtn')?.addEventListener('click', () => { currentPage += 1; renderDashboard(); });
  document.getElementById('recommendBtn')?.addEventListener('click', suggestBestUnclimbedPeak);
  document.getElementById('mapRangeFilter')?.addEventListener('change', () => renderMapMarkers(true));
  document.getElementById('mapStatusFilter')?.addEventListener('change', () => renderMapMarkers(false));
}

/* ==========================================================================
   Leaflet map
   ========================================================================== */

function initIrelandMap() {
  const mapElement = document.getElementById('irelandMap');
  if (!mapElement || typeof L === 'undefined') return;
  leafletMap = L.map(mapElement).setView([53.42, -7.95], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; OpenStreetMap contributors' }).addTo(leafletMap);
  markersLayer = L.layerGroup().addTo(leafletMap);
  renderMapMarkers(false);
}

function renderMapMarkers(zoomToBounds) {
  if (!leafletMap || !markersLayer) return;
  markersLayer.clearLayers();
  const rangeValue = document.getElementById('mapRangeFilter')?.value || 'all';
  const statusValue = document.getElementById('mapStatusFilter')?.value || 'all';
  const bounds = [];

  allPeaks.forEach(peak => {
    const isClimbed = climbedNames.has(peak.name);
    if (rangeValue !== 'all' && peak.county !== rangeValue) return;
    if (statusValue === 'climbed' && !isClimbed) return;
    if (statusValue === 'unclimbed' && isClimbed) return;

    const markerIcon = L.divIcon({
      className: 'peak-marker-icon',
      html: `<span class="peak-marker ${isClimbed ? 'peak-marker--climbed' : 'peak-marker--unclimbed'}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 19 9.5 8l3.2 5 2-3L21 19H3Z"></path><path d="m7.7 11 1.8 2.8 1.5-2.2"></path></svg></span>`,
      iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -19]
    });

    const marker = L.marker([peak.lat, peak.lon], { icon: markerIcon, title: `${peak.name} (${peak.height}m)`, alt: `${peak.name}, ${peak.height} metres${isClimbed ? ', climbed' : ', not climbed'}` });
    const popup = document.createElement('div'); popup.style.minWidth = '170px';
    const name = document.createElement('strong'); name.textContent = peak.name;
    popup.append(name, ` (${peak.height}m)`, document.createElement('br'));
    const county = document.createElement('span'); county.style.fontSize = '12px'; county.style.color = '#475569'; county.textContent = peak.county;
    popup.append(county, document.createElement('br'));

    const climbedButton = document.createElement('button');
    climbedButton.type = 'button';
    climbedButton.className = `btn btn-sm mt-2 w-100 ${isClimbed ? 'btn-success' : 'btn-outline-success'}`;
    climbedButton.textContent = isClimbed ? '✓ Climbed' : 'Mark Climbed';
    climbedButton.addEventListener('click', () => { toggleClimbed(peak.name); if (leafletMap) leafletMap.closePopup(); });
    popup.appendChild(climbedButton);
    marker.bindPopup(popup); marker.addTo(markersLayer); bounds.push([peak.lat, peak.lon]);
  });

  if (zoomToBounds && bounds.length > 0) leafletMap.fitBounds(bounds, { padding: [20, 20], maxZoom: 11 });
}

/* ==========================================================================
   Global compatibility
   ========================================================================== */

window.toggleClimbed = toggleClimbed;
window.setTrophyFilter = setTrophyFilter;
window.toggleClimbedFromMap = toggleClimbedFromMap;

function toggleClimbedFromMap(peakName) {
  toggleClimbed(peakName);
}
