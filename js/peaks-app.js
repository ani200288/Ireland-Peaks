/* ==========================================================================
   PeakLog Ireland - Full 408 Arderins Tracker, Trophies & Weather Recommender
   ========================================================================== */

let allPeaks = [];
let climbedNames = JSON.parse(localStorage.getItem('irelandClimbedNames')) || [];
let currentPage = 1;
const PEAKS_PER_PAGE = 24;

// Official DoBIH Irish Mountain Region Codes -> Human-Readable Range Names
const regionMap = {
  "43A": "Armagh & South Down",
  "43B": "Mourne Mountains",
  "43C": "Antrim Hills",
  "44B": "Sperrin Mountains",
  "45A": "Inishowen (Donegal)",
  "45B": "Derryveagh & North Donegal",
  "45C": "Bluestack & South Donegal",
  "45D": "Dartry, Cuilcagh & Leitrim",
  "45E": "Ox Mountains (Sligo)",
  "46B": "Nephin Beg Range (Mayo)",
  "46C": "Achill & Corraun (Mayo)",
  "47A": "Sheeffry, Mweelrea & Croagh Patrick",
  "47B": "Twelve Bens (Connemara)",
  "47C": "Maumturks & Partry Mountains",
  "48A": "Slieve Bernagh & Clare Hills",
  "48C": "Derrynasaggart & Boggeragh",
  "49A": "Brandon Group (Dingle)",
  "49B": "Slieve Mish & Central Dingle",
  "50A": "Iveragh West (Kerry)",
  "50B": "Dunkerron Mountains (Kerry)",
  "50C": "MacGillycuddy's Reeks & Purple Mtn",
  "51A": "Caha & Slieve Miskish (Beara)",
  "52A": "Mangerton, Shehy & Cork/Kerry",
  "52B": "West Cork Hills",
  "53A": "Galtee & Ballyhoura Mountains",
  "53B": "Silvermines & Keeper Hill",
  "54A": "Comeragh & Knockmealdown Mtns",
  "54B": "Blackstairs & Slievenamon",
  "55A": "South & Central Wicklow",
  "55B": "North Wicklow & Dublin Mountains",
  "56A": "Cooley Mountains (Louth)",
  "56B": "Slieve Bloom Mountains"
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

// 1. Parse DoBIH arderins.csv
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
    const latIdx = headers.indexOf('latitude');
    const lonIdx = headers.indexOf('longitude');

    allPeaks = lines.slice(1).map((line, idx) => {
      const cols = splitCSVRow(line);
      const rawRegion = (cols[regionIdx] || '').trim();
      return {
        id: idx + 1,
        name: cols[nameIdx] || `Summit ${idx + 1}`,
        height: Math.round(parseFloat(cols[heightIdx]) || 500),
        county: regionMap[rawRegion] || rawRegion || 'Ireland',
        lat: parseFloat(cols[latIdx]),
        lon: parseFloat(cols[lonIdx])
      };
    }).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
  } catch (err) {
    console.error(err);
    document.getElementById('peaksGrid').innerHTML =
      '<div class="col-12"><div class="alert alert-warning">Browser security blocked local file loading (<code>file://</code>). Open this folder with <strong>VS Code Live Server</strong> or upload it to <strong>GitHub Pages</strong> to view all 408 peaks!</div></div>';
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

// 2. Populate Mountain Range Dropdowns Dynamically
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

// 3. Render Filtered Grid + Pagination + Trophies
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
  if (pagePeaks.length === 0 && allPeaks.length > 0) {
    container.innerHTML = '<div class="col-12"><div class="alert alert-light text-center">No peaks match your current filter.</div></div>';
  } else if (pagePeaks.length > 0) {
    container.innerHTML = pagePeaks.map(peak => {
      const isClimbed = climbedNames.includes(peak.name);
      return `
        <div class="col-12 col-md-6 col-lg-4">
          <div class="card-alpine peak-card h-100 p-3 d-flex flex-column ${isClimbed ? 'is-climbed' : ''}">
            <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
              <h3 class="h6 fw-bold mb-0">${peak.name}</h3>
              <span class="badge-elevation">${peak.height}m</span>
            </div>
            <p class="small text-muted mb-2">${peak.county}</p>
            <div id="weather-${peak.id}" class="small bg-light p-2 rounded mb-3">
              <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none fw-semibold" onclick="fetchSummitWeather(${peak.id}, ${peak.lat}, ${peak.lon})">
                Check 7-Day Summit Forecast
              </button>
            </div>
            <button type="button" class="btn btn-sm mt-auto ${isClimbed ? 'btn-alpine' : 'btn-outline-success'}" onclick="toggleClimbed('${peak.name.replace(/'/g, "\\'")}')">
              ${isClimbed ? 'Climbed' : 'Mark as Climbed'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

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

// 4. Trophy Cabinet Calculation
function updateCounterAndTrophies() {
  document.getElementById('climbedCounter').textContent = `${climbedNames.length} / ${allPeaks.length} Arderins Climbed`;

  const has = name => climbedNames.some(c => c.toLowerCase().includes(name.toLowerCase()));
  const trophies = [
    { title: 'First Summit', desc: 'Climb your 1st Arderin peak', unlocked: climbedNames.length >= 1 },
    { title: 'King of Ireland', desc: 'Summit Carrauntoohil (1,039m)', unlocked: has('Carrauntoohil') },
    { title: 'Four Provincial Peaks', desc: 'Carrauntoohil, Lugnaquilla, Slieve Donard & Mweelrea', unlocked: has('Carrauntoohil') && has('Lugnaquillia') && has('Slieve Donard') && has('Mweelrea') },
    { title: 'Double Figures', desc: 'Log 10 peaks across Ireland', unlocked: climbedNames.length >= 10 },
    { title: 'Wicklow Classic Duo', desc: 'Climb Lugnaquilla & Djouce', unlocked: has('Lugnaquillia') && has('Djouce') },
    { title: 'The Highest Hundred', desc: 'Reach 100 Irish summits', unlocked: climbedNames.length >= 100 }
  ];

  const cabinet = document.getElementById('trophyCabinet');
  cabinet.innerHTML = trophies.map(t => `
    <div class="col-6 col-md-4 col-lg-2">
      <div class="trophy-box ${t.unlocked ? 'trophy-unlocked' : 'trophy-locked'}">
        <div class="fw-bold small">${t.unlocked ? 'UNLOCKED' : 'LOCKED'}</div>
        <div class="fw-bold small mt-1">${t.title}</div>
        <div style="font-size: 0.72rem;">${t.desc}</div>
      </div>
    </div>
  `).join('');
}

// 5. On-Demand Summit Weather
async function fetchSummitWeather(id, lat, lon) {
  const box = document.getElementById(`weather-${id}`);
  box.textContent = 'Fetching Open-Meteo...';
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,precipitation_sum,windspeed_10m_max&timezone=Europe%2FDublin`;
    const res = await fetch(url);
    const data = await res.json();
    const t = data.daily.temperature_2m_max[0];
    const r = data.daily.precipitation_sum[0];
    const w = data.daily.windspeed_10m_max[0];
    box.innerHTML = `<strong>Today:</strong> ${t}&deg;C | Wind ${w} km/h | Rain ${r}mm`;
  } catch {
    box.textContent = 'Weather unavailable.';
  }
}

// 6. "When Are You Free?" Unclimbed Hike Recommender
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
      <strong>Forecast for ${dateVal}:</strong> ${bestPeak.temp}&deg;C, Wind ${bestPeak.wind} km/h, Rain ${bestPeak.rain}mm
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
