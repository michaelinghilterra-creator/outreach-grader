const state = {
  recipient_level: null,
  recipient_function: null,
  industry: null,
  channel: null,
  cta_type: null,
  gradeResult: null,
  model: 'sonnet',
};

const $ = (selector) => document.querySelector(selector);

function clearResults() {
  state.gradeResult = null;
  $('#resultsContent').hidden = true;
  $('#coachingPanel').hidden = true;
  $('#emptyState').hidden = false;
}

function onChannelChange(channel) {
  $('#subjectLineGroup').hidden = channel !== 'cold_email';
  $('#charCounter').hidden = channel !== 'linkedin_connection';
  const placeholders = {
    cold_email: 'Paste your cold email body here (not including the subject line)...',
    linkedin_connection: 'Write your connection request note (300 character limit)...',
    linkedin_dm: 'Paste your LinkedIn DM or InMail message here...',
  };
  $('#messageText').placeholder = placeholders[channel];
  $('#charCount').textContent = $('#messageText').value.length;
  $('#charCounter').classList.toggle('over-limit', $('#messageText').value.length > 295);
  clearResults();
}

function validateInputs() {
  if (!state.recipient_level) return 'Select a recipient level.';
  if (!state.recipient_function) return 'Select a recipient function.';
  if (!state.channel) return 'Select a channel.';
  if (!state.cta_type) return 'Select a goal.';
  if (!$('#messageText').value.trim()) return 'Enter a message to grade.';
  if (state.channel === 'cold_email' && !$('#subjectLine').value.trim()) return 'Enter a subject line.';
  return null;
}

function requestBody() {
  const body = {
    message: $('#messageText').value.trim(),
    recipient_level: state.recipient_level,
    recipient_function: state.recipient_function,
    industry: state.industry,
    channel: state.channel,
    cta_type: state.cta_type,
    model: state.model,
  };
  if (state.channel === 'cold_email') body.subject_line = $('#subjectLine').value.trim();
  return body;
}

function showError(message) {
  $('#inputError').textContent = message;
  $('#inputError').hidden = false;
}

async function postJSON(url, body) {
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

async function handleGrade() {
  const error = validateInputs();
  if (error) return showError(error);
  $('#inputError').hidden = true;
  const button = $('#gradeBtn');
  button.disabled = true;
  button.textContent = 'Grading...';
  try {
    const data = await postJSON('/api/grade', requestBody());
    state.gradeResult = data;
    renderResults(data);
  } catch (err) {
    showError(err.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Grade my message';
  }
}

function scoreColor(score, overall = false) {
  if (score < (overall ? 40 : 4)) return 'var(--score-low)';
  if (score < (overall ? 70 : 7)) return 'var(--score-mid)';
  return 'var(--score-high)';
}

function scoreDimColor(score) {
  if (score < 4) return 'var(--score-low)';
  if (score < 7) return 'var(--score-mid)';
  return 'var(--score-high)';
}

function animateCount(el, target, color) {
  const duration = 1200;
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const value = Math.round(ease * target);
    el.textContent = value;
    if (t < 1) requestAnimationFrame(step);
    else { el.textContent = target; el.style.color = color; }
  }
  el.textContent = '0';
  requestAnimationFrame(step);
}

function renderResults(data) {
  $('#emptyState').hidden = true;
  $('#resultsContent').hidden = false;
  const overallColor = scoreColor(data.overall_score, true);
  $('#scoreLabel').textContent = data.overall_label;

  const ring = $('#ringFill');
  const circumference = 414.7;
  ring.style.stroke = overallColor;
  ring.style.strokeDashoffset = String(circumference);
  setTimeout(() => {
    ring.style.strokeDashoffset = String(circumference * (1 - data.overall_score / 100));
  }, 60);

  const scoreEl = $('#scoreNumber');
  scoreEl.style.color = 'var(--text-dim)';
  setTimeout(() => animateCount(scoreEl, data.overall_score, overallColor), 100);

  const grid = $('#dimensionsGrid');
  grid.replaceChildren();
  data.dimensions.forEach((dimension, i) => {
    const card = document.createElement('div');
    card.className = 'dimension-card';
    const color = scoreDimColor(dimension.score);
    card.style.borderLeftColor = color;

    const header = document.createElement('div');
    header.className = 'dim-header';
    const name = document.createElement('span');
    name.className = 'dim-name'; name.textContent = dimension.name;
    const score = document.createElement('span');
    score.className = 'dim-score'; score.textContent = `${dimension.score}/10`;
    score.style.color = color;
    header.append(name, score);

    const bar = document.createElement('div'); bar.className = 'dim-bar';
    const fill = document.createElement('div'); fill.className = 'dim-bar-fill'; fill.style.background = color;
    bar.append(fill);

    const note = document.createElement('div'); note.className = 'dim-note'; note.textContent = dimension.explanation;
    card.append(header, bar, note);
    grid.append(card);

    setTimeout(() => {
      card.classList.add('visible');
      requestAnimationFrame(() => { fill.style.width = `${Math.max(0, Math.min(10, dimension.score)) * 10}%`; });
    }, 80 + i * 60);
  });

  const fixes = $('#fixesList'); fixes.replaceChildren();
  data.top_fixes.forEach((fix, index) => {
    const item = document.createElement('li');
    const number = document.createElement('span'); number.className = 'fix-num'; number.textContent = `0${index + 1}`;
    const text = document.createElement('span'); text.textContent = fix;
    item.append(number, text); fixes.append(item);
  });
}

async function handleRewrite() {
  const button = $('#rewriteBtn');
  button.disabled = true; button.textContent = 'Rewriting...';
  try {
    const body = requestBody();
    body.score_result = {
      overall_score: state.gradeResult.overall_score,
      top_fixes: state.gradeResult.top_fixes,
    };
    const data = await postJSON('/api/rewrite', body);

    // Subject line
    const subjectRow = $('#coachSubjectRow');
    subjectRow.hidden = !data.subject_line;
    $('#coachSubject').textContent = data.subject_line || '';

    // Body
    $('#coachBody').textContent = data.rewritten_message || '';

    // What we changed
    const changesEl = $('#coachChanges');
    changesEl.replaceChildren();
    (data.changes_made || []).forEach((change) => {
      const item = document.createElement('div');
      item.className = 'coaching-change-item';
      item.textContent = change;
      changesEl.append(item);
    });

    // Carry forward — rephrase top_fixes as rules
    const lessonsEl = $('#coachLessons');
    lessonsEl.replaceChildren();
    (state.gradeResult.top_fixes || []).forEach((fix, i) => {
      const item = document.createElement('div');
      item.className = 'coaching-lesson-item';
      const num = document.createElement('span'); num.className = 'lesson-num'; num.textContent = `0${i + 1}`;
      const text = document.createElement('span'); text.className = 'lesson-text'; text.textContent = fix;
      item.append(num, text);
      lessonsEl.append(item);
    });

    // Transition: hide score/dims/fixes, show coaching panel
    $('#resultsContent').hidden = true;
    $('#coachingPanel').hidden = false;
  } catch (err) {
    showError(err.message);
  } finally {
    button.disabled = false; button.textContent = 'Rewrite this for me';
  }
}

async function copyBody() {
  await navigator.clipboard.writeText($('#coachBody').textContent);
  const button = $('#copyBtn'); button.textContent = 'Copied!';
  setTimeout(() => { button.textContent = 'Copy body'; }, 1500);
}

async function copySubject() {
  await navigator.clipboard.writeText($('#coachSubject').textContent);
  const button = $('#copySubjectBtn'); button.textContent = 'Copied!';
  setTimeout(() => { button.textContent = 'Copy'; }, 1500);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.pills').forEach((group) => {
    group.querySelectorAll('.pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const field = group.dataset.field;
        const selected = pill.getAttribute('aria-checked') === 'true';
        group.querySelectorAll('.pill').forEach((sibling) => sibling.setAttribute('aria-checked', 'false'));
        if (field === 'industry' && selected) {
          state.industry = null;
        } else {
          pill.setAttribute('aria-checked', 'true');
          state[field] = pill.dataset.value;
        }
        if (field === 'channel') onChannelChange(state.channel);
        if (field === 'model') {
          const hint = $('#modelHint');
          if (hint) hint.textContent = modelHints[state.model] || '';
        }
      });
    });
  });
  $('#messageText').addEventListener('input', () => {
    if (state.channel === 'linkedin_connection') {
      const length = $('#messageText').value.length;
      $('#charCount').textContent = length;
      $('#charCounter').classList.toggle('over-limit', length > 295);
    }
  });
  const modelHints = {
    sonnet: 'Fast, great for everyday outreach.',
    opus: 'Deeper analysis — best for high-stakes deals.',
  };
  $('#gradeBtn').addEventListener('click', handleGrade);
  $('#rewriteBtn').addEventListener('click', handleRewrite);
  $('#copyBtn').addEventListener('click', copyBody);
  $('#copySubjectBtn')?.addEventListener('click', copySubject);
  function resetForm() {
    clearResults();
    $('#gradeBtn').disabled = false;
    $('#messageText').value = '';
    $('#subjectLine').value = '';
    $('#gradeBtn').textContent = 'Grade my message';
  }
  $('#gradeAgainBtn').addEventListener('click', resetForm);
  $('#gradeAgainBtn2').addEventListener('click', resetForm);
});
