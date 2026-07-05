'use strict';

(function () {
  const contentRoot = document.getElementById('content-root');
  const modeIndicator = document.getElementById('mode-indicator');

  async function loadContent(mode) {
    modeIndicator.textContent = `Delivery mode: ${mode}`;
    try {
      const res = await fetch(`/api/content?mode=${encodeURIComponent(mode)}`);
      const html = await res.text();
      contentRoot.innerHTML = html;
    } catch (err) {
      contentRoot.innerHTML = '<p>Unable to load content. You appear to be offline.</p>';
    }
  }

  window.addEventListener('bandwidthModeChanged', (event) => {
    loadContent(event.detail.mode);
  });

  window.addEventListener('DOMContentLoaded', async () => {
    const mode = await window.BandwidthMonitor.startMonitoring();
    await loadContent(mode);
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* registration failure is non-fatal for this local test build */
      });
    });
  }
})();
