"""
e2e_browser_test.py

Drives the ACTUAL public/index.html + app.js in a real headless browser
against the ACTUAL backend, covering the full real journey for the
multi-course architecture: register (no subject at registration), start a
course, take the diagnostic quiz, load content, verify a FAILED assessment
correctly repeats the same module (not the next one), pass it and advance,
complete the whole path, click a related-topic recommendation to start a
second course without logging out, and see both courses on the dashboard
after reloading.
"""

from playwright.sync_api import sync_playwright
import sys

BASE_URL = "http://localhost:8091"


def main():
    failures = []

    def check(label, condition, detail=""):
        status = "PASS" if condition else "FAIL"
        print(f"  [{status}] {label}" + (f" — {detail}" if detail and not condition else ""))
        if not condition:
            failures.append(label)

    def answer_diagnostic_all_correct(page):
        page.wait_for_selector("#diagnostic-section:not([hidden])", timeout=5000)
        count = page.locator("#diagnostic-questions fieldset").count()
        for i in range(count):
            page.check(f'input[name="d{i}"][value="0"]')
        page.click('#diagnostic-form button[type="submit"]')
        page.wait_for_selector("#app-section:not([hidden])", timeout=5000)
        return count

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # --- Register: no subject field at all ---
        page.goto(BASE_URL + "/", wait_until="networkidle")
        check("No subject field on the registration form", page.locator('#register-form [name="subject"]').count() == 0)
        page.fill('#register-form [name="email"]', "e2e.learner@example.com")
        page.fill('#register-form [name="password"]', "correct-horse-battery-staple")
        page.click('#register-form button[type="submit"]')

        # --- Dashboard should show, empty ---
        page.wait_for_selector("#dashboard-section:not([hidden])", timeout=5000)
        check("Dashboard shown after registration (not straight into a course)", page.is_visible("#dashboard-section"))
        check("Dashboard shows no courses yet", "not enrolled" in page.text_content("#enrollment-list").lower())

        # --- Start a new course ---
        page.fill("#new-course-subject", "IntroductionToComputing")
        page.click('#new-course-form button[type="submit"]')
        question_count = answer_diagnostic_all_correct(page)
        check("Diagnostic quiz had 10 questions", question_count == 10, str(question_count))

        profile_text = page.text_content("#profile-summary")
        check("Profile shows Advanced proficiency (100% on diagnostic)", "Advanced" in profile_text, profile_text)

        # --- Deliberately FAIL the first module's assessment ---
        first_module_text = page.text_content("#content-root")
        page.check('input[name="q0"][value="0"]')  # index 1 is correct in the canned stub; 0 is wrong
        page.click('#assessment-form button[type="submit"]')
        page.wait_for_timeout(400)
        result_text = page.text_content("#assessment-result")
        check("Failing shows a 'retake this module' message", "retake this same module" in result_text.lower(), result_text)
        second_load_text = page.text_content("#content-root")
        check(
            "Failing an assessment shows the SAME module again, not the next one",
            first_module_text.strip() == second_load_text.strip(),
            f"before={first_module_text[:60]!r} after={second_load_text[:60]!r}",
        )

        # --- Now PASS it: must advance ---
        page.check('input[name="q0"][value="1"]')  # correct answer
        page.click('#assessment-form button[type="submit"]')
        page.wait_for_timeout(400)
        pass_result_text = page.text_content("#assessment-result")
        check("Passing shows an 'advancing' message", "passed" in pass_result_text.lower(), pass_result_text)
        third_load_text = page.text_content("#content-root")
        check("Passing loads a DIFFERENT module", third_load_text.strip() != first_module_text.strip())

        # --- Complete the remaining 2 modules (this account is Advanced -> 3 modules total) ---
        for _ in range(2):
            page.check('input[name="q0"][value="1"]')
            page.click('#assessment-form button[type="submit"]')
            page.wait_for_timeout(400)

        content_text_final = page.text_content("#content-root")
        check("Path completion message shown after finishing all modules", "completed every module" in content_text_final.lower(), content_text_final)
        check("Related topics are shown as clickable links", page.locator("#related-topics a").count() >= 3)

        # --- Click a related-topic link: should start a SECOND course, no logout ---
        first_related_topic = page.locator("#related-topics a").first.text_content()
        page.locator("#related-topics a").first.click()
        answer_diagnostic_all_correct(page)
        new_profile_text = page.text_content("#profile-summary")
        check(
            "Clicking a related topic starts a new course for that exact subject",
            first_related_topic in new_profile_text,
            f"expected {first_related_topic!r} in {new_profile_text!r}",
        )

        # --- Back to dashboard: both courses should now be listed ---
        page.click("#back-to-dashboard")
        page.wait_for_selector("#dashboard-section:not([hidden])", timeout=5000)
        card_count = page.locator(".enrollment-card").count()
        check("Dashboard now lists 2 courses after starting a second one via related topics", card_count == 2, str(card_count))

        # --- Reload: session and both enrollments persist ---
        page.reload(wait_until="networkidle")
        page.wait_for_selector("#dashboard-section:not([hidden])", timeout=5000)
        card_count_after_reload = page.locator(".enrollment-card").count()
        check("Both courses still listed after reload (session persisted)", card_count_after_reload == 2, str(card_count_after_reload))

        # --- Logout ---
        page.click("#logout-button")
        page.wait_for_selector("#auth-section:not([hidden])", timeout=5000)
        check("Auth section shown again after logout", page.is_visible("#auth-section"))

        browser.close()

    print()
    if failures:
        print(f"{len(failures)} CHECK(S) FAILED: {failures}")
        sys.exit(1)
    else:
        print("ALL CHECKS PASSED")


if __name__ == "__main__":
    main()
