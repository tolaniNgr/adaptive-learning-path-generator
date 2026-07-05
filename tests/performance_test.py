"""
performance_test.py

Loads the actual PWA shell in a real headless Chromium browser under
real, throttled network conditions matching the profiles in Chapter 3,
Table 3.3 (Section 3.9.2), and measures REAL load time and REAL bytes
transferred via Chrome DevTools Protocol network events.

This replaces the previous unverified performance figures in Chapter 4
with numbers actually produced by loading the actual application code.
"""

import json
import time
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:8090"

NETWORK_PROFILES = {
    "2G": {"downloadThroughput": 250 * 1000 / 8, "uploadThroughput": 50 * 1000 / 8, "latency": 300},
    "3G": {"downloadThroughput": 1.5 * 1000 * 1000 / 8, "uploadThroughput": 750 * 1000 / 8, "latency": 100},
    "Online": {"downloadThroughput": -1, "uploadThroughput": -1, "latency": 0},
}


def run_scenario(context, profile_name, clear_cache, offline=False, label=""):
    page = context.new_page()
    client = context.new_cdp_session(page)
    client.send("Network.enable")

    total_bytes = 0
    request_count = 0

    def on_loading_finished(event):
        nonlocal total_bytes, request_count
        total_bytes += event.get("encodedDataLength", 0)
        request_count += 1

    client.on("Network.loadingFinished", on_loading_finished)

    profile = NETWORK_PROFILES[profile_name]
    client.send("Network.emulateNetworkConditions", {
        "offline": offline,
        "latency": profile["latency"],
        "downloadThroughput": profile["downloadThroughput"],
        "uploadThroughput": profile["uploadThroughput"],
    })

    start = time.time()
    page.goto(BASE_URL + "/", wait_until="networkidle", timeout=60000)
    elapsed = time.time() - start

    mode_text = page.text_content("#mode-indicator")
    content_text = page.text_content("#content-root")

    result = {
        "label": label or f"{profile_name} (cache={'cleared' if clear_cache else 'warm'}, offline={offline})",
        "profile": profile_name,
        "load_time_s": round(elapsed, 3),
        "total_kb_transferred": round(total_bytes / 1024, 2),
        "request_count": request_count,
        "mode_indicator": mode_text.strip() if mode_text else None,
        "content_loaded": bool(content_text and "Loading module content" not in content_text and "Unable to load" not in content_text),
        "content_preview": (content_text or "")[:80].strip(),
    }
    page.close()
    return result


def main():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # --- Scenario 1: First visit under 2G, empty cache ---
        context = browser.new_context()
        results.append(run_scenario(context, "2G", clear_cache=True, label="First visit, 2G, cold cache"))
        page = context.pages[0] if context.pages else context.new_page()

        # Let the service worker finish installing before the "warm cache" run
        warm_page = context.new_page()
        warm_page.goto(BASE_URL + "/", wait_until="networkidle")
        warm_page.wait_for_timeout(1500)  # allow SW install/activate to settle
        warm_page.close()

        # --- Scenario 2: Second visit under 2G, warm (service-worker) cache ---
        results.append(run_scenario(context, "2G", clear_cache=False, label="Repeat visit, 2G, warm cache"))

        # --- Scenario 3: Offline reload (service worker cache only) ---
        results.append(run_scenario(context, "2G", clear_cache=False, offline=True, label="Offline reload (cache only)"))
        context.close()

        # --- Scenario 4: First visit under 3G, empty cache (fresh context) ---
        context2 = browser.new_context()
        results.append(run_scenario(context2, "3G", clear_cache=True, label="First visit, 3G, cold cache"))
        context2.close()

        browser.close()

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
