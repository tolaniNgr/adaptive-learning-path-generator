'use strict';

(function () {
  const authSection = document.getElementById('auth-section');
  const dashboardSection = document.getElementById('dashboard-section');
  const diagnosticSection = document.getElementById('diagnostic-section');
  const appSection = document.getElementById('app-section');
  const authError = document.getElementById('auth-error');
  const dashboardError = document.getElementById('dashboard-error');
  const enrollmentList = document.getElementById('enrollment-list');
  const newCourseForm = document.getElementById('new-course-form');
  const diagnosticForm = document.getElementById('diagnostic-form');
  const diagnosticError = document.getElementById('diagnostic-error');
  const diagnosticSubjectName = document.getElementById('diagnostic-subject-name');
  const modeIndicator = document.getElementById('mode-indicator');
  const contentRoot = document.getElementById('content-root');
  const profileSummary = document.getElementById('profile-summary');
  const moduleNav = document.getElementById('module-nav');
  const navButtons = document.getElementById('module-navigation-buttons');
  const prevButton = document.getElementById('prev-module-button');
  const nextButton = document.getElementById('next-module-button');
  const sectionAssessmentForm = document.getElementById('section-assessment-form');
  const sectionAssessmentLevel = document.getElementById('section-assessment-level');
  const sectionAssessmentResult = document.getElementById('section-assessment-result');
  const relatedTopicsEl = document.getElementById('related-topics');
  const backToDashboardButton = document.getElementById('back-to-dashboard');

  // --- State ---
  let currentEnrollmentId = null;
  let enrollment = null;
  let accessibleModules = [];
  let pendingSectionAssessment = null;
  let viewIndex = 0; // which module in accessibleModules is currently shown
  let pendingEnrollmentId = null;

  function showOnly(section) {
    authSection.hidden = section !== 'auth';
    dashboardSection.hidden = section !== 'dashboard';
    diagnosticSection.hidden = section !== 'diagnostic';
    appSection.hidden = section !== 'app';
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    let body = {};
    try {
      body = await res.json();
    } catch (err) {
      /* non-JSON error page */
    }
    if (!res.ok) {
      const err = new Error(body.detail ? `${body.error} (${body.detail})` : body.error || `Request failed (HTTP ${res.status})`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  // ---------- Dashboard ----------

  async function loadDashboard() {
    dashboardError.textContent = '';
    const { enrollments } = await api('/api/enrollments');
    if (!enrollments.length) {
      enrollmentList.innerHTML = '<p>You are not enrolled in any courses yet — start one below.</p>';
    } else {
      enrollmentList.innerHTML = enrollments
        .map(
          (e) => `
        <button class="enrollment-card" data-id="${e.id}">
          <strong>${e.subject}</strong>
          <span>${
            !e.diagnosticCompleted
              ? 'Diagnostic assessment pending'
              : e.pathComplete
              ? 'Path complete'
              : `${e.proficiencyLevel} &middot; section ${e.unlockedSectionsCount} of ${e.totalSections}`
          }</span>
        </button>`
        )
        .join('');
      enrollmentList.querySelectorAll('.enrollment-card').forEach((btn) => {
        btn.addEventListener('click', () => openEnrollment(btn.dataset.id));
      });
    }
    showOnly('dashboard');
  }

  async function openEnrollment(enrollmentId) {
    const data = await api(`/api/enrollments/${enrollmentId}`);
    if (!data.enrollment.diagnosticCompleted) {
      pendingEnrollmentId = enrollmentId;
      showDiagnostic(data.diagnosticQuiz, data.enrollment.subject);
      return;
    }
    currentEnrollmentId = enrollmentId;
    enrollment = data.enrollment;
    accessibleModules = data.accessibleModules;
    pendingSectionAssessment = data.pendingSectionAssessment;
    localStorage.setItem('lastEnrollmentId', enrollmentId);
    await onCourseReady();
  }

  async function startNewCourse(subject) {
    dashboardError.textContent = '';
    try {
      const data = await api('/api/enrollments', { method: 'POST', body: JSON.stringify({ subject }) });
      pendingEnrollmentId = data.enrollment.id;
      showDiagnostic(data.diagnosticQuiz, subject);
    } catch (err) {
      if (err.status === 409 && err.body && err.body.enrollmentId) {
        await openEnrollment(err.body.enrollmentId);
        return;
      }
      dashboardError.textContent = err.message;
    }
  }

  // ---------- Diagnostic quiz ----------

  function renderDiagnosticQuestions(questions) {
    const container = document.getElementById('diagnostic-questions');
    container.innerHTML = questions
      .map(
        (q, i) => `
      <fieldset>
        <legend>${i + 1}. [${q.difficulty}] ${q.question}</legend>
        ${q.options
          .map((opt, oi) => `<label><input type="radio" name="d${i}" value="${oi}" required /> ${opt}</label><br/>`)
          .join('')}
      </fieldset>`
      )
      .join('');
  }

  function showDiagnostic(quizQuestions, subject) {
    diagnosticError.textContent = '';
    diagnosticSubjectName.textContent = subject;
    renderDiagnosticQuestions(quizQuestions);
    showOnly('diagnostic');
  }

  async function submitDiagnostic(event) {
    event.preventDefault();
    diagnosticError.textContent = '';
    const questionCount = document.querySelectorAll('#diagnostic-questions fieldset').length;
    const answers = [];
    for (let i = 0; i < questionCount; i++) {
      const selected = diagnosticForm.querySelector(`input[name="d${i}"]:checked`);
      answers.push(selected ? Number(selected.value) : -1);
    }
    try {
      const data = await api(`/api/enrollments/${pendingEnrollmentId}/complete-diagnostic`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      });
      currentEnrollmentId = pendingEnrollmentId;
      enrollment = data.enrollment;
      accessibleModules = data.accessibleModules;
      pendingSectionAssessment = data.pendingSectionAssessment;
      pendingEnrollmentId = null;
      localStorage.setItem('lastEnrollmentId', currentEnrollmentId);
      await onCourseReady();
    } catch (err) {
      diagnosticError.textContent = err.message;
    }
  }

  // ---------- Course view: reading modules, navigation, section assessment ----------

  function renderProfileSummary() {
    profileSummary.innerHTML = `
      <p><strong>${enrollment.subject}</strong></p>
      <p><strong>Proficiency:</strong> ${enrollment.proficiencyLevel} (diagnostic score: ${enrollment.diagnosticScore}%)</p>
      <p><strong>Progress:</strong> section ${enrollment.unlockedSectionsCount} of ${enrollment.totalSections}${enrollment.pathComplete ? ' — complete' : ''}</p>
    `;
  }

  function renderModuleNav() {
    moduleNav.innerHTML = accessibleModules
      .map((id, i) => `<button class="module-nav-item${i === viewIndex ? ' active' : ''}" data-index="${i}">${i + 1}</button>`)
      .join('');
    moduleNav.querySelectorAll('.module-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        viewIndex = Number(btn.dataset.index);
        showModuleContent();
      });
    });
  }

  function renderRelatedTopics() {
    if (!enrollment.relatedTopics || !enrollment.relatedTopics.length) {
      relatedTopicsEl.hidden = true;
      return;
    }
    relatedTopicsEl.hidden = false;
    relatedTopicsEl.innerHTML = `<h3>You might also enjoy learning about</h3><ul id="related-topics-list"></ul>`;
    const list = document.getElementById('related-topics-list');
    enrollment.relatedTopics.forEach((topic) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = topic;
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        await startNewCourse(topic);
      });
      li.appendChild(link);
      list.appendChild(li);
    });
  }

  async function showModuleContent() {
    sectionAssessmentForm.hidden = true;
    navButtons.hidden = false;
    renderModuleNav();

    const moduleId = accessibleModules[viewIndex];
    const mode = window.BandwidthMonitor.getMode();
    try {
      const data = await api(`/api/content/${moduleId}?mode=${encodeURIComponent(mode)}`);
      contentRoot.innerHTML = `<h2>${data.moduleId}</h2><div>${data.content}</div>`;
    } catch (err) {
      contentRoot.innerHTML = `<p>Unable to load content (${err.message}). You may be offline.</p>`;
    }

    prevButton.disabled = viewIndex === 0;
    const atLastAccessible = viewIndex === accessibleModules.length - 1;
    nextButton.textContent = atLastAccessible && pendingSectionAssessment ? 'Continue to assessment \u2192' : 'Next \u2192';
    nextButton.disabled = atLastAccessible && !pendingSectionAssessment && enrollment.pathComplete;

    // Related topics are a property of the ENROLLMENT (path complete or
    // not), not of which module happens to be on screen — so this is
    // derived fresh every time, rather than only right after passing the
    // final assessment. Otherwise browsing to an earlier module via the
    // module nav after completion would silently hide the recommendations
    // again with no way back short of a reload.
    if (enrollment.pathComplete) {
      renderRelatedTopics();
    } else {
      relatedTopicsEl.hidden = true;
    }
  }

  async function showSectionAssessment() {
    navButtons.hidden = true;
    contentRoot.innerHTML = '';
    sectionAssessmentResult.textContent = '';
    const data = await api(`/api/enrollments/${currentEnrollmentId}/section-assessment`);
    sectionAssessmentLevel.textContent = data.level;
    sectionAssessmentForm.dataset.level = data.level;
    sectionAssessmentForm.dataset.questionCount = data.questions.length;
    const container = document.getElementById('section-assessment-questions');
    container.innerHTML = data.questions
      .map(
        (q, i) => `
      <fieldset>
        <legend>${i + 1}. ${q.question}</legend>
        ${q.options.map((opt, oi) => `<label><input type="radio" name="sa${i}" value="${oi}" required /> ${opt}</label><br/>`).join('')}
      </fieldset>`
      )
      .join('');
    sectionAssessmentForm.hidden = false;
  }

  async function submitSectionAssessment(event) {
    event.preventDefault();
    const level = sectionAssessmentForm.dataset.level;
    const questionCount = Number(sectionAssessmentForm.dataset.questionCount);
    const answers = [];
    for (let i = 0; i < questionCount; i++) {
      const selected = sectionAssessmentForm.querySelector(`input[name="sa${i}"]:checked`);
      answers.push(selected ? Number(selected.value) : -1);
    }
    try {
      const result = await api(`/api/enrollments/${currentEnrollmentId}/section-assessment`, {
        method: 'POST',
        body: JSON.stringify({ level, answers }),
      });
      enrollment = result.enrollment;
      const previousAccessibleCount = accessibleModules.length;
      accessibleModules = result.accessibleModules;
      pendingSectionAssessment = result.pendingSectionAssessment;
      renderProfileSummary();

      if (result.decision === 'ADVANCE') {
        sectionAssessmentResult.textContent = `Score: ${result.score}% — passed! ${
          accessibleModules.length > previousAccessibleCount ? 'The next section is now unlocked.' : 'You have completed this course.'
        }`;
        viewIndex = previousAccessibleCount < accessibleModules.length ? previousAccessibleCount : accessibleModules.length - 1;
        await showModuleContent();
      } else {
        sectionAssessmentResult.textContent = `Score: ${result.score}% — below the 60% pass threshold. Review the section (use Back) and try again when ready.`;
      }
    } catch (err) {
      sectionAssessmentResult.textContent = `Error: ${err.message}`;
    }
  }

  async function onNext() {
    const atLastAccessible = viewIndex === accessibleModules.length - 1;
    if (!atLastAccessible) {
      viewIndex += 1;
      await showModuleContent();
      return;
    }
    if (pendingSectionAssessment) {
      await showSectionAssessment();
    }
  }

  async function onPrev() {
    if (viewIndex > 0) {
      viewIndex -= 1;
      await showModuleContent();
    }
  }

  const MODULES_PER_SECTION = 3; // matches adaptive-engine.js's constant of the same name

  async function onCourseReady() {
    showOnly('app');
    renderProfileSummary();
    const mode = await window.BandwidthMonitor.startMonitoring();
    modeIndicator.textContent = `Delivery mode: ${mode}`;
    // Resume at the START of whichever section is currently pending
    // assessment (a fresh unlock, or a section left unfinished earlier) —
    // not the end, which would skip straight past unread content.
    viewIndex = pendingSectionAssessment ? accessibleModules.length - MODULES_PER_SECTION : 0;
    await showModuleContent();
  }

  window.addEventListener('bandwidthModeChanged', async (event) => {
    modeIndicator.textContent = `Delivery mode: ${event.detail.mode}`;
    if (enrollment && currentEnrollmentId && sectionAssessmentForm.hidden) {
      await showModuleContent();
    }
  });

  // ---------- Auth ----------

  async function register(event) {
    event.preventDefault();
    authError.textContent = '';
    const form = event.target;
    try {
      await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: form.email.value, password: form.password.value }),
      });
      await loadDashboard();
    } catch (err) {
      authError.textContent = err.message;
    }
  }

  async function login(event) {
    event.preventDefault();
    authError.textContent = '';
    const form = event.target;
    try {
      await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: form.email.value, password: form.password.value }),
      });
      await loadDashboard();
    } catch (err) {
      authError.textContent = err.message;
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    currentEnrollmentId = null;
    enrollment = null;
    localStorage.removeItem('lastEnrollmentId');
    showOnly('auth');
  }

  document.getElementById('register-form').addEventListener('submit', register);
  document.getElementById('login-form').addEventListener('submit', login);
  newCourseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const subject = document.getElementById('new-course-subject').value.trim();
    if (subject) startNewCourse(subject);
  });
  diagnosticForm.addEventListener('submit', submitDiagnostic);
  sectionAssessmentForm.addEventListener('submit', submitSectionAssessment);
  prevButton.addEventListener('click', onPrev);
  nextButton.addEventListener('click', onNext);
  document.getElementById('logout-button').addEventListener('click', logout);
  document.getElementById('logout-button-2').addEventListener('click', logout);
  backToDashboardButton.addEventListener('click', async () => {
    currentEnrollmentId = null;
    enrollment = null;
    localStorage.removeItem('lastEnrollmentId');
    await loadDashboard();
  });

  window.addEventListener('DOMContentLoaded', async () => {
    try {
      await api('/api/auth/me');
      const lastEnrollmentId = localStorage.getItem('lastEnrollmentId');
      if (lastEnrollmentId) {
        try {
          await openEnrollment(lastEnrollmentId);
          return;
        } catch (err) {
          localStorage.removeItem('lastEnrollmentId');
        }
      }
      await loadDashboard();
    } catch (err) {
      showOnly('auth');
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
})();
