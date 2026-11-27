/* Adds a safe, per-peak AllTrails route search link to each rendered peak card. */
(() => {
  'use strict';

  const grid = document.getElementById('peaksGrid');
  if (!grid) return;

  function addAllTrailsLinks() {
    grid.querySelectorAll('.peak-card').forEach(card => {
      if (card.querySelector('.alltrails-search-link')) return;

      const peakName = card.querySelector('h3')?.textContent?.trim();
      const range = card.querySelector('.pill-region')?.textContent?.trim();
      const actions = card.querySelector('.weather-strip')?.parentElement;
      if (!peakName || !actions) return;

      const query = [peakName, range, 'Ireland', 'hiking trail']
        .filter(Boolean)
        .join(' ');
      const allTrailsUrl = new URL('https://www.alltrails.com/explore');
      allTrailsUrl.searchParams.set('query', query);

      const link = document.createElement('a');
      link.className = 'btn btn-outline-success btn-sm w-100 mt-2 alltrails-search-link';
      link.href = allTrailsUrl.toString();
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Find routes on AllTrails ↗';
      link.setAttribute('aria-label', `Search AllTrails routes for ${peakName} in Ireland`);
      actions.appendChild(link);
    });
  }

  const observer = new MutationObserver(addAllTrailsLinks);
  observer.observe(grid, { childList: true, subtree: true });
  addAllTrailsLinks();
})();
