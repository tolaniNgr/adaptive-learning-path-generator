/**
 * bandwidth-monitor.js
 *
 * Bandwidth-aware content delivery module. Determines whether the
 * application should request standard or text-only content, using:
 *   1. A fast pre-check against the Network Information API (if available), then
 *   2. An active probe measurement (timed fetch of a small known-size resource)
 *      as the authoritative measurement, since navigator.connection is not
 *      available or reliable in all browsers.
 *
 * Re-evaluates every 5 minutes and on any 'online'/connection-change event,
 * and dispatches a 'bandwidthModeChanged' CustomEvent whenever the mode changes.
 */

'use strict';

(function (global) {
  const TEXT_ONLY_THRESHOLD_KBPS = 500;
  const REEVALUATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  const PROBE_RESOURCE_PATH = '/probe/probe-payload.bin'; // fixed-size known resource
  const PROBE_RESOURCE_BYTES = 50 * 1024; // 50 KB probe payload

  let currentMode = null; // 'standard' | 'text-only'
  let reevaluationTimer = null;

  /**
   * Performs a timed fetch of a fixed-size resource and returns the
   * measured effective throughput in kbps. Falls back to a conservative
   * 'slow' estimate if the probe fails (e.g. offline).
   */
  async function measureThroughputKbps(fetchImpl = global.fetch) {
    const start = performance.now();
    try {
      const response = await fetchImpl(`${PROBE_RESOURCE_PATH}?t=${Date.now()}`, { cache: 'no-store' });
      const blob = await response.blob();
      const elapsedSeconds = (performance.now() - start) / 1000;
      const bits = blob.size * 8;
      if (elapsedSeconds <= 0) return Infinity; // effectively instantaneous (cached/local)
      return bits / elapsedSeconds / 1000; // kbps
    } catch (err) {
      return 0; // treat failed probe (e.g. offline) as worst-case bandwidth
    }
  }

  /**
   * Fast pre-check using the Network Information API, where available.
   * Returns 'text-only', 'standard', or null (inconclusive -> fall back to probe).
   */
  function checkNetworkInformationAPI() {
    const connection = global.navigator && (global.navigator.connection
      || global.navigator.mozConnection
      || global.navigator.webkitConnection);
    if (!connection || !connection.effectiveType) return null;
    if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
      return 'text-only';
    }
    return null; // 3g/4g reported types are not conclusive enough alone; confirm with probe
  }

  function setMode(newMode) {
    const changed = newMode !== currentMode;
    currentMode = newMode;
    if (changed && typeof global.dispatchEvent === 'function') {
      global.dispatchEvent(new CustomEvent('bandwidthModeChanged', { detail: { mode: newMode } }));
    }
    return changed;
  }

  async function evaluateBandwidthMode() {
    const quickCheck = checkNetworkInformationAPI();
    if (quickCheck) {
      setMode(quickCheck);
      return currentMode;
    }
    const kbps = await measureThroughputKbps();
    const mode = kbps <= TEXT_ONLY_THRESHOLD_KBPS ? 'text-only' : 'standard';
    setMode(mode);
    return currentMode;
  }

  async function startMonitoring() {
    const initialMode = await evaluateBandwidthMode();
    if (reevaluationTimer) clearInterval(reevaluationTimer);
    reevaluationTimer = setInterval(evaluateBandwidthMode, REEVALUATION_INTERVAL_MS);
    if (global.addEventListener) {
      global.addEventListener('online', evaluateBandwidthMode);
      const connection = global.navigator && global.navigator.connection;
      if (connection && connection.addEventListener) {
        connection.addEventListener('change', evaluateBandwidthMode);
      }
    }
    return initialMode;
  }

  function getMode() {
    return currentMode;
  }

  const api = {
    TEXT_ONLY_THRESHOLD_KBPS,
    PROBE_RESOURCE_BYTES,
    measureThroughputKbps,
    evaluateBandwidthMode,
    startMonitoring,
    getMode,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // Node (for automated testing)
  } else {
    global.BandwidthMonitor = api; // Browser
  }
})(typeof window !== 'undefined' ? window : globalThis);
