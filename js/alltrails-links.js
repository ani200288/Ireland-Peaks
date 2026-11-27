/* Adds a summit-centered AllTrails map search to each rendered peak card. */
(() => {
  'use strict';

  const grid = document.getElementById('peaksGrid');
  if (!grid) return;

  // About 13.5 km north/south and 19 km east/west at Irish latitudes,
  // matching the useful local-search scale of the example AllTrails URL.
  const LATITUDE_RADIUS = 0.061;
  const LONGITUDE_RADIUS = 0.14;
  let coordinatesByName;

  function splitCSVRow(row) {
    const values = [];
    let value = '';
    let quoted = false;

    for (let index = 0; index < row.length; index += 1) {
      const character = row[index];
      if (character === '"') {
        if (quoted && row[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === ',' && !quoted) {
        values.push(value.trim());
        value = '';
      } else {
        value += character;
      }
    }

    values.push(value.trim());
    return values;
  }

  async function loadPeakCoordinates() {
    if (coordinatesByName) return coordinatesByName;

    const response = await fetch('arderins.csv');
    if (!response.ok) throw new Error(`Could not load peak coordinates (${response.status})`);

    const lines = (await response.text()).trim().split(/\r?\n/).filter(Boolean);
    const headers = splitCSVRow(lines.shift()).map(header => header.toLowerCase());
    const nameIndex = headers.indexOf('hillname');
    const latIndex = headers.indexOf('latitude');
    const lonIndex = headers.indexOf('longitude');

    if ([nameIndex, latIndex, lonIndex].some(index => index < 0)) {
      throw new Error('Peak CSV is missing name or coordinate columns.');
    }

    coordinatesByName = new Map();
    lines.forEach(line => {
      const columns = splitCSVRow(line);
      const name = columns[nameIndex];
      const lat = Number.parseFloat(columns[latIndex]);
      const lon = Number.parseFloat(columns[lonIndex]);
      if (name && Number.isFinite(lat) && Number.isFinite(lon)) {
        coordinatesByName.set(name, { lat, lon });
      }
    });

    return coordinatesByName;
  }

  function buildAllTrailsUrl(lat, lon) {
    const url = new URL('https://www.alltrails.com/explore');
    url.searchParams.set('b_br_lat', (lat - LATITUDE_RADIUS).toFixed(12));
    url.searchParams.set('b_br_lng', (lon - LONGITUDE_RADIUS).toFixed(12));
    url.searchParams.set('b_tl_lat', (lat + LATITUDE_RADIUS).toFixed(12));
    url.searchParams.set('b_tl_lng', (lon + LONGITUDE_RADIUS).toFixed(12));
    return url.toString();
  }

  async function addAllTrailsLinks() {
    let coordinates;
    try {
      coordinates = await loadPeakCoordinates();
    } catch (error) {
      console.error('Could not prepare AllTrails map links:', error);
      return;
    }

    grid.querySelectorAll('.peak-card').forEach(card => {
      if (card.querySelector('.alltrails-search-link')) return;

      const peakName = card.querySelector('h3')?.textContent?.trim();
      const actions = card.querySelector('.weather-strip')?.parentElement;
      const summit = coordinates.get(peakName);
      if (!peakName || !actions || !summit) return;

      const link = document.createElement('a');
      link.className = 'btn btn-outline-success btn-sm w-100 mt-2 alltrails-search-link';
      link.href = buildAllTrailsUrl(summit.lat, summit.lon);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View nearby routes on AllTrails ↗';
      link.setAttribute('aria-label', `View AllTrails routes near ${peakName}`);
      actions.appendChild(link);
    });
  }

  const observer = new MutationObserver(() => { void addAllTrailsLinks(); });
  observer.observe(grid, { childList: true, subtree: true });
  void addAllTrailsLinks();
})();
