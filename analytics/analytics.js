import { getTheme, setTheme, getUsageStats, getUsageEvents, clearUsageEvents, getLanguage } from '../lib/storage.js';
import { PROVIDER_PRICING, PROVIDER_CONFIGS } from '../lib/constants.js';
import { t, applyTranslations } from '../lib/i18n.js';

// DOM Elements
const backBtn = document.getElementById('back-btn');
const themeBtn = document.getElementById('theme-btn');
const totalCostEl = document.getElementById('total-cost');
const totalActionsEl = document.getElementById('total-actions');
const totalTokensEl = document.getElementById('total-tokens');
const topProviderEl = document.getElementById('top-provider');
const providerBreakdownEl = document.getElementById('provider-breakdown');
const actionBreakdownEl = document.getElementById('action-breakdown');
const timeChartEl = document.getElementById('time-chart');
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');

let currentLang = 'en';
let currentRange = 7;

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  currentLang = await getLanguage();
  applyTranslations(currentLang);
  await applyTheme();
  setupEventListeners();
  await loadAnalytics();
}

function setupEventListeners() {
  backBtn.addEventListener('click', (e) => {
    e.preventDefault();
    window.close();
  });

  themeBtn.addEventListener('click', async () => {
    const current = await getTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    await setTheme(next);
    applyThemeMode(next);
  });

  document.querySelectorAll('.time-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.time-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const range = tab.dataset.range;
      currentRange = range === 'all' ? 'all' : parseInt(range);
      renderTimeChart();
    });
  });

  exportBtn.addEventListener('click', handleExport);
  clearBtn.addEventListener('click', handleClear);
}

async function applyTheme() {
  const theme = await getTheme();
  applyThemeMode(theme);
}

function applyThemeMode(theme) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

// ============================================
// Data Loading & Aggregation
// ============================================

let allEvents = [];
let usageStats = null;

async function loadAnalytics() {
  [allEvents, usageStats] = await Promise.all([
    getUsageEvents(),
    getUsageStats()
  ]);
  renderAll();
}

function renderAll() {
  renderSummaryCards();
  renderProviderBreakdown();
  renderActionBreakdown();
  renderTimeChart();
}

// ============================================
// Cost Calculation
// ============================================

function calculateCost(provider, inputTokens, outputTokens) {
  const pricing = PROVIDER_PRICING[provider];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.inputPerMillion +
         (outputTokens / 1_000_000) * pricing.outputPerMillion;
}

function formatCost(cost) {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function formatNumber(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// ============================================
// Summary Cards
// ============================================

function renderSummaryCards() {
  const byProvider = aggregateByProvider(allEvents);

  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let topProv = { name: '-', count: 0 };

  for (const [provider, data] of Object.entries(byProvider)) {
    totalCost += calculateCost(provider, data.input, data.output);
    totalInput += data.input;
    totalOutput += data.output;
    if (data.count > topProv.count) {
      topProv = { name: PROVIDER_CONFIGS[provider]?.name || provider, count: data.count };
    }
  }

  // Include all-time stats if no events yet
  if (allEvents.length === 0 && usageStats) {
    totalInput = usageStats.totalInputTokens;
    totalOutput = usageStats.totalOutputTokens;
  }

  totalCostEl.textContent = formatCost(totalCost);
  totalActionsEl.textContent = formatNumber(allEvents.length);
  totalTokensEl.textContent = formatNumber(totalInput + totalOutput);
  topProviderEl.textContent = topProv.name;
}

// ============================================
// Provider Breakdown
// ============================================

function renderProviderBreakdown() {
  const byProvider = aggregateByProvider(allEvents);
  const providers = Object.entries(byProvider);

  if (providers.length === 0) {
    providerBreakdownEl.innerHTML = `<p class="empty-text" data-i18n="analyticsNoData">${t('analyticsNoData', currentLang)}</p>`;
    return;
  }

  const totalActions = allEvents.length;

  let html = `<table class="provider-table">
    <thead>
      <tr>
        <th>${t('analyticsProvider', currentLang)}</th>
        <th>${t('inputTokens', currentLang)}</th>
        <th>${t('outputTokens', currentLang)}</th>
        <th>${t('analyticsEstCost', currentLang)}</th>
        <th>%</th>
      </tr>
    </thead>
    <tbody>`;

  for (const [provider, data] of providers) {
    const cost = calculateCost(provider, data.input, data.output);
    const pct = totalActions > 0 ? ((data.count / totalActions) * 100).toFixed(0) : 0;
    const name = PROVIDER_CONFIGS[provider]?.name || provider;

    html += `<tr>
      <td><span class="provider-name"><span class="provider-dot ${provider}"></span>${name}</span></td>
      <td>${formatNumber(data.input)}</td>
      <td>${formatNumber(data.output)}</td>
      <td>${formatCost(cost)}</td>
      <td><span class="provider-pct">${pct}%</span></td>
    </tr>`;
  }

  html += '</tbody></table>';
  providerBreakdownEl.innerHTML = html;
}

// ============================================
// Action Breakdown
// ============================================

const ACTION_LABELS = {
  translate: 'Translate',
  polish: 'Polish',
  dictionary: 'Dictionary',
  document: 'Document',
  image: 'Image',
  grammar: 'Grammar',
  regenerate: 'Regenerate'
};

function renderActionBreakdown() {
  const byAction = aggregateByAction(allEvents);
  const actions = Object.entries(byAction).sort((a, b) => b[1].count - a[1].count);

  if (actions.length === 0) {
    actionBreakdownEl.innerHTML = `<p class="empty-text" data-i18n="analyticsNoData">${t('analyticsNoData', currentLang)}</p>`;
    return;
  }

  const maxCount = actions[0][1].count;

  let html = '<div class="action-bars">';
  for (const [action, data] of actions) {
    const pct = maxCount > 0 ? ((data.count / maxCount) * 100) : 0;
    const label = ACTION_LABELS[action] || action;
    html += `<div class="action-bar-row">
      <span class="action-bar-label">${label}</span>
      <div class="action-bar-track">
        <div class="action-bar-fill ${action}" style="width: ${Math.max(pct, 3)}%">
          ${pct > 15 ? `<span class="action-bar-count">${data.count}</span>` : ''}
        </div>
      </div>
      <span class="action-bar-value">${data.count}</span>
    </div>`;
  }
  html += '</div>';
  actionBreakdownEl.innerHTML = html;
}

// ============================================
// Time Chart
// ============================================

function renderTimeChart() {
  const days = currentRange === 'all' ? null : currentRange;
  const byDay = aggregateByDay(allEvents, days);
  const dayEntries = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));

  if (dayEntries.length === 0) {
    timeChartEl.innerHTML = `<p class="empty-text" data-i18n="analyticsNoData">${t('analyticsNoData', currentLang)}</p>`;
    return;
  }

  const maxActions = Math.max(...dayEntries.map(([, d]) => d.count), 1);
  let totalCost = 0;
  let totalTokens = 0;
  let totalCount = 0;

  for (const [, data] of dayEntries) {
    totalCost += data.cost;
    totalTokens += data.input + data.output;
    totalCount += data.count;
  }

  let barsHtml = '<div class="time-chart-bars">';
  for (const [day, data] of dayEntries) {
    const heightPct = (data.count / maxActions) * 100;
    const label = formatDayLabel(day);
    const tooltip = `${data.count} actions, ${formatCost(data.cost)}`;
    barsHtml += `<div class="time-bar-col">
      <div class="time-bar" style="height: ${Math.max(heightPct, 3)}%">
        <span class="bar-tooltip">${tooltip}</span>
      </div>
      <span class="time-bar-label">${label}</span>
    </div>`;
  }
  barsHtml += '</div>';

  const summaryHtml = `<div class="time-chart-summary">
    <span><strong>${totalCount}</strong> ${t('analyticsTotalActions', currentLang).toLowerCase()}</span>
    <span><strong>${formatNumber(totalTokens)}</strong> tokens</span>
    <span><strong>${formatCost(totalCost)}</strong> ${t('analyticsEstCost', currentLang).toLowerCase()}</span>
  </div>`;

  timeChartEl.innerHTML = barsHtml + summaryHtml;
}

function formatDayLabel(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today - date) / (24 * 60 * 60 * 1000));

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yest.';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// ============================================
// Aggregation Helpers
// ============================================

function aggregateByProvider(events) {
  const result = {};
  for (const e of events) {
    if (!result[e.p]) result[e.p] = { count: 0, input: 0, output: 0 };
    result[e.p].count++;
    result[e.p].input += e.i;
    result[e.p].output += e.o;
  }
  return result;
}

function aggregateByAction(events) {
  const result = {};
  for (const e of events) {
    if (!result[e.a]) result[e.a] = { count: 0, input: 0, output: 0 };
    result[e.a].count++;
    result[e.a].input += e.i;
    result[e.a].output += e.o;
  }
  return result;
}

function aggregateByDay(events, days) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const cutoff = days ? new Date(now.getTime() - days * 24 * 60 * 60 * 1000) : null;

  const result = {};

  // If filtering by days, pre-fill all days so chart has no gaps
  if (days) {
    for (let d = 0; d < days; d++) {
      const date = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
      const key = date.toISOString().slice(0, 10);
      result[key] = { count: 0, input: 0, output: 0, cost: 0 };
    }
  }

  for (const e of events) {
    if (cutoff && e.t < cutoff.getTime()) continue;
    const key = new Date(e.t).toISOString().slice(0, 10);
    if (!result[key]) result[key] = { count: 0, input: 0, output: 0, cost: 0 };
    result[key].count++;
    result[key].input += e.i;
    result[key].output += e.o;
    result[key].cost += calculateCost(e.p, e.i, e.o);
  }

  return result;
}

// ============================================
// Export & Clear
// ============================================

async function handleExport() {
  const events = await getUsageEvents();
  const stats = await getUsageStats();
  const data = { exportDate: new Date().toISOString(), stats, events };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `parsipad-analytics-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleClear() {
  if (!confirm(t('analyticsConfirmClear', currentLang) || 'Clear all analytics data? Cumulative stats will be preserved.')) {
    return;
  }
  await clearUsageEvents();
  allEvents = [];
  renderAll();
}
