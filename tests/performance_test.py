"""
performance_test.py

Measures REAL load time and REAL bytes transferred for the bandwidth-
sensitive part of the real user journey: loading a module's content. Setup
(registration + the one-time diagnostic quiz) happens unthrottled first,
since that is a one-time event, not the repeated action the low-bandwidth
design target applies to. Throttling is then applied via Chrome DevTools
Protocol, matching the 2G/3G profiles in Chapter 3, Table 3.3, and a full
page reload re-triggers a real module content fetch through the real
backend (tests/start-e2e-server.js), using the same realistic-length
content (900-1,200 words standard / ~220 words text-only) the real AI
Content Generation module targets.
"""

import json
import time
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:8091"

NETWORK_PROFILES = {
    "2G": {"downloadThroughput": 250 * 1000 / 8, "uploadThroughput": 50 * 1000 / 8, "latency": 300},
    "3G": {"downloadThroughput": 1.5 * 1000 * 1000 / 8, "uploadThroughput": 750 * 1000 / 8, "latency": 100},
}


def register_and_complete_diagnostic(page, email):
    """Unthrottled setup: create an account, start a course, answer the diagnostic quiz."""
    page.goto(BASE_URL + "/", wait_until="networkidle")
    page.fill('#register-form [name="email"]', email)
    page.fill('#register-form [name="password"]', "correct-horse-battery-staple")
    page.click('#register-form button[type="submit"]')
    page.wait_for_selector("#dashboard-section:not([hidden])", timeout=5000)
    page.fill("#new-course-subject", "IntroductionToComputing")
    page.click('#new-course-form button[type="submit"]')
    page.wait_for_selector("#diagnostic-section:not([hidden])", timeout=5000)
    question_count = page.locator("#diagnostic-questions fieldset").count()
    for i in range(question_count):
        page.check(f'input[name="d{i}"][value="0"]')
    page.click('#diagnostic-form button[type="submit"]')
    page.wait_for_selector("#app-section:not([hidden])", timeout=5000)


def measure_reload(context, page, profile_name, offline=False, label=""):
    client = context.new_cdp_session(page)
    client.send("Network.enable")

    total_bytes = 0
    request_count = 0

    def on_loading_finished(event):
        nonlocal total_bytes, request_count
        total_bytes += event.get("encodedDataLength", 0)
        request_count += 1

    client.on("Network.loadingFinished", on_loading_finished)

    profile = NETWORK_PROFILES.get(profile_name, {"downloadThroughput": -1, "uploadThroughput": -1, "latency": 0})
    client.send("Network.emulateNetworkConditions", {
        "offline": offline,
        "latency": profile["latency"],
        "downloadThroughput": profile["downloadThroughput"],
        "uploadThroughput": profile["uploadThroughput"],
    })

    start = time.time()
    page.reload(wait_until="networkidle", timeout=60000)
    elapsed = time.time() - start

    mode_text = page.text_content("#mode-indicator")
    content_text = page.text_content("#content-root")

    return {
        "label": label,
        "load_time_s": round(elapsed, 3),
        "total_kb_transferred": round(total_bytes / 1024, 2),
        "request_count": request_count,
        "mode_indicator": (mode_text or "").strip(),
        "content_loaded": bool(content_text and "Unable to load" not in content_text and len(content_text.strip()) > 20),
    }


def main():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # --- 2G scenarios: cold, warm, offline (same context = same session) ---
        context = browser.new_context()
        page = context.new_page()
        register_and_complete_diagnostic(page, "perf.2g@example.com")

        results.append(measure_reload(context, page, "2G", label="Reload under 2G, cold cache"))
        results.append(measure_reload(context, page, "2G", label="Reload under 2G, warm cache"))
        results.append(measure_reload(context, page, "2G", offline=True, label="Offline reload (cache only)"))
        context.close()

        # --- 3G scenario: fresh context/account ---
        context2 = browser.new_context()
        page2 = context2.new_page()
        register_and_complete_diagnostic(page2, "perf.3g@example.com")
        results.append(measure_reload(context2, page2, "3G", label="Reload under 3G, cold cache"))
        context2.close()

        browser.close()

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
