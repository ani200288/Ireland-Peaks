/* ==========================================================================
   PeakLog Ireland - 409 Arderins Tracker (Full Trophy System + Open-Meteo)
   ========================================================================== */

let allPeaks = [];
let climbedNames = JSON.parse(localStorage.getItem('irelandClimbedNames')) || [];
let currentPage = 1;
let trophyFilter = 'all';
const PEAKS_PER_PAGE = 24;

const regionMap = {
  "43A": "Armagh & South Down",
  "43B": "Ulster • Mourne Mountains",
  "43C": "Ulster • Antrim Hills",
  "44B": "Ulster • Sperrin Mountains",
  "45A": "Ulster • Inishowen",
  "45B": "Ulster • North Donegal",
  "45C": "Ulster • Bluestack Mountains",
  "45D": "Connacht/Ulster • Dartry & Cuilcagh",
  "45E": "Connacht • Ox Mountains",
  "46B": "Connacht • Nephin Beg Range",
  "46C": "Connacht • Achill & Corraun",
  "47A": "Connacht • Mweelrea & Croagh Patrick",
  "47B": "Connacht • Twelve Bens",
  "47C": "Connacht • Maumturks & Partry",
  "48A": "Munster • Clare Hills",
  "48C": "Munster • Derrynasaggart",
  "49A": "Munster • Brandon Group",
  "49B": "Munster • Slieve Mish",
  "50A": "Munster • Iveragh West",
  "50B": "Munster • Dunkerron Mountains",
  "50C": "Munster • MacGillycuddy's Reeks",
  "51A": "Munster • Caha & Beara",
  "52A": "Munster • Mangerton & Shehy",
  "52B": "Munster • West Cork Hills",
  "53A": "Munster • Galtee Mountains",
  "53B": "Munster • Silvermines & Keeper",
  "54A": "Munster • Comeragh & Knockmealdown",
  "54B": "Leinster • Blackstairs & Slievenamon",
  "55A": "Leinster • South Wicklow",
  "55B": "Leinster • North Wicklow & Dublin",
  "56A": "Leinster • Cooley Mountains",
  "56B": "Leinster • Slieve Bloom Mountains"
};

document.addEventListener('DOMContentLoaded', async function () {
  setDefaultDate();
  await loadArderinsCSV();
  populateCountyDropdowns();
  setupControls();
  renderDashboard();
});

function setDefaultDate() {
  const dateInput = document.getElementById('freeDateInput');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    dateInput.min = today;
  }
}

async function loadArderinsCSV() {
  try {
    const response = await fetch('arderins.csv');
    if (!response.ok) throw new Error('Could not load arderins.csv');
    const text = await response.text();
    const lines = text.trim().split(/\r?\n/);

    const headers = splitCSVRow(lines[0]).map(h => h.toLowerCase().trim());
    const nameIdx = headers.indexOf('hillname');
    const heightIdx = headers.indexOf('metres');
    const regionIdx = headers.indexOf('region');
    const dropIdx = headers.indexOf('drop');
    const featureIdx = headers.indexOf('feature');
    const classIdx = headers.indexOf('classification');
    const latIdx = headers.indexOf('latitude');
    const lonIdx = headers.indexOf('longitude');

    allPeaks = lines.slice(1).map((line, idx) => {
      const cols = splitCSVRow(line);
      const rawRegion = (cols[regionIdx] || '').trim();
      const height = Math.round(parseFloat(cols[heightIdx]) || 500);
      const exactHeight = parseFloat(cols[heightIdx]) || 500;
      const drop = Math.round(parseFloat(cols[dropIdx]) || 30);
      const feature = (cols[featureIdx] || '').trim();
      const classification = (cols[classIdx] || '').trim();
      const isCountyHighPoint = classification.split(',').map(c => c.trim()).includes('CoH');

      const difficulty = height >= 850 ? 'Hard' : (height >= 650 ? 'Moderate–Hard' : 'Moderate');
      const note = feature && feature !== 'not recorded' && feature !== 'no feature'
        ? `Prominence ${drop}m • Summit marker: ${feature}.`
        : `Prominence ${drop}m • 500m+ Official Arderin summit.`;

      return {
        id: idx + 1,
        name: cols[nameIdx] || `Summit ${idx + 1}`,
        height,
        exactHeight,
        isCountyHighPoint,
        difficulty,
        note,
        county: regionMap[rawRegion] || rawRegion || 'Ireland',
        lat: parseFloat(cols[latIdx]),
        lon: parseFloat(cols[lonIdx])
      };
    }).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
  } catch (err) {
    console.error(err);
  }
}

function splitCSVRow(row) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function populateCountyDropdowns() {
  const ranges = [...new Set(allPeaks.map(p => p.county))].sort();
  ['countyFilter', 'recommenderCounty'].forEach(selectId => {
    const select = document.getElementById(selectId);
    if (!select) return;
    ranges.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      select.appendChild(opt);
    });
  });
}

function renderDashboard() {
  const searchTerm = (document.getElementById('peakSearch')?.value || '').toLowerCase();
  const countyFilter = document.getElementById('countyFilter')?.value || 'all';
  const statusFilter = document.getElementById('statusFilter')?.value || 'all';

  const filtered = allPeaks.filter(peak => {
    const matchesSearch = peak.name.toLowerCase().includes(searchTerm) || peak.county.toLowerCase().includes(searchTerm);
    const matchesCounty = countyFilter === 'all' || peak.county === countyFilter;
    const isClimbed = climbedNames.includes(peak.name);
    if (statusFilter === 'climbed') return matchesSearch && matchesCounty && isClimbed;
    if (statusFilter === 'unclimbed') return matchesSearch && matchesCounty && !isClimbed;
    return matchesSearch && matchesCounty;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PEAKS_PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PEAKS_PER_PAGE;
  const pagePeaks = filtered.slice(start, start + PEAKS_PER_PAGE);

  const container = document.getElementById('peaksGrid');
  if (container) {
    container.innerHTML = pagePeaks.map(peak => {
      const isClimbed = climbedNames.includes(peak.name);
      return `
        <div class="col-12 col-md-6 col-lg-4">
          <div class="peak-card ${isClimbed ? 'is-climbed' : ''}">
            <div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="pill-region">${peak.county}</span>
                <span class="peak-elevation">${peak.height}m</span>
              </div>
              <h3 class="h4 fw-bold mb-1">${peak.name}</h3>
              <p class="small text-muted fw-semibold mb-2">Arderin List &bull; ${peak.difficulty}</p>
              <p class="small text-secondary mb-2">${peak.note}</p>
            </div>

            <div>
              <div id="weather-${peak.id}" class="weather-strip d-flex justify-content-between align-items-center">
                <span class="text-muted">Click forecast for live summit weather</span>
              </div>

              <div class="row g-2">
                <div class="col-6">
                  <button type="button" class="btn btn-mark-climbed w-100 ${isClimbed ? 'climbed-active' : ''}" onclick="toggleClimbed('${peak.name.replace(/'/g, "\\'")}')">
                    ${isClimbed ? '✓ Climbed' : 'Mark Climbed'}
                  </button>
                </div>
                <div class="col-6">
                  <button type="button" class="btn btn-alpine w-100" onclick="fetchSummitWeather(${peak.id}, ${peak.lat}, ${peak.lon})">
                    7-Day Forecast
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const pageInd = document.getElementById('pageIndicator');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    if (pageInd) pageInd.textContent = `Page ${currentPage} of ${totalPages} (${filtered.length} peaks)`;
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages;
  }

  updateCounterAndTrophies();


  document.getElementById('pageIndicator').textContent = `Page ${currentPage} of ${totalPages} (${filtered.length} peaks)`;
  document.getElementById('prevPageBtn').disabled = currentPage === 1;
  document.getElementById('nextPageBtn').disabled = currentPage === totalPages;

  updateCounterAndTrophies();
}

function toggleClimbed(peakName) {
  if (climbedNames.includes(peakName)) {
    climbedNames = climbedNames.filter(n => n !== peakName);
  } else {
    climbedNames.push(peakName);
  }
  localStorage.setItem('irelandClimbedNames', JSON.stringify(climbedNames));
  renderDashboard();
}

function setTrophyFilter(filter) {
  trophyFilter = filter;
  updateCounterAndTrophies();
}

function updateCounterAndTrophies() {
  document.getElementById('climbedCounter').textContent = `${climbedNames.length} / ${allPeaks.length} Arderins Climbed`;

  const has = name => climbedNames.some(c => c.toLowerCase().includes(name.toLowerCase()));
  const count = climbedNames.length;

  // Sort peaks by exact height for Top 10 / Top 20 Ireland checks
  const sortedByHeight = [...allPeaks].sort((a, b) => b.exactHeight - a.exactHeight);
  const top10Names = sortedByHeight.slice(0, 10).map(p => p.name);
  const top20Names = sortedByHeight.slice(0, 20).map(p => p.name);
  const countyHighPoints = allPeaks.filter(p => p.isCountyHighPoint);
  const climbedCoHCount = countyHighPoints.filter(p => climbedNames.includes(p.name)).length;

  const trophies = [
    // Core & Provincial Challenges
    { icon: '🥾', title: 'First Summit', desc: 'Log your first 500m+ Irish mountain.', unlocked: count >= 1 },
    { icon: '👑', title: 'King of Ireland', desc: 'Summit Carrauntoohil (1,039m), Ireland’s highest peak.', unlocked: has('Carrauntoohil') },
    { icon: '🏔️', title: 'The 1,000m Club', desc: 'Climb all 3 Irish 1,000m+ peaks: Carrauntoohil, Beenkeragh & Caher.', unlocked: has('Carrauntoohil') && has('Beenkeragh') && has('Caher') },
    { icon: '🏆', title: 'Four Provincial Peaks', desc: 'Conquer Carrauntoohil, Lugnaquillia, Slieve Donard & Mweelrea.', unlocked: has('Carrauntoohil') && has('Lugnaquillia') && has('Slieve Donard') && has('Mweelrea') },

    // Height Rankings
    { icon: '🔟', title: 'Top 10 in Ireland', desc: 'Summit all 10 highest peaks in Ireland (931m+).', unlocked: top10Names.length === 10 && top10Names.every(n => climbedNames.includes(n)) },
    { icon: '🥇', title: 'Top 20 in Ireland', desc: 'Summit all 20 highest peaks in Ireland (834m+).', unlocked: top20Names.length === 20 && top20Names.every(n => climbedNames.includes(n)) },

    // County & Province High Points
    { icon: '📍', title: 'First County High Point', desc: 'Summit the highest peak of any Irish county.', unlocked: climbedCoHCount >= 1 },
    { icon: '🟢', title: 'Leinster County Tops', desc: 'Lugnaquillia, Mount Leinster, Kippure, Arderin & Croghan Mtn.', unlocked: has('Lugnaquillia') && has('Mount Leinster') && has('Kippure') && has('Arderin') && has('Croghan Mountain') },
    { icon: '🔵', title: 'Munster County Tops', desc: 'Carrauntoohil, Galtymore, Knockboy, Knockmealdown & Moylussa.', unlocked: has('Carrauntoohil') && has('Galtymore') && has('Knockboy') && has('Knockmealdown') && has('Moylussa') },
    { icon: '🟡', title: 'Connacht County Tops', desc: 'Mweelrea, Benbaun, Truskmore & Slieve Anierin.', unlocked: has('Mweelrea') && has('Benbaun') && has('Truskmore') && has('Slieve Anierin') },
    { icon: '🔴', title: 'Ulster County Tops', desc: 'Slieve Donard, Errigal, Sawel, Cuilcagh, Trostan & Slieve Gullion.', unlocked: has('Slieve Donard') && has('Errigal') && has('Sawel') && has('Cuilcagh') && has('Trostan') && has('Slieve Gullion') },
    { icon: '🇮🇪', title: 'All-Ireland County Tops', desc: 'Conquer every 500m+ County High Point in Ireland.', unlocked: countyHighPoints.length > 0 && climbedCoHCount === countyHighPoints.length },

    // Regional & Classic Irish Challenges
    { icon: '🏙️', title: 'Dublin Mountains Duo', desc: 'Climb Kippure & Two Rock Mountain (Fairy Castle).', unlocked: has('Kippure') && has('Two Rock') },
    { icon: '🌲', title: 'Wicklow Wanderer', desc: 'Climb Lugnaquillia, Tonelagee & Djouce in the Garden County.', unlocked: has('Lugnaquillia') && has('Tonelagee') && has('Djouce') },
    { icon: '🧱', title: 'Mourne Wall Challenge', desc: 'Summit Donard, Commedagh, Bearnagh, Meelmore, Meelbeg, Binnian & Muck.', unlocked: has('Slieve Donard') && has('Slieve Commedagh') && has('Slieve Bearnagh') && has('Slieve Meelmore') && has('Slieve Meelbeg') && has('Slieve Binnian') && has('Slieve Muck') },
    { icon: '⛪', title: 'Holy Mountain Pilgrim', desc: 'Reach the chapel summit of Croagh Patrick (764m).', unlocked: has('Croagh Patrick') },

    // Step-by-Step Summit Milestones (5 to 409)
    { icon: '⛰️', title: '5 Arderins Club', desc: 'Reach 5 summits on the 500m+ Arderins list.', unlocked: count >= 5 },
    { icon: '🔟', title: '10 Peaks Explorer', desc: 'Log 10 Irish mountains.', unlocked: count >= 10 },
    { icon: '🥾', title: '20 Peaks Trailblazer', desc: 'Log 20 Irish mountains.', unlocked: count >= 20 },
    { icon: '🧭', title: '30 Peaks Navigator', desc: 'Log 30 Irish mountains.', unlocked: count >= 30 },
    { icon: '⭐', title: '50 Peaks Half-Century', desc: 'Log 50 Irish mountains.', unlocked: count >= 50 },
    { icon: '💯', title: '100 Peaks Centurion', desc: 'Log 100 Irish mountains.', unlocked: count >= 100 },
    { icon: '🌗', title: '205 Halfway Hero', desc: 'Pass the halfway mark of the Arderins list.', unlocked: count >= 205 },
    { icon: '🔥', title: '300 Peaks Legend', desc: 'Log 300 Irish mountains.', unlocked: count >= 300 },
    { icon: '🏅', title: '409 Arderins Complete', desc: 'Climb every single 500m+ peak in Ireland!', unlocked: allPeaks.length > 0 && count >= allPeaks.length }
  ];

  const unlockedCount = trophies.filter(t => t.unlocked).length;
  const visibleTrophies = trophies.filter(t => {
    if (trophyFilter === 'unlocked') return t.unlocked;
    if (trophyFilter === 'locked') return !t.unlocked;
    return true;
  });

  const cabinet = document.getElementById('trophyCabinet');
  cabinet.innerHTML = `
    <div class="col-12 d-flex flex-wrap justify-content-between align-items-center gap-2 mb-1">
      <span class="small fw-bold text-success">${unlockedCount} of ${trophies.length} Trophies Unlocked</span>
      <div class="btn-group btn-group-sm" role="group">
        <button type="button" class="btn ${trophyFilter === 'all' ? 'btn-alpine' : 'btn-outline-secondary'}" onclick="setTrophyFilter('all')">All (${trophies.length})</button>
        <button type="button" class="btn ${trophyFilter === 'unlocked' ? 'btn-alpine' : 'btn-outline-secondary'}" onclick="setTrophyFilter('unlocked')">Unlocked (${unlockedCount})</button>
        <button type="button" class="btn ${trophyFilter === 'locked' ? 'btn-alpine' : 'btn-outline-secondary'}" onclick="setTrophyFilter('locked')">Locked (${trophies.length - unlockedCount})</button>
      </div>
    </div>
    ${visibleTrophies.map(t => `
      <div class="col-12 col-sm-6 col-md-4 col-lg-3">
        <div class="trophy-card ${t.unlocked ? 'unlocked' : 'locked'}">
          <div>
            <div class="trophy-icon">${t.icon}</div>
            <h3 class="h6 fw-bold mb-1">${t.title}</h3>
            <p class="small text-muted mb-3">${t.desc}</p>
          </div>
          <div>
            <span class="${t.unlocked ? 'badge-unlocked' : 'badge-locked'}">${t.unlocked ? 'Unlocked' : 'Locked'}</span>
          </div>
        </div>
      </div>
    `).join('')}
  `;
}

async function fetchSummitWeather(id, lat, lon) {
  const box = document.getElementById(`weather-${id}`);
  box.innerHTML = '<span class="text-muted">Loading summit forecast...</span>';
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,precipitation_sum,windspeed_10m_max&timezone=Europe%2FDublin`;
    const res = await fetch(url);
    const data = await res.json();
    const t = Math.round(data.daily.temperature_2m_max[0]);
    const r = data.daily.precipitation_sum[0];
    const w = Math.round(data.daily.windspeed_10m_max[0]);
    const status = r > 1.5 ? 'Wet Conditions' : (w > 35 ? 'Windy Ridge' : 'Clear Hike');

    box.innerHTML = `
      <span><strong>Now:</strong> ${t}&deg;C &bull; Wind ${w} km/h</span>
      <span class="fw-semibold text-secondary">${status}</span>
    `;
  } catch {
    box.innerHTML = '<span class="text-danger">Weather unavailable</span>';
  }
}

async function suggestBestUnclimbedPeak() {
  const dateVal = document.getElementById('freeDateInput').value;
  const countyVal = document.getElementById('recommenderCounty').value;
  const resultBox = document.getElementById('recommenderResult');

  resultBox.classList.remove('d-none');
  resultBox.textContent = 'Scanning unclimbed peaks and checking summit weather...';

  let candidates = allPeaks.filter(p => !climbedNames.includes(p.name));
  if (countyVal !== 'all') {
    candidates = candidates.filter(p => p.county === countyVal);
  }

  if (candidates.length === 0) {
    resultBox.textContent = 'You have climbed every peak in this selection!';
    return;
  }

  const sample = candidates.sort(() => 0.5 - Math.random()).slice(0, 6);
  let bestPeak = null;
  let bestScore = Infinity;

  for (const peak of sample) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${peak.lat}&longitude=${peak.lon}&daily=temperature_2m_max,precipitation_sum,windspeed_10m_max&timezone=Europe%2FDublin`;
      const res = await fetch(url);
      const data = await res.json();
      const dayIdx = data.daily.time.indexOf(dateVal);
      const idx = dayIdx !== -1 ? dayIdx : 0;

      const rain = data.daily.precipitation_sum[idx];
      const wind = data.daily.windspeed_10m_max[idx];
      const temp = data.daily.temperature_2m_max[idx];

      const score = rain * 2 + wind * 1.5 - temp * 0.5;
      if (score < bestScore) {
        bestScore = score;
        bestPeak = { ...peak, rain, wind, temp };
      }
    } catch {
      continue;
    }
  }

  if (bestPeak) {
    resultBox.innerHTML = `
      <strong>Recommended Peak:</strong> ${bestPeak.name} (${bestPeak.height}m — ${bestPeak.county})<br>
      <strong>Forecast for ${dateVal}:</strong> ${Math.round(bestPeak.temp)}&deg;C, Wind ${Math.round(bestPeak.wind)} km/h, Rain ${bestPeak.rain}mm
    `;
  } else {
    resultBox.textContent = 'Could not find suitable weather data—make sure your selected date is within the next 7 days.';
  }
}

function setupControls() {
  document.getElementById('peakSearch')?.addEventListener('input', () => { currentPage = 1; renderDashboard(); });
  document.getElementById('countyFilter')?.addEventListener('change', () => { currentPage = 1; renderDashboard(); });
  document.getElementById('statusFilter')?.addEventListener('change', () => { currentPage = 1; renderDashboard(); });
  document.getElementById('prevPageBtn')?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderDashboard(); } });
  document.getElementById('nextPageBtn')?.addEventListener('click', () => { currentPage++; renderDashboard(); });
  document.getElementById('recommendBtn')?.addEventListener('click', suggestBestUnclimbedPeak);
}
