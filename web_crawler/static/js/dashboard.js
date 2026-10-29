/**
 * Antigravity Web Crawler - Modern Dashboard Logic
 * Handles real-time SSE streaming, markdown rendering, tool telemetry,
 * source extraction, and session history management.
 */

// Application State
const state = {
  currentTaskId: null,
  eventSource: null,
  timerInterval: null,
  startTime: null,
  activeMode: 'deep',
  activeTab: 'dossier',
  currentStreamText: '',
  activeResult: null,
  history: [],
  systemConfig: {
    apiKeyConfigured: false,
    currentModel: 'gemini-2.5-flash',
  }
};

// DOM Element References
const elements = {
  // Navigation & Badges
  agentStatusPill: document.getElementById('agentStatusPill'),
  agentStatusText: document.getElementById('agentStatusText'),
  modelSelector: document.getElementById('modelSelector'),
  apiKeyPill: document.getElementById('apiKeyPill'),
  apiKeyStatusText: document.getElementById('apiKeyStatusText'),
  historyDrawerBtn: document.getElementById('historyDrawerBtn'),
  historyCountBadge: document.getElementById('historyCountBadge'),
  settingsBtn: document.getElementById('settingsBtn'),

  // Crawl Input & Options
  crawlForm: document.getElementById('crawlForm'),
  crawlQueryInput: document.getElementById('crawlQueryInput'),
  clearQueryBtn: document.getElementById('clearQueryBtn'),
  startCrawlBtn: document.getElementById('startCrawlBtn'),
  modeTabs: document.querySelectorAll('.mode-tab'),
  advancedOptionsToggle: document.getElementById('advancedOptionsToggle'),
  advancedOptionsPanel: document.getElementById('advancedOptionsPanel'),
  presetChips: document.querySelectorAll('.preset-chip'),

  // Tool checkboxes
  toolCheckboxes: {
    search_web: document.getElementById('toolSearchWeb'),
    read_url_content: document.getElementById('toolReadUrl'),
    view_file: document.getElementById('toolViewFile'),
    create_file: document.getElementById('toolCreateFile'),
  },

  // Stats & Telemetry
  statSourcesVisited: document.getElementById('statSourcesVisited'),
  statAvgLatency: document.getElementById('statAvgLatency'),
  telemetrySection: document.getElementById('telemetrySection'),
  telemetryStatusTitle: document.getElementById('telemetryStatusTitle'),
  telemetryStatusSub: document.getElementById('telemetryStatusSub'),
  timerValue: document.getElementById('timerValue'),
  toolCountValue: document.getElementById('toolCountValue'),
  tokenCountValue: document.getElementById('tokenCountValue'),
  toolActivityList: document.getElementById('toolActivityList'),

  // Pipeline steps
  steps: {
    1: document.getElementById('step1'),
    2: document.getElementById('step2'),
    3: document.getElementById('step3'),
    4: document.getElementById('step4'),
    5: document.getElementById('step5'),
  },
  connectors: {
    1: document.getElementById('connector1'),
    2: document.getElementById('connector2'),
    3: document.getElementById('connector3'),
    4: document.getElementById('connector4'),
  },

  // Results & Tabs
  welcomeSection: document.getElementById('welcomeSection'),
  resultsSection: document.getElementById('resultsSection'),
  resultTabs: document.querySelectorAll('.result-tab'),
  tabPanes: {
    dossier: document.getElementById('tabDossier'),
    sources: document.getElementById('tabSources'),
    telemetry: document.getElementById('tabTelemetry'),
    raw: document.getElementById('tabRaw'),
  },
  resultQueryTitle: document.getElementById('resultQueryTitle'),
  resultModelBadge: document.getElementById('resultModelBadge'),
  resultModeBadge: document.getElementById('resultModeBadge'),
  resultTimestamp: document.getElementById('resultTimestamp'),
  markdownRenderArea: document.getElementById('markdownRenderArea'),
  citationSummary: document.getElementById('citationSummary'),
  sourcesGrid: document.getElementById('sourcesGrid'),
  sourceCountBadge: document.getElementById('sourceCountBadge'),
  rawMarkdownTextarea: document.getElementById('rawMarkdownTextarea'),

  // Audit Tab
  auditLatency: document.getElementById('auditLatency'),
  auditPromptTokens: document.getElementById('auditPromptTokens'),
  auditOutputTokens: document.getElementById('auditOutputTokens'),
  auditTotalTokens: document.getElementById('auditTotalTokens'),
  auditTableBody: document.getElementById('auditTableBody'),

  // Action Buttons
  copyMarkdownBtn: document.getElementById('copyMarkdownBtn'),
  downloadMarkdownBtn: document.getElementById('downloadMarkdownBtn'),
  printReportBtn: document.getElementById('printReportBtn'),

  // History Drawer
  historyDrawer: document.getElementById('historyDrawer'),
  drawerBackdrop: document.getElementById('drawerBackdrop'),
  closeDrawerBtn: document.getElementById('closeDrawerBtn'),
  historySubtitle: document.getElementById('historySubtitle'),
  historySearchInput: document.getElementById('historySearchInput'),
  historyList: document.getElementById('historyList'),
  clearAllHistoryBtn: document.getElementById('clearAllHistoryBtn'),

  // Settings Modal
  settingsModal: document.getElementById('settingsModal'),
  closeSettingsModalBtn: document.getElementById('closeSettingsModalBtn'),
  settingsApiKeyInput: document.getElementById('settingsApiKeyInput'),
  toggleKeyVisibilityBtn: document.getElementById('toggleKeyVisibilityBtn'),
  settingsModelSelect: document.getElementById('settingsModelSelect'),
  testKeyBtn: document.getElementById('testKeyBtn'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  keyTestResult: document.getElementById('keyTestResult'),

  // Footer & Toast
  footerHelpBtn: document.getElementById('footerHelpBtn'),
  toastContainer: document.getElementById('toastContainer'),
};

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  fetchSystemStatus();
  fetchHistory();
});

// Configure Marked.js options if available
if (window.marked) {
  marked.setOptions({
    gfm: true,
    breaks: true,
    highlight: function(code, lang) {
      if (window.hljs && lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (err) {}
      }
      return code;
    }
  });
}

// Fallback Markdown parser for reliable rendering in all environments
function fallbackMarkdownParse(md) {
  if (!md) return '';
  let html = md
    // Escaping
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Code blocks
    .replace(/```([a-zA-Z0-9_]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code class="language-${lang}">${code}</code></pre>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold & italic
    .replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^\*]+)\*/g, '<em>$1</em>')
    // Blockquotes
    .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
    // Unordered lists
    .replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>')
    .replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Paragraphs
    .replace(/\n\n/g, '<br><br>');
  
  // Clean up nested ul tags
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  return html;
}

function renderMarkdownSafely(text) {
  if (window.marked && typeof window.marked.parse === 'function') {
    try {
      return marked.parse(text);
    } catch (e) {
      console.warn('Marked parse error, using fallback:', e);
    }
  }
  return fallbackMarkdownParse(text);
}

// ==========================================================================
// EVENT LISTENERS SETUP
// ==========================================================================
function setupEventListeners() {
  // Crawl Form Submit
  elements.crawlForm.addEventListener('submit', (e) => {
    e.preventDefault();
    initiateCrawl();
  });

  // Query Input Typing / Clear
  elements.crawlQueryInput.addEventListener('input', (e) => {
    elements.clearQueryBtn.style.display = e.target.value.trim() ? 'flex' : 'none';
  });

  elements.clearQueryBtn.addEventListener('click', () => {
    elements.crawlQueryInput.value = '';
    elements.clearQueryBtn.style.display = 'none';
    elements.crawlQueryInput.focus();
  });

  // Research Mode Selector Tabs
  elements.modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      elements.modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeMode = tab.dataset.mode;
    });
  });

  // Advanced Options (Tool filters)
  elements.advancedOptionsToggle.addEventListener('click', () => {
    const isVisible = elements.advancedOptionsPanel.style.display !== 'none';
    elements.advancedOptionsPanel.style.display = isVisible ? 'none' : 'block';
    elements.advancedOptionsToggle.classList.toggle('active', !isVisible);
  });

  // Preset Chips
  elements.presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.dataset.query;
      elements.crawlQueryInput.value = q;
      elements.clearQueryBtn.style.display = 'flex';
      initiateCrawl();
    });
  });

  // Model Selector
  elements.modelSelector.addEventListener('change', (e) => {
    state.systemConfig.currentModel = e.target.value;
    updateSettingsOnServer({ model: e.target.value });
  });

  // Results Tab Switching
  elements.resultTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      switchTab(target);
    });
  });

  // Copy Markdown
  elements.copyMarkdownBtn.addEventListener('click', copyMarkdownToClipboard);

  // Download Markdown
  elements.downloadMarkdownBtn.addEventListener('click', downloadMarkdownFile);

  // Print Report
  elements.printReportBtn.addEventListener('click', () => window.print());

  // History Drawer
  elements.historyDrawerBtn.addEventListener('click', openHistoryDrawer);
  elements.closeDrawerBtn.addEventListener('click', closeHistoryDrawer);
  elements.drawerBackdrop.addEventListener('click', closeHistoryDrawer);
  elements.clearAllHistoryBtn.addEventListener('click', clearAllHistory);
  elements.historySearchInput.addEventListener('input', filterHistoryItems);

  // Settings Modal
  elements.settingsBtn.addEventListener('click', openSettingsModal);
  elements.apiKeyPill.addEventListener('click', openSettingsModal);
  elements.closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) closeSettingsModal();
  });
  elements.toggleKeyVisibilityBtn.addEventListener('click', toggleKeyVisibility);
  elements.testKeyBtn.addEventListener('click', testApiKeyConnection);
  elements.saveSettingsBtn.addEventListener('click', saveModalSettings);
  elements.footerHelpBtn.addEventListener('click', openSettingsModal);
}

// ==========================================================================
// CRAWL EXECUTION & STREAMING
// ==========================================================================
async function initiateCrawl() {
  const query = elements.crawlQueryInput.value.trim();
  if (!query) {
    showToast('Please enter a research topic or query', 'info');
    return;
  }

  // Collect selected tools
  const selectedTools = [];
  for (const [key, checkbox] of Object.entries(elements.toolCheckboxes)) {
    if (checkbox.checked) selectedTools.push(key);
  }

  // Update UI for starting
  setButtonLoading(true);
  updateAgentStatus('crawling', 'Crawling Web...');
  resetPipeline();
  setPipelineStep(1, 'active');

  elements.welcomeSection.style.display = 'none';
  elements.telemetrySection.style.display = 'block';
  elements.resultsSection.style.display = 'block';
  switchTab('dossier');

  // Reset metrics
  startTimer();
  elements.toolCountValue.textContent = '0';
  elements.tokenCountValue.textContent = '-';
  elements.toolActivityList.innerHTML = '';
  elements.markdownRenderArea.innerHTML = `
    <div class="shimmer-placeholder">
      <div class="shimmer-line l1"></div>
      <div class="shimmer-line l2"></div>
      <div class="shimmer-line l3"></div>
    </div>
  `;
  elements.resultQueryTitle.textContent = query;
  elements.resultModelBadge.textContent = state.systemConfig.currentModel;
  elements.resultModeBadge.textContent = state.activeMode;
  elements.resultTimestamp.textContent = 'Streaming live...';
  state.currentStreamText = '';
  state.activeResult = null;
  elements.citationSummary.hidden = true;

  try {
    const response = await fetch('/api/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query,
        model: state.systemConfig.currentModel,
        mode: state.activeMode,
        tools: selectedTools,
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to start crawl.');
    }

    state.currentTaskId = data.task_id;
    startEventStream(data.task_id);

  } catch (err) {
    console.error('Crawl error:', err);
    setButtonLoading(false);
    stopTimer();
    updateAgentStatus('ready', 'Agent Ready');
    showToast(err.message || 'Crawl failed to start', 'error');
    elements.markdownRenderArea.innerHTML = `
      <div style="color: var(--accent-rose); padding: 18px; border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 8px; background: rgba(244, 63, 94, 0.08);">
        <strong>Error:</strong> ${err.message}<br><br>
        <em>Please ensure your GEMINI_API_KEY is configured in Settings or .env file.</em>
      </div>
    `;
  }
}

function startEventStream(taskId) {
  if (state.eventSource) {
    state.eventSource.close();
  }

  const sseUrl = `/api/crawl/${taskId}/stream`;
  const es = new EventSource(sseUrl);
  state.eventSource = es;

  let toolCount = 0;

  es.addEventListener('status', (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.step === 'initializing') {
        setPipelineStep(1, 'active');
      } else if (data.step === 'searching') {
        setPipelineStep(1, 'completed');
        setPipelineStep(2, 'active');
        elements.telemetryStatusTitle.textContent = 'Searching Web with Google';
        elements.telemetryStatusSub.textContent = data.message || 'Formulating search queries...';
      } else if (data.step === 'synthesizing') {
        setPipelineStep(2, 'completed');
        setPipelineStep(3, 'completed');
        setPipelineStep(4, 'active');
        elements.telemetryStatusTitle.textContent = 'Synthesizing Findings';
        elements.telemetryStatusSub.textContent = 'Deep reasoning & formatting structured dossier...';
      }
    } catch (err) {}
  });

  es.addEventListener('tool_start', (e) => {
    try {
      const data = JSON.parse(e.data);
      toolCount++;
      elements.toolCountValue.textContent = toolCount;

      if (data.tool === 'read_url_content') {
        setPipelineStep(2, 'completed');
        setPipelineStep(3, 'active');
        elements.telemetryStatusTitle.textContent = 'Scraping Web Content';
        elements.telemetryStatusSub.textContent = 'Reading and converting URL HTML to markdown...';
      }

      addToolActivityRow(data);
    } catch (err) {}
  });

  es.addEventListener('tool_complete', (e) => {
    try {
      const data = JSON.parse(e.data);
      updateToolActivityRow(data);
    } catch (err) {}
  });

  es.addEventListener('token', (e) => {
    try {
      const data = JSON.parse(e.data);
      state.currentStreamText += data.delta || '';

      // Live update markdown
      elements.markdownRenderArea.innerHTML = renderMarkdownSafely(state.currentStreamText);
      elements.rawMarkdownTextarea.value = state.currentStreamText;
    } catch (err) {}
  });

  es.addEventListener('done', (e) => {
    try {
      const data = JSON.parse(e.data);
      finalizeCrawl(data.result);
    } catch (err) {
      console.error('Error handling done event:', err);
    }
    es.close();
  });

  es.addEventListener('error', (e) => {
    if (typeof e.data === 'string') {
      let message = 'The crawler failed to complete this request.';
      try {
        const data = JSON.parse(e.data);
        message = data.message || message;
      } catch (err) {
        console.warn('Could not parse crawl error event:', err);
      }

      stopTimer();
      setButtonLoading(false);
      updateAgentStatus('error', 'Crawl Failed');
      elements.telemetryStatusTitle.textContent = 'Crawl Failed';
      elements.telemetryStatusSub.textContent = message;
      setPipelineStep(4, 'failed');

      const errorMessage = document.createElement('div');
      errorMessage.className = 'crawl-error';
      errorMessage.textContent = message;
      elements.markdownRenderArea.replaceChildren(errorMessage);
      es.close();
      if (state.eventSource === es) state.eventSource = null;
      showToast('Crawl failed. See the error in the results panel.', 'error');
    } else if (!state.activeResult) {
      elements.telemetryStatusSub.textContent = 'Connection interrupted; attempting to reconnect...';
      console.warn('Crawl event stream disconnected; EventSource will retry.');
    } else {
      es.close();
    }
  });
}

function finalizeCrawl(result) {
  stopTimer();
  setButtonLoading(false);
  updateAgentStatus('ready', 'Agent Ready');

  // Complete all pipeline steps
  for (let i = 1; i <= 5; i++) {
    setPipelineStep(i, 'completed');
  }

  state.activeResult = result;
  elements.telemetryStatusTitle.textContent = 'Autonomous Crawl Complete';
  elements.telemetryStatusSub.textContent = `Completed in ${result.metrics?.duration_s || '0'}s with ${result.sources?.length || 0} verified sources.`;

  // Render complete dossier
  elements.markdownRenderArea.innerHTML = renderMarkdownSafely(result.summary || state.currentStreamText);
  elements.rawMarkdownTextarea.value = result.summary || state.currentStreamText;
  elements.resultTimestamp.textContent = new Date(result.timestamp).toLocaleTimeString();

  // Populate sources gallery
  const sources = result.sources || [];
  renderCitationChecks(sources);
  renderCitationSummary(sources);
  renderSourcesGrid(sources);

  // Populate telemetry audit
  renderAuditTelemetry(result);

  // Update overview stats
  elements.statSourcesVisited.textContent = (result.sources || []).length;
  elements.statAvgLatency.textContent = `${result.metrics?.duration_s || 0}s`;

  // Update token display
  if (result.metrics?.total_tokens) {
    elements.tokenCountValue.textContent = result.metrics.total_tokens.toLocaleString();
  }

  showToast('Crawl completed successfully!', 'success');
  fetchHistory();
}

// ==========================================================================
// PIPELINE & TELEMETRY UI HELPERS
// ==========================================================================
function resetPipeline() {
  for (let i = 1; i <= 5; i++) {
    elements.steps[i].className = 'pipeline-step';
    if (elements.connectors[i]) {
      elements.connectors[i].className = 'pipeline-connector';
    }
  }
}

function setPipelineStep(stepNum, status) {
  const step = elements.steps[stepNum];
  if (!step) return;

  step.classList.remove('active', 'completed');
  if (status === 'active') {
    step.classList.add('active');
  } else if (status === 'completed') {
    step.classList.add('completed');
    const connector = elements.connectors[stepNum];
    if (connector) connector.classList.add('completed');
  } else if (status === 'failed') {
    step.classList.add('failed');
  }
}

function addToolActivityRow(data) {
  const rowId = `tool_row_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  const badgeClass = data.tool || 'tool';

  let argDesc = '';
  if (data.args) {
    if (data.args.query) argDesc = `Query: "${data.args.query}"`;
    else if (data.args.url) argDesc = `URL: ${data.args.url}`;
    else argDesc = JSON.stringify(data.args).substring(0, 80);
  }

  const html = `
    <div id="${rowId}" class="activity-row" data-tool="${data.tool}">
      <div class="activity-left">
        <span class="activity-badge ${badgeClass}">${data.tool}</span>
        <span class="activity-desc">${escapeHtml(argDesc)}</span>
      </div>
      <div class="activity-meta">
        <span class="activity-duration">executing...</span>
        <span class="activity-status-icon">⏳</span>
      </div>
    </div>
  `;

  elements.toolActivityList.insertAdjacentHTML('afterbegin', html);
}

function updateToolActivityRow(data) {
  const rows = elements.toolActivityList.querySelectorAll(`[data-tool="${data.tool}"]`);
  if (!rows || rows.length === 0) return;

  const latestRow = rows[0];
  const durationSpan = latestRow.querySelector('.activity-duration');
  const statusIcon = latestRow.querySelector('.activity-status-icon');

  if (durationSpan) durationSpan.textContent = `${data.duration_ms || 0}ms`;
  if (statusIcon) {
    if (data.status === 'error') {
      statusIcon.textContent = '❌';
      statusIcon.className = 'activity-status-icon error';
    } else {
      statusIcon.textContent = '✓';
      statusIcon.className = 'activity-status-icon done';
    }
  }
}

function renderSourcesGrid(sources) {
  elements.sourceCountBadge.textContent = sources.length;

  if (!sources || sources.length === 0) {
    elements.sourcesGrid.innerHTML = `
      <div style="grid-column: 1/-1; padding: 24px; text-align: center; color: var(--text-muted); font-style: italic;">
        No external URLs were scraped or referenced in this session.
      </div>
    `;
    return;
  }

  elements.sourcesGrid.innerHTML = sources.map(src => {
    const domain = src.domain || 'web source';
    const title = src.title || domain;
    const status = getCitationStatus(src);
    return `
      <a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer" class="source-card">
        <div class="source-card-top">
          <span class="source-domain-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            ${escapeHtml(domain)}
          </span>
          <span class="citation-status ${status.className}">${status.label}</span>
          <span class="source-external-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </span>
        </div>
        <div class="source-card-title">${escapeHtml(title)}</div>
        <div class="source-card-url">${escapeHtml(src.url)}</div>
      </a>
    `;
  }).join('');
}

function normalizeCitationUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href;
  } catch (err) {
    return null;
  }
}

function getCitationStatus(source) {
  switch (source.type) {
    case 'scraped':
      return {
        label: 'Read by agent',
        className: 'citation-status--read',
        description: 'The crawler successfully read this page.',
      };
    case 'failed':
      return {
        label: 'Read failed',
        className: 'citation-status--failed',
        description: 'The crawler attempted to read this page but failed.',
      };
    case 'referenced':
      return {
        label: 'Not fetched',
        className: 'citation-status--unread',
        description: 'This URL appears in the report but was not successfully read.',
      };
    default:
      return {
        label: 'Not checked',
        className: 'citation-status--unread',
        description: 'The page retrieval status is unavailable.',
      };
  }
}

function renderCitationChecks(sources) {
  const sourcesByUrl = new Map(
    sources.map(source => [normalizeCitationUrl(source.url), source])
      .filter(([url]) => url)
  );

  elements.markdownRenderArea.querySelectorAll('a[href]').forEach(link => {
    const normalizedUrl = normalizeCitationUrl(link.href);
    if (!normalizedUrl) return;

    const source = sourcesByUrl.get(normalizedUrl);
    const status = source
      ? getCitationStatus(source)
      : getCitationStatus({ type: 'unknown' });
    const badge = document.createElement('span');
    badge.className = `citation-check ${status.className}`;
    badge.textContent = status.label;
    badge.title = status.description;
    link.insertAdjacentElement('afterend', badge);
  });
}

function renderCitationSummary(sources) {
  const citedSources = sources.filter(source =>
    source.cited === true || (!('cited' in source) && source.type !== 'scraped')
  );
  const readCount = citedSources.filter(source => source.type === 'scraped').length;
  const failedCount = citedSources.filter(source => source.type === 'failed').length;
  const notFetchedCount = citedSources.filter(source => source.type === 'referenced').length;
  const readButNotCitedCount = sources.filter(source =>
    source.type === 'scraped' && source.cited === false
  ).length;

  elements.citationSummary.hidden = sources.length === 0;
  if (sources.length === 0) return;

  const details = [`${readCount} cited pages read by the crawler`];
  if (failedCount) details.push(`${failedCount} cited pages failed to read`);
  if (notFetchedCount) details.push(`${notFetchedCount} cited URLs not fetched`);
  if (readButNotCitedCount) details.push(`${readButNotCitedCount} other pages read`);
  elements.citationSummary.textContent =
    `Citation check: ${details.join(' · ')}. Retrieval status does not confirm claim accuracy.`;
}

function renderAuditTelemetry(result) {
  elements.auditLatency.textContent = `${result.metrics?.duration_s || 0}s`;
  elements.auditPromptTokens.textContent = result.metrics?.prompt_tokens?.toLocaleString() || '-';
  elements.auditOutputTokens.textContent = result.metrics?.output_tokens?.toLocaleString() || '-';
  elements.auditTotalTokens.textContent = result.metrics?.total_tokens?.toLocaleString() || '-';

  const tools = result.tools_used || [];
  if (tools.length === 0) {
    elements.auditTableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
          No tool calls were recorded for this crawl.
        </td>
      </tr>
    `;
    return;
  }

  elements.auditTableBody.innerHTML = tools.map((t, idx) => {
    let argStr = '';
    if (t.args) {
      argStr = t.args.query ? `query: "${t.args.query}"` : (t.args.url ? `url: "${t.args.url}"` : JSON.stringify(t.args));
    }
    return `
      <tr>
        <td>${idx + 1}</td>
        <td><code>${escapeHtml(t.name || 'tool')}</code></td>
        <td><span style="color: #cbd5e1;">${escapeHtml(argStr)}</span></td>
        <td>${t.duration_ms ? `${t.duration_ms}ms` : '-'}</td>
        <td><span style="color: ${t.status === 'error' ? 'var(--accent-rose)' : 'var(--accent-emerald)'}; font-weight: 600;">${t.status || 'completed'}</span></td>
      </tr>
    `;
  }).join('');
}

// ==========================================================================
// TABS & ACTIONS
// ==========================================================================
function switchTab(targetTab) {
  state.activeTab = targetTab;

  elements.resultTabs.forEach(t => {
    t.classList.toggle('active', t.dataset.tab === targetTab);
  });

  for (const [tabKey, pane] of Object.entries(elements.tabPanes)) {
    if (pane) {
      pane.style.display = (tabKey === targetTab) ? 'block' : 'none';
    }
  }
}

async function copyMarkdownToClipboard() {
  const text = state.activeResult?.summary || state.currentStreamText || '';
  if (!text) {
    showToast('No content to copy', 'info');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    const span = elements.copyMarkdownBtn.querySelector('span');
    const originalText = span.textContent;
    span.textContent = 'Copied!';
    elements.copyMarkdownBtn.style.borderColor = 'var(--accent-emerald)';
    showToast('Dossier copied to clipboard', 'success');

    setTimeout(() => {
      span.textContent = originalText;
      elements.copyMarkdownBtn.style.borderColor = '';
    }, 2000);
  } catch (err) {
    showToast('Failed to copy text', 'error');
  }
}

function downloadMarkdownFile() {
  const text = state.activeResult?.summary || state.currentStreamText || '';
  if (!text) {
    showToast('No content to download', 'info');
    return;
  }

  const querySlug = (state.activeResult?.query || 'crawl_report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .substring(0, 40);

  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${querySlug}_research.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Report downloaded as Markdown', 'success');
}

// ==========================================================================
// TIMER & STATUS
// ==========================================================================
function startTimer() {
  state.startTime = Date.now();
  if (state.timerInterval) clearInterval(state.timerInterval);

  state.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.startTime) / 100);
    const tenths = elapsed % 10;
    const totalSec = Math.floor(elapsed / 10);
    const sec = totalSec % 60;
    const min = Math.floor(totalSec / 60);

    const formatted = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${tenths}`;
    elements.timerValue.textContent = formatted;
  }, 100);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function setButtonLoading(isLoading) {
  elements.startCrawlBtn.disabled = isLoading;
  const btnText = elements.startCrawlBtn.querySelector('.btn-text');
  const btnArrow = elements.startCrawlBtn.querySelector('.btn-arrow');
  const btnSpinner = elements.startCrawlBtn.querySelector('.btn-spinner');

  if (isLoading) {
    btnText.textContent = 'Crawling...';
    btnArrow.style.display = 'none';
    btnSpinner.style.display = 'block';
  } else {
    btnText.textContent = 'Launch Crawl';
    btnArrow.style.display = 'block';
    btnSpinner.style.display = 'none';
  }
}

function updateAgentStatus(status, text) {
  elements.agentStatusText.textContent = text;
  elements.agentStatusPill.className = `agent-badge-pill ${status}`;
}

// ==========================================================================
// HISTORY MANAGEMENT
// ==========================================================================
async function fetchHistory() {
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    state.history = data.history || [];
    renderHistoryDrawer();
  } catch (err) {
    console.warn('Failed to load history:', err);
  }
}

function renderHistoryDrawer(filterText = '') {
  elements.historyCountBadge.textContent = state.history.length;
  elements.historySubtitle.textContent = `${state.history.length} past sessions`;

  const filtered = filterText
    ? state.history.filter(h => h.query.toLowerCase().includes(filterText.toLowerCase()))
    : state.history;

  if (filtered.length === 0) {
    elements.historyList.innerHTML = `
      <div style="padding: 30px; text-align: center; color: var(--text-muted); font-size: 0.88rem;">
        ${filterText ? 'No matching queries found.' : 'No previous crawls recorded yet.'}
      </div>
    `;
    return;
  }

  elements.historyList.innerHTML = filtered.map(item => {
    const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleString() : '';
    return `
      <div class="history-item-card" data-id="${item.id}">
        <div class="history-item-top">
          <div class="history-item-title">${escapeHtml(item.query)}</div>
          <button type="button" class="delete-history-btn" data-id="${item.id}" title="Delete this session">&times;</button>
        </div>
        <div class="history-item-meta">
          <span>${timeStr}</span>
          <span>•</span>
          <span>${item.duration_s || 0}s</span>
          <span>•</span>
          <span>${item.source_count || 0} sources</span>
        </div>
      </div>
    `;
  }).join('');

  // Attach card click handlers
  elements.historyList.querySelectorAll('.history-item-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-history-btn')) return;
      loadHistoryItem(card.dataset.id);
      closeHistoryDrawer();
    });
  });

  // Attach delete handlers
  elements.historyList.querySelectorAll('.delete-history-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteHistoryItem(btn.dataset.id);
    });
  });
}

async function loadHistoryItem(taskId) {
  try {
    const res = await fetch(`/api/crawl/${taskId}`);
    if (!res.ok) throw new Error('Could not load session.');
    const result = await res.json();

    elements.welcomeSection.style.display = 'none';
    elements.telemetrySection.style.display = 'block';
    elements.resultsSection.style.display = 'block';

    elements.crawlQueryInput.value = result.query || '';
    elements.clearQueryBtn.style.display = 'flex';
    elements.resultQueryTitle.textContent = result.query || 'Saved Query';
    elements.resultModelBadge.textContent = result.model || 'gemini-2.5-flash';
    elements.resultModeBadge.textContent = result.mode || 'deep';

    finalizeCrawl(result);
    showToast('Loaded saved crawl session', 'info');
  } catch (err) {
    showToast('Failed to load session', 'error');
  }
}

async function deleteHistoryItem(taskId) {
  try {
    await fetch(`/api/history/${taskId}`, { method: 'DELETE' });
    state.history = state.history.filter(h => h.id !== taskId);
    renderHistoryDrawer(elements.historySearchInput.value);
    showToast('Session deleted', 'info');
  } catch (err) {
    showToast('Failed to delete item', 'error');
  }
}

async function clearAllHistory() {
  if (!confirm('Are you sure you want to clear all crawl history?')) return;
  try {
    await fetch('/api/history', { method: 'DELETE' });
    state.history = [];
    renderHistoryDrawer();
    showToast('All history cleared', 'info');
  } catch (err) {
    showToast('Failed to clear history', 'error');
  }
}

function filterHistoryItems(e) {
  renderHistoryDrawer(e.target.value);
}

function openHistoryDrawer() {
  elements.historyDrawer.classList.add('open');
  elements.historySearchInput.focus();
}

function closeHistoryDrawer() {
  elements.historyDrawer.classList.remove('open');
}

// ==========================================================================
// SYSTEM STATUS & SETTINGS MODAL
// ==========================================================================
async function fetchSystemStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    state.systemConfig.apiKeyConfigured = data.api_key_configured;
    state.systemConfig.currentModel = data.current_model || 'gemini-2.5-flash';

    // Update Model Selector in Header
    elements.modelSelector.value = state.systemConfig.currentModel;
    elements.settingsModelSelect.value = state.systemConfig.currentModel;

    // Update API Key Status
    if (data.api_key_configured) {
      elements.apiKeyPill.className = 'key-status-btn valid';
      elements.apiKeyStatusText.textContent = data.masked_key ? `Key: ${data.masked_key}` : 'API Key Active';
      updateAgentStatus('ready', 'Agent Ready');
    } else {
      elements.apiKeyPill.className = 'key-status-btn missing';
      elements.apiKeyStatusText.textContent = 'Add API Key';
      updateAgentStatus('missing-key', 'API Key Required');
    }
  } catch (err) {
    console.warn('Status fetch failed:', err);
  }
}

async function updateSettingsOnServer(payload) {
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Settings update error:', err);
  }
}

function openSettingsModal() {
  elements.settingsModal.style.display = 'flex';
  elements.keyTestResult.style.display = 'none';
  elements.settingsApiKeyInput.value = '';
}

function closeSettingsModal() {
  elements.settingsModal.style.display = 'none';
}

function toggleKeyVisibility() {
  const input = elements.settingsApiKeyInput;
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function testApiKeyConnection() {
  const key = elements.settingsApiKeyInput.value.trim();
  elements.testKeyBtn.disabled = true;
  elements.testKeyBtn.querySelector('span').textContent = 'Testing...';
  elements.keyTestResult.style.display = 'block';
  elements.keyTestResult.className = 'test-result-box';
  elements.keyTestResult.textContent = 'Contacting Gemini endpoint via Antigravity SDK...';

  try {
    const res = await fetch('/api/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key })
    });
    const data = await res.json();

    if (data.valid) {
      elements.keyTestResult.className = 'test-result-box success';
      elements.keyTestResult.textContent = `✓ Key validated successfully! Model responded: "${data.response || 'PONG'}"`;
    } else {
      elements.keyTestResult.className = 'test-result-box error';
      elements.keyTestResult.textContent = `✗ Verification failed: ${data.error || 'Invalid API Key'}`;
    }
  } catch (err) {
    elements.keyTestResult.className = 'test-result-box error';
    elements.keyTestResult.textContent = `✗ Connection error: ${err.message}`;
  } finally {
    elements.testKeyBtn.disabled = false;
    elements.testKeyBtn.querySelector('span').textContent = 'Test Connection';
  }
}

async function saveModalSettings() {
  const apiKey = elements.settingsApiKeyInput.value.trim();
  const model = elements.settingsModelSelect.value;

  const payload = { model: model };
  if (apiKey) payload.api_key = apiKey;

  elements.saveSettingsBtn.disabled = true;
  elements.saveSettingsBtn.querySelector('span').textContent = 'Saving...';

  const res = await updateSettingsOnServer(payload);
  elements.saveSettingsBtn.disabled = false;
  elements.saveSettingsBtn.querySelector('span').textContent = 'Save Changes';

  if (res && res.success) {
    showToast('Settings saved successfully', 'success');
    closeSettingsModal();
    fetchSystemStatus();
  } else {
    showToast('Failed to save settings', 'error');
  }
}

// ==========================================================================
// TOAST NOTIFICATIONS
// ==========================================================================
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? '✓' : (type === 'error' ? '⚠️' : 'ℹ️');
  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Helper: Escape HTML strings
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
