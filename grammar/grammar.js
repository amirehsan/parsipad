import { getLanguage, addFavorite, isFavorite, removeFavorite, getTheme, setTheme } from '../lib/storage.js';
import { ACTIONS } from '../lib/constants.js';
import { t, applyTranslations } from '../lib/i18n.js';
import { setSafeInnerHTML } from '../lib/sanitize.js';

// DOM Elements
const themeToggle = document.getElementById('theme-toggle');
const backBtn = document.getElementById('back-btn');
const saveBtn = document.getElementById('save-btn');
const loadingSection = document.getElementById('loading-section');
const errorSection = document.getElementById('error-section');
const errorMessage = document.getElementById('error-message');
const retryBtn = document.getElementById('retry-btn');
const lessonContent = document.getElementById('lesson-content');
const originalTextEl = document.getElementById('original-text');
const translationTextEl = document.getElementById('translation-text');
const directionBadge = document.getElementById('direction-badge');
const grammarPointsSection = document.getElementById('grammar-points-section');
const relatedSection = document.getElementById('related-section');
const relatedTags = document.getElementById('related-tags');
const saveNotification = document.getElementById('save-notification');

// State
let currentLang = 'en';
let lessonData = null;
let originalText = '';
let translation = '';
let direction = '';
let isSaved = false;
let isSpeaking = false;

/**
 * Initialize the grammar page
 */
async function init() {
  initTheme();
  // Apply translations BEFORE making any section visible. The loading
  // section starts `hidden` in the HTML so the user never sees the English
  // fallback copy ("Creating grammar lesson...") flash before it's swapped
  // to Persian.
  await loadLanguage();
  setupEventListeners();
  parseUrlParams();

  // Initialize UI state
  updateSaveButton();

  await loadLesson();
}

/**
 * Initialize theme from chrome.storage (shared across all extension surfaces)
 * or system preference if unset.
 */
async function initTheme() {
  const html = document.documentElement;
  const theme = await getTheme();
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const useDark = theme === 'dark' || (theme === 'system' && prefersDark);
  html.classList.toggle('dark', useDark);
}

/**
 * Toggle dark/light theme; persisted to chrome.storage so popup/newtab/settings stay in sync.
 */
async function toggleTheme() {
  const html = document.documentElement;
  html.classList.toggle('dark');
  await setTheme(html.classList.contains('dark') ? 'dark' : 'light');
}

/**
 * Load and apply language preference
 */
async function loadLanguage() {
  currentLang = await getLanguage();
  applyTranslations(currentLang);
}

/**
 * Parse URL parameters
 */
function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  originalText = params.get('original') || '';
  translation = params.get('translation') || '';
  direction = params.get('direction') || 'en-to-fa';
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  themeToggle.addEventListener('click', toggleTheme);
  backBtn.addEventListener('click', () => window.close());
  saveBtn.addEventListener('click', handleSave);
  retryBtn.addEventListener('click', loadLesson);

  // Initialize TTS
  initTTS();
}

/**
 * Initialize Text-to-Speech functionality
 */
function initTTS() {
  // Check if SpeechSynthesis is supported
  if (!('speechSynthesis' in window)) {
    // Hide TTS buttons if not supported
    document.querySelectorAll('.tts-btn').forEach(btn => {
      btn.hidden = true;
    });
    return;
  }

  // Set up TTS button handlers (will be called after content loads)
  document.addEventListener('click', (e) => {
    const ttsBtn = e.target.closest('.tts-btn');
    if (!ttsBtn) return;

    const target = ttsBtn.dataset.target;
    let text = '';
    let lang = '';

    if (target === 'original') {
      text = originalText;
      // Original language: for en-to-fa, original is English; for fa-to-en, original is Persian
      lang = (direction === 'en-to-fa' || direction === 'en-fa') ? 'en' : 'fa';
    } else if (target === 'translation') {
      text = translation;
      // Translation language: for en-to-fa, translation is Persian; for fa-to-en, translation is English
      lang = (direction === 'en-to-fa' || direction === 'en-fa') ? 'fa' : 'en';
    }

    if (text) {
      speakText(text, lang, ttsBtn);
    }
  });
}

/**
 * Speak text using SpeechSynthesis API
 */
function speakText(text, lang, button) {
  // If already speaking, stop
  if (isSpeaking) {
    speechSynthesis.cancel();
    isSpeaking = false;
    updateTTSButtonState(button, false);
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'fa' ? 'fa-IR' : 'en-US';

  // Find a suitable voice
  const voices = speechSynthesis.getVoices();
  const langCode = lang === 'fa' ? 'fa' : 'en';
  const voice = voices.find(v => v.lang.startsWith(langCode));
  if (voice) {
    utterance.voice = voice;
  }

  utterance.onstart = () => {
    isSpeaking = true;
    updateTTSButtonState(button, true);
  };

  utterance.onend = () => {
    isSpeaking = false;
    updateTTSButtonState(button, false);
  };

  utterance.onerror = () => {
    isSpeaking = false;
    updateTTSButtonState(button, false);
  };

  speechSynthesis.speak(utterance);
}

/**
 * Update TTS button visual state
 */
function updateTTSButtonState(button, speaking) {
  if (!button) return;

  if (speaking) {
    button.classList.add('speaking');
    button.setAttribute('aria-pressed', 'true');
  } else {
    button.classList.remove('speaking');
    button.setAttribute('aria-pressed', 'false');
  }
}

/**
 * Load the grammar lesson
 */
async function loadLesson() {
  // Apply RTL direction to loading/error sections if content will be in Persian
  const contentIsRtl = direction === 'en-to-fa' || direction === 'en-fa';
  if (contentIsRtl) {
    loadingSection?.setAttribute('dir', 'rtl');
    errorSection?.setAttribute('dir', 'rtl');
  }

  showLoading();

  if (!originalText || !translation) {
    showError(t('enterTextTranslate', currentLang));
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: ACTIONS.GET_GRAMMAR_LESSON,
      originalText,
      translation,
      direction
    });

    if (response.error) {
      throw new Error(response.error);
    }

    lessonData = response.lesson;
    await checkIfSaved();
    renderLesson();
  } catch (error) {
    console.error('Failed to load grammar lesson:', error);
    // Translate known sentinel errors; pass through real errors verbatim.
    let msg = error.message;
    if (error.message === 'GRAMMAR_PARSE_FAILED') {
      msg = t('grammarParseFailed', currentLang)
        || 'We could not build a complete grammar lesson for this text. Try a shorter sentence or hit Try Again.';
    } else if (error.message === 'GRAMMAR_TIMEOUT') {
      msg = t('grammarTimeout', currentLang)
        || 'The grammar lesson took too long to generate. Try a shorter sentence or hit Try Again.';
    }
    showError(msg);
  }
}

/**
 * Check if lesson is already saved as favorite
 */
async function checkIfSaved() {
  const favoriteId = `grammar_${hashText(originalText + translation)}`;
  const favorite = await isFavorite(favoriteId);
  isSaved = !!favorite; // Convert to boolean
  updateSaveButton();
}

/**
 * Simple hash function for creating IDs
 */
function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ============================================================================
// Loading progress (status rotation + elapsed-time counter)
// ============================================================================
// The grammar request can take 30 s - 2 min. Instead of a static spinner we
// rotate through phase-style status messages and tick an elapsed counter so
// users see *something* moving. State is reset on every showLoading() call
// and torn down on showError() / showContent().

const LOADING_STATUS_KEYS = [
  'grammarLoadingStatus0', // Analyzing your sentence
  'grammarLoadingStatus1', // Identifying grammar patterns
  'grammarLoadingStatus2', // Building examples
  'grammarLoadingStatus3', // Creating quiz
  'grammarLoadingStatus4'  // Polishing the lesson
];
const LOADING_STATUS_INTERVAL_MS = 5000;
let loadingStatusTimer = null;
let loadingElapsedTimer = null;
let loadingStartedAt = 0;

function startLoadingProgress() {
  const statusEl = document.getElementById('loading-status-text');
  const elapsedEl = document.getElementById('loading-elapsed');
  if (!statusEl) return;

  stopLoadingProgress();
  loadingStartedAt = Date.now();
  let i = 0;
  const setStatus = () => {
    statusEl.textContent = t(LOADING_STATUS_KEYS[i % LOADING_STATUS_KEYS.length], currentLang)
      || 'Creating grammar lesson...';
  };
  setStatus();
  loadingStatusTimer = setInterval(() => { i += 1; setStatus(); }, LOADING_STATUS_INTERVAL_MS);

  if (elapsedEl) {
    elapsedEl.textContent = '';
    loadingElapsedTimer = setInterval(() => {
      const s = Math.floor((Date.now() - loadingStartedAt) / 1000);
      elapsedEl.textContent = s > 2 ? `${s}s` : '';
    }, 1000);
  }
}

function stopLoadingProgress() {
  if (loadingStatusTimer) { clearInterval(loadingStatusTimer); loadingStatusTimer = null; }
  if (loadingElapsedTimer) { clearInterval(loadingElapsedTimer); loadingElapsedTimer = null; }
}

/**
 * Show loading state
 */
function showLoading() {
  if (loadingSection) loadingSection.hidden = false;
  if (errorSection) errorSection.hidden = true;
  if (lessonContent) lessonContent.hidden = true;
  if (saveNotification) saveNotification.hidden = true;
  startLoadingProgress();
}

/**
 * Show error state
 */
function showError(message) {
  stopLoadingProgress();
  if (loadingSection) loadingSection.hidden = true;
  if (errorSection) errorSection.hidden = false;
  if (lessonContent) lessonContent.hidden = true;
  if (saveNotification) saveNotification.hidden = true;
  if (errorMessage) errorMessage.textContent = message;
}

/**
 * Show lesson content
 */
function showContent() {
  stopLoadingProgress();
  if (loadingSection) loadingSection.hidden = true;
  if (errorSection) errorSection.hidden = true;
  if (lessonContent) lessonContent.hidden = false;
}

/**
 * Render the lesson
 */
function renderLesson() {
  if (!lessonData) return;

  // Set source text
  originalTextEl.textContent = lessonData.originalText || originalText;
  translationTextEl.textContent = lessonData.translation || translation;

  // Set direction badge
  const displayDirection = (direction === 'en-to-fa' || direction === 'en-fa') ? 'EN → FA' : 'FA → EN';
  directionBadge.textContent = displayDirection;

  // Apply Persian font and RTL based on which text is actually in Persian
  // EN→FA: Original is English (LTR), Translation is Persian (RTL + Persian font)
  // FA→EN: Original is Persian (RTL + Persian font), Translation is English (LTR)
  if (direction === 'en-to-fa' || direction === 'en-fa') {
    // Original is English
    originalTextEl.classList.remove('persian-text');
    originalTextEl.removeAttribute('dir');
    // Translation is Persian
    translationTextEl.classList.add('persian-text');
    translationTextEl.setAttribute('dir', 'rtl');
  } else {
    // Original is Persian
    originalTextEl.classList.add('persian-text');
    originalTextEl.setAttribute('dir', 'rtl');
    // Translation is English
    translationTextEl.classList.remove('persian-text');
    translationTextEl.removeAttribute('dir');
  }

  // Set RTL direction on main content for grammar explanations
  // Grammar explanations are in the target language, so:
  // EN→FA: explanations in Persian (RTL)
  // FA→EN: explanations in English (LTR)
  const contentIsRtl = direction === 'en-to-fa' || direction === 'en-fa';
  if (contentIsRtl) {
    lessonContent.setAttribute('dir', 'rtl');
    loadingSection?.setAttribute('dir', 'rtl');
    errorSection?.setAttribute('dir', 'rtl');
    saveNotification?.setAttribute('dir', 'rtl');
  } else {
    lessonContent.removeAttribute('dir');
    loadingSection?.removeAttribute('dir');
    errorSection?.removeAttribute('dir');
    saveNotification?.removeAttribute('dir');
  }

  // Render grammar points
  renderGrammarPoints();

  // Render related patterns
  renderRelatedPatterns();

  showContent();
}

/**
 * Render grammar points
 */
function renderGrammarPoints() {
  grammarPointsSection.innerHTML = '';

  if (!lessonData.grammarPoints || lessonData.grammarPoints.length === 0) {
    return;
  }

  lessonData.grammarPoints.forEach((point, index) => {
    const pointEl = createGrammarPointElement(point, index + 1);
    grammarPointsSection.appendChild(pointEl);
  });
}

/**
 * Create a grammar point element
 */
function createGrammarPointElement(point, number) {
  const div = document.createElement('div');
  div.className = 'grammar-point';

  // Determine if content is RTL (Persian)
  const contentIsRtl = direction === 'en-to-fa' || direction === 'en-fa';

  const html = `
    <div class="grammar-point-header">
      <span class="grammar-point-number">${number}</span>
      <h3 class="grammar-point-title">${escapeHtml(point.title)}</h3>
      ${point.register ? createRegisterBadge(point.register) : ''}
    </div>
    <div class="grammar-point-content">
      <!-- Explanation -->
      <div class="explanation-section">
        <p class="explanation-text">${escapeHtml(point.explanation)}</p>
      </div>

      <!-- Register Info (if has alternative) -->
      ${point.register && point.register.alternative ? `
        <div class="register-info">
          <span class="register-note">${escapeHtml(point.register.note || '')}</span>
          ${point.register.alternative ? `
            <div class="register-alternative">
              <span class="register-alt-label">${contentIsRtl ? 'شکل دیگر:' : 'Alternative:'}</span>
              <span class="register-alt-text">${escapeHtml(point.register.alternative)}</span>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- Examples -->
      ${point.examples && point.examples.length > 0 ? `
        <div class="examples-section">
          <h4 class="section-title">
            <svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
            <span data-i18n="examples">${t('examples', currentLang)}</span>
          </h4>
          <div class="examples-list">
            ${point.examples.map(ex => `
              <div class="example-item">
                <div class="example-source">${highlightText(escapeHtml(ex.source), ex.highlight)}</div>
                <div class="example-target">
                  ${highlightText(escapeHtml(ex.target), ex.highlight)}
                  ${ex.transliteration ? `<span class="transliteration">${escapeHtml(ex.transliteration)}</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Compare & Contrast (Collapsible) -->
      ${point.compareContrast ? createCollapsibleSection(
        t('compareContrast', currentLang),
        `<div class="compare-table">
          <div class="compare-column">
            <div class="compare-label" data-i18n="sourceLanguage">${t('sourceLanguage', currentLang)}</div>
            <div class="compare-text">${escapeHtml(point.compareContrast.sourceLanguage)}</div>
          </div>
          <div class="compare-column">
            <div class="compare-label" data-i18n="targetLanguage">${t('targetLanguage', currentLang)}</div>
            <div class="compare-text">${escapeHtml(point.compareContrast.targetLanguage)}</div>
          </div>
        </div>`,
        'compare',
        true
      ) : ''}

      <!-- Common Mistakes (Collapsible) -->
      ${point.commonMistakes && point.commonMistakes.length > 0 ? createCollapsibleSection(
        t('commonMistakes', currentLang),
        `<div class="mistakes-list">
          ${point.commonMistakes.map(mistake => `
            <div class="mistake-item">
              <svg class="mistake-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              <span>${escapeHtml(mistake)}</span>
            </div>
          `).join('')}
        </div>`,
        'mistakes',
        true
      ) : ''}

      <!-- Quiz -->
      ${point.quiz ? createQuizHTML(point.quiz, number) : ''}
    </div>
  `;
  setSafeInnerHTML(div, html);

  // Set up quiz interactions
  if (point.quiz) {
    setTimeout(() => setupQuizInteractions(div, point.quiz, number), 0);
  }

  return div;
}

/**
 * Create register badge HTML
 */
function createRegisterBadge(register) {
  if (!register || !register.level) return '';

  const levelLabels = {
    formal: { en: 'Formal', fa: 'رسمی' },
    informal: { en: 'Informal', fa: 'محاوره‌ای' },
    neutral: { en: 'Neutral', fa: 'معمولی' }
  };

  const contentIsRtl = direction === 'en-to-fa' || direction === 'en-fa';
  const label = contentIsRtl
    ? levelLabels[register.level]?.fa || register.level
    : levelLabels[register.level]?.en || register.level;

  return `<span class="register-badge register-${register.level}" title="${escapeHtml(register.note || '')}">${label}</span>`;
}

/**
 * Create collapsible section HTML
 */
function createCollapsibleSection(title, content, type, defaultOpen = true) {
  const iconMap = {
    compare: `<svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
    </svg>`,
    mistakes: `<svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
    </svg>`
  };

  return `
    <details class="collapsible-section collapsible-${type}" ${defaultOpen ? 'open' : ''}>
      <summary class="collapsible-header">
        <div class="collapsible-title">
          ${iconMap[type] || ''}
          <span>${title}</span>
        </div>
        <svg class="collapsible-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </summary>
      <div class="collapsible-content">
        ${content}
      </div>
    </details>
  `;
}

/**
 * Create quiz HTML
 */
function createQuizHTML(quiz, pointNumber) {
  // Handle both old format (string options) and new format (object options with explanations)
  const getOptionText = (option) => {
    if (typeof option === 'string') return option;
    return option.text || '';
  };

  const getOptionExplanation = (option) => {
    if (typeof option === 'string') return '';
    return option.explanation || '';
  };

  return `
    <div class="quiz-section" data-quiz="${pointNumber}">
      <h4 class="section-title">
        <svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span data-i18n="practiceQuiz">${t('practiceQuiz', currentLang)}</span>
      </h4>
      <p class="quiz-question">${escapeHtml(quiz.question)}</p>
      <div class="quiz-options">
        ${quiz.options.map((option, idx) => `
          <div class="quiz-option" data-index="${idx}" data-explanation="${escapeHtml(getOptionExplanation(option))}">
            <span class="quiz-radio"></span>
            <span class="quiz-option-text">${escapeHtml(getOptionText(option))}</span>
          </div>
        `).join('')}
      </div>
      <div class="quiz-actions">
        <button class="btn btn-primary check-answer-btn" data-i18n="checkAnswer">${t('checkAnswer', currentLang)}</button>
        <button class="btn btn-secondary try-again-btn" hidden data-i18n="tryAgain">${t('tryAgain', currentLang)}</button>
      </div>
      <div class="quiz-feedback" hidden></div>
    </div>
  `;
}

/**
 * Set up quiz interactions
 */
function setupQuizInteractions(container, quiz, pointNumber) {
  const quizSection = container.querySelector(`[data-quiz="${pointNumber}"]`);
  if (!quizSection) return;

  const options = quizSection.querySelectorAll('.quiz-option');
  const checkBtn = quizSection.querySelector('.check-answer-btn');
  const tryAgainBtn = quizSection.querySelector('.try-again-btn');
  const feedback = quizSection.querySelector('.quiz-feedback');

  let selectedIndex = -1;
  let answered = false;

  // Option selection
  options.forEach((option, idx) => {
    option.addEventListener('click', () => {
      if (answered) return;

      options.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      selectedIndex = idx;
    });
  });

  // Check answer
  checkBtn.addEventListener('click', () => {
    if (selectedIndex === -1 || answered) return;

    answered = true;
    const isCorrect = selectedIndex === quiz.correctIndex;

    // Get the explanation for the selected option
    const selectedOption = options[selectedIndex];
    const selectedExplanation = selectedOption?.dataset.explanation || '';

    // Get the explanation for the correct option (for wrong answers)
    const correctOption = options[quiz.correctIndex];
    const correctExplanation = correctOption?.dataset.explanation || '';

    options.forEach((option, idx) => {
      option.classList.remove('selected');
      if (idx === quiz.correctIndex) {
        option.classList.add('correct');
      } else if (idx === selectedIndex && !isCorrect) {
        option.classList.add('incorrect');
      }
    });

    feedback.hidden = false;
    feedback.className = `quiz-feedback ${isCorrect ? 'correct' : 'incorrect'}`;

    // Use per-option explanation if available, otherwise fall back to global explanation
    let explanationText = '';
    if (isCorrect) {
      // For correct answer: show the correct option's explanation or global explanation
      explanationText = selectedExplanation || quiz.explanation || '';
    } else {
      // For wrong answer: show why the selected answer is wrong, then why the correct one is right
      if (selectedExplanation) {
        explanationText = selectedExplanation;
        if (correctExplanation) {
          explanationText += `<br><br><strong>${t('correctAnswer', currentLang) || 'Correct answer'}:</strong> ${escapeHtml(correctExplanation)}`;
        }
      } else {
        // Fall back to global explanation
        explanationText = quiz.explanation || '';
      }
    }

    feedback.innerHTML = `
      <strong>${isCorrect ? t('correct', currentLang) : t('incorrect', currentLang)}</strong>
      <div class="quiz-explanation">${explanationText}</div>
    `;

    checkBtn.hidden = true;
    if (!isCorrect) {
      tryAgainBtn.hidden = false;
    }
  });

  // Try again
  tryAgainBtn.addEventListener('click', () => {
    answered = false;
    selectedIndex = -1;

    options.forEach(option => {
      option.classList.remove('selected', 'correct', 'incorrect');
    });

    feedback.hidden = true;
    checkBtn.hidden = false;
    tryAgainBtn.hidden = true;
  });
}

/**
 * Render related patterns
 */
function renderRelatedPatterns() {
  if (!lessonData.relatedPatterns || lessonData.relatedPatterns.length === 0) {
    relatedSection.hidden = true;
    return;
  }

  relatedSection.hidden = false;
  relatedTags.innerHTML = '';

  lessonData.relatedPatterns.forEach(pattern => {
    const tag = document.createElement('span');
    tag.className = 'related-tag';
    tag.textContent = pattern;
    relatedTags.appendChild(tag);
  });
}

/**
 * Handle save button click
 */
async function handleSave() {
  if (!lessonData) return;

  const favoriteId = `grammar_${hashText(originalText + translation)}`;

  try {
    if (isSaved) {
      await removeFavorite(favoriteId);
      isSaved = false;
    } else {
      await addFavorite({
        id: favoriteId,
        type: 'grammar',
        originalText: originalText,
        savedText: translation,
        lesson: {
          title: lessonData.lessonTitle,
          points: lessonData.grammarPoints,
          relatedPatterns: lessonData.relatedPatterns
        },
        direction: direction,
        timestamp: Date.now()
      });
      isSaved = true;
      showSaveNotification();
    }

    updateSaveButton();
  } catch (error) {
    console.error('Failed to save lesson:', error);
  }
}

/**
 * Update save button state
 */
function updateSaveButton() {
  if (!saveBtn) return;

  const starOutline = saveBtn.querySelector('.star-outline');
  const starFilled = saveBtn.querySelector('.star-filled');

  if (isSaved) {
    if (starOutline) starOutline.style.display = 'none';
    if (starFilled) starFilled.style.display = 'block';
    saveBtn.title = t('removeFromFavorites', currentLang) || 'Remove from favorites';
  } else {
    if (starOutline) starOutline.style.display = 'block';
    if (starFilled) starFilled.style.display = 'none';
    saveBtn.title = t('saveLesson', currentLang) || 'Save lesson';
  }
}

/**
 * Show save notification
 */
function showSaveNotification() {
  saveNotification.hidden = false;

  setTimeout(() => {
    saveNotification.hidden = true;
  }, 2500);
}

/**
 * Highlight text in a string
 */
function highlightText(text, highlight) {
  if (!highlight) return text;

  const escapedHighlight = escapeHtml(highlight);
  const regex = new RegExp(`(${escapeRegExp(escapedHighlight)})`, 'gi');
  return text.replace(regex, '<span class="highlight">$1</span>');
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
