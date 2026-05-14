/* =============================================
   CODE ASSISTANT — JavaScript
   Chat interactions, animations, and UI logic
   ============================================= */

// ============ Scroll Animations ============
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, observerOptions);

document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

// ============ Navbar Scroll Effect ============
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// ============ Auto-resize textarea ============
const chatInput = document.getElementById('chat-input');
chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// Enter to send (Shift+Enter for newline)
chatInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// ============ Chat Logic ============
const chatMessages = document.getElementById('chat-messages');
const sendBtn = document.getElementById('chat-send-btn');
let isProcessing = false;

// ============ Session Stats ============
let sessionStats = { queries: 0, sumQuality: 0, totalTests: 0, passedTests: 0, sessionTimes: [] };

function useSuggestion(btn) {
    chatInput.value = btn.textContent;
    chatInput.focus();
    sendMessage();
}

// ============ Pipeline Visualizer ============
let activePipeline = null;

function createPipelineVisualizer() {
    const div = document.createElement('div');
    div.className = 'message message-agent pipeline-message';

    div.innerHTML = `
        <div class="message-avatar">⚡</div>
        <div class="message-bubble pipeline-bubble">
            <div class="pipeline-visualizer">
                <div class="pipeline-track">
                    <div class="pipeline-stage completed" data-stage="start">
                        <div class="pipeline-node-circle">▶</div>
                        <div class="pipeline-node-name">Start</div>
                    </div>
                    <div class="pipeline-connector" data-index="0">
                        <div class="pipeline-connector-bg"></div>
                        <div class="pipeline-connector-fill"></div>
                    </div>
                    <div class="pipeline-stage" data-stage="retrieve">
                        <div class="pipeline-node-circle">🔍</div>
                        <div class="pipeline-node-name">Retrieve</div>
                        <div class="pipeline-node-detail">FAISS Search</div>
                    </div>
                    <div class="pipeline-connector" data-index="1">
                        <div class="pipeline-connector-bg"></div>
                        <div class="pipeline-connector-fill"></div>
                    </div>
                    <div class="pipeline-stage" data-stage="generate">
                        <div class="pipeline-node-circle">🤖</div>
                        <div class="pipeline-node-name">Generate</div>
                        <div class="pipeline-node-detail">Mistral AI</div>
                    </div>
                    <div class="pipeline-connector" data-index="2">
                        <div class="pipeline-connector-bg"></div>
                        <div class="pipeline-connector-fill"></div>
                    </div>
                    <div class="pipeline-stage" data-stage="check">
                        <div class="pipeline-node-circle">✓</div>
                        <div class="pipeline-node-name">Validate</div>
                        <div class="pipeline-node-detail">Syntax Check</div>
                    </div>
                    <div class="pipeline-connector" data-index="3">
                        <div class="pipeline-connector-bg"></div>
                        <div class="pipeline-connector-fill"></div>
                    </div>
                    <div class="pipeline-stage" data-stage="execute">
                        <div class="pipeline-node-circle">▶</div>
                        <div class="pipeline-node-name">Execute</div>
                        <div class="pipeline-node-detail">Sandbox</div>
                    </div>
                    <div class="pipeline-connector" data-index="4">
                        <div class="pipeline-connector-bg"></div>
                        <div class="pipeline-connector-fill"></div>
                    </div>
                    <div class="pipeline-stage" data-stage="end">
                        <div class="pipeline-node-circle">⏹</div>
                        <div class="pipeline-node-name">Done</div>
                    </div>
                </div>
                <div class="pipeline-status-bar">
                    <div class="pipeline-status-dot"></div>
                    <span class="pipeline-status-text">Initializing agent pipeline...</span>
                </div>
            </div>
        </div>
    `;

    chatMessages.appendChild(div);
    scrollToBottom();

    const stages = div.querySelectorAll('.pipeline-stage');
    const connectors = div.querySelectorAll('.pipeline-connector');

    activePipeline = {
        element: div,
        stages: stages,
        connectors: connectors,
        statusText: div.querySelector('.pipeline-status-text'),
        statusDot: div.querySelector('.pipeline-status-dot'),
        timers: []
    };

    // Start animated progression
    animatePipeline();

    return div;
}

function animatePipeline() {
    if (!activePipeline) return;

    const statusMessages = [
        'Initializing agent pipeline...',
        'Searching FAISS vector store for relevant docs...',
        'Generating code with Mistral AI...',
        'Validating syntax & running checks...',
        'Executing code in sandbox...',
        'Finalizing output...'
    ];

    // stageIndex: 0=start(already completed), 1=retrieve, 2=generate, 3=check, 4=execute, 5=end
    const delays = [0, 600, 2200, 5000, 8000, 11000];

    delays.forEach((delay, i) => {
        const timer = setTimeout(() => {
            if (!activePipeline) return;

            const { stages, connectors, statusText } = activePipeline;

            // Complete all previous stages
            for (let j = 0; j < i; j++) {
                stages[j].classList.remove('active');
                stages[j].classList.add('completed');
                if (connectors[j]) {
                    connectors[j].classList.add('filled');
                }
            }

            // Activate current stage
            if (stages[i]) {
                stages[i].classList.remove('pending');
                stages[i].classList.add('active');
            }

            // Update status text
            if (statusMessages[i]) {
                statusText.textContent = statusMessages[i];
            }

            scrollToBottom();
        }, delay);

        activePipeline.timers.push(timer);
    });
}

function completePipeline(iterations) {
    if (!activePipeline) return;

    // Clear all pending timers
    activePipeline.timers.forEach(t => clearTimeout(t));

    const { stages, connectors, statusText, statusDot, element } = activePipeline;

    // Mark all stages completed
    stages.forEach(s => {
        s.classList.remove('active', 'pending');
        s.classList.add('completed');
    });

    // Fill all connectors
    connectors.forEach(c => c.classList.add('filled'));

    // Update status
    const retryText = iterations > 1 ? ` (${iterations} iterations — self-corrected)` : '';
    statusText.textContent = `✓ Pipeline complete${retryText}`;
    statusDot.classList.add('done');

    // Add retry badge if self-corrected
    if (iterations > 1) {
        const badge = document.createElement('span');
        badge.className = 'pipeline-retry-badge';
        badge.textContent = `🔄 ${iterations}× retries`;
        activePipeline.statusText.parentElement.appendChild(badge);
    }

    // Fade down pipeline after a moment
    setTimeout(() => {
        element.classList.add('pipeline-done');
    }, 800);

    activePipeline = null;
}

function destroyPipeline() {
    if (!activePipeline) return;
    activePipeline.timers.forEach(t => clearTimeout(t));
    activePipeline.element.remove();
    activePipeline = null;
}

// ============ Send Message ============
function sendMessage() {
    const msg = chatInput.value.trim();
    if (!msg || isProcessing) return;

    // Remove welcome screen
    const welcome = document.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    // Add user message
    appendMessage('user', msg);
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Show pipeline visualizer
    isProcessing = true;
    sendBtn.disabled = true;
    createPipelineVisualizer();

    // Call backend
    fetch('/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: msg })
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(data => {
                throw new Error(data.error || `Server error: ${res.status}`);
            }).catch(() => {
                throw new Error(`Server error: ${res.status} - ${res.statusText}`);
            });
        }
        return res.json();
    })
    .then(data => {
        completePipeline(data.iterations || 1);
        if (data.error && data.error !== 'none') {
            appendErrorMessage(data.error);
        } else {
            appendAgentResponse(data);
        }
    })
    .catch(err => {
        destroyPipeline();
        appendErrorMessage(err.message);
    })
    .finally(() => {
        isProcessing = false;
        sendBtn.disabled = false;
    });
}

function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message message-${role}`;

    const avatar = role === 'user' ? '👤' : '⚡';

    div.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-bubble">${escapeHtml(text)}</div>
    `;
    chatMessages.appendChild(div);
    scrollToBottom();
}

function appendAgentResponse(data) {
    const div = document.createElement('div');
    div.className = 'message message-agent';

    const statusText = data.error === 'none' ? '✓ Code Passed' : `✗ Error: ${data.error}`;
    const statusClass = data.error === 'none' ? 'success' : 'error';

    // Update Session Stats
    sessionStats.queries++;
    sessionStats.sumQuality += data.code_quality || 0;
    sessionStats.sessionTimes.push(data.response_time || 0);
    if (data.tests && data.tests.generated) {
        sessionStats.totalTests += (data.tests.pass_count || 0) + (data.tests.fail_count || 0);
        sessionStats.passedTests += (data.tests.pass_count || 0);
    }
    updateHeroStats();

    // IDs
    const preambleId = 'preamble-' + Date.now();
    const importsId = 'imports-' + Date.now();
    const codeId = 'code-' + Date.now();
    const testCodeId = 'testcode-' + Date.now();

    // UI Builders
    const gaugeHtml = buildQualityGauge(data.code_quality || 0);
    const breakdownHtml = buildScoreBars(data.complexity || {}, data.code_quality || 0);
    const hallucinationsHtml = buildHallucinations(data.hallucinations || []);
    const sparklineHtml = buildSparkline(sessionStats.sessionTimes);
    const securityHtml = buildSecurityPanel(data.security || []);
    const complexityHtml = buildComplexityCards(data.complexity || {});
    const testsHtml = buildTestPanel(data.tests || {}, testCodeId);
    const executionHtml = buildTerminalPanel(data.execution || {});

    const totalTime = data.total_time || data.response_time || 0;

    div.innerHTML = `
        <div class="message-avatar">⚡</div>
        <div class="message-bubble" style="width: 100%;">
            <div class="response-top-row">
                <div class="status-badge ${statusClass}">${statusText}</div>
                <div class="iteration-info">Iterations: ${data.iterations || '?'} / 3 &nbsp;·&nbsp; Total Time: ${totalTime}s</div>
            </div>
            
            <div class="metrics-dashboard">
                <div class="metrics-gauge-col">
                    ${gaugeHtml}
                </div>
                <div class="metrics-stats-col">
                    <div class="mstat-row">
                        <span class="mstat-label">⏱️ Gen Time</span>
                        <span class="mstat-value">${data.response_time || 0}s</span>
                    </div>
                    <div class="mstat-row">
                        <span class="mstat-label">👻 Hallucinations</span>
                        <span class="mstat-value">${hallucinationsHtml}</span>
                    </div>
                    <div class="mstat-row" style="margin-top: 4px;">
                        <span class="mstat-label">📈 Trend</span>
                        <span class="mstat-value">${sparklineHtml}</span>
                    </div>
                    ${breakdownHtml}
                </div>
            </div>
            
            <div class="code-actions-bar">
                <button class="btn-code-action btn-copy-all" onclick="copyFullCode('${importsId}', '${codeId}', this)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    Copy Full Code
                </button>
                <button class="btn-code-action btn-download" onclick="downloadCode('${importsId}', '${codeId}', '${escapeHtml(data.prefix || '').replace(/'/g, "\\'")}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Download .py
                </button>
            </div>

            <div class="code-sections-container">
                ${data.prefix ? `
                <div class="accordion-section open">
                    <button class="accordion-toggle" onclick="this.parentElement.classList.toggle('open')">
                        <div class="accordion-toggle-left">📝 Preamble</div>
                        <div class="accordion-chevron">▼</div>
                    </button>
                    <div class="accordion-body">
                        <div class="code-section-body preamble-body" id="${preambleId}">${escapeHtml(data.prefix)}</div>
                    </div>
                </div>` : ''}
                
                ${data.imports ? `
                <div class="accordion-section">
                    <button class="accordion-toggle" onclick="this.parentElement.classList.toggle('open')">
                        <div class="accordion-toggle-left">📦 Imports</div>
                        <div class="accordion-chevron">▼</div>
                    </button>
                    <div class="accordion-body">
                        <div class="code-section-header" style="justify-content: flex-end;">
                            <button class="accordion-copy-btn" onclick="copyCode('${importsId}')">Copy Imports</button>
                        </div>
                        <div class="code-section-body code-body" id="${importsId}">${highlightPython(data.imports)}</div>
                    </div>
                </div>` : ''}

                <div class="accordion-section open">
                    <button class="accordion-toggle" onclick="this.parentElement.classList.toggle('open')">
                        <div class="accordion-toggle-left">⚙️ Generated Code</div>
                        <div class="accordion-chevron">▼</div>
                    </button>
                    <div class="accordion-body">
                        <div class="code-section-header" style="justify-content: flex-end;">
                            <button class="accordion-copy-btn" onclick="copyCode('${codeId}')">Copy Code</button>
                        </div>
                        <div class="code-section-body code-body" id="${codeId}">${highlightPython(data.code || '')}</div>
                    </div>
                </div>
            </div>

            ${executionHtml}
            ${securityHtml}
            ${complexityHtml}
            ${testsHtml}
        </div>
    `;
    chatMessages.appendChild(div);
    scrollToBottom();
}

function appendErrorMessage(errMsg) {
    const div = document.createElement('div');
    div.className = 'message message-agent';

    // Provide helpful guidance based on error type
    let helpText = '';
    if (errMsg.includes('timed out')) {
        helpText = 'The request took too long. Try a simpler or shorter code request.';
    } else if (errMsg.includes('Invalid request')) {
        helpText = 'Your request format is invalid. Please enter a code generation prompt.';
    } else if (errMsg.includes('Internal server error')) {
        helpText = 'The server encountered an error. Please try again or check the logs.';
    } else if (errMsg.includes('rate')) {
        helpText = 'Too many requests. Please wait a moment before trying again.';
    } else {
        helpText = 'Make sure the Flask server is running and accessible.';
    }

    div.innerHTML = `
        <div class="message-avatar">⚡</div>
        <div class="message-bubble">
            <div class="status-badge error">❌ Error</div>
            <p style="color: var(--text-secondary); margin-top: 8px;">${escapeHtml(helpText)}</p>
            <p style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-tertiary); margin-top:8px; padding: 8px; background: rgba(255,0,0,0.05); border-radius: 4px; border-left: 2px solid #ffa8a8;">${escapeHtml(errMsg)}</p>
        </div>
    `;
    chatMessages.appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ============ Code Copy ============
function copyCode(id) {
    const codeEl = document.getElementById(id);
    if (!codeEl) return;

    // Get rendered plain text — innerText strips the <span> highlight tags
    const text = codeEl.innerText || codeEl.textContent;

    function flashBtn(success) {
        // Find the copy button using the new accordion structure, or fallback to the old structure
        const section = codeEl.closest('.accordion-body') || codeEl.closest('.code-section');
        if (!section) return;
        const btn = section.querySelector('.accordion-copy-btn') || section.querySelector('.code-copy-btn');
        if (!btn) return;
        
        const originalText = btn.textContent;
        btn.textContent = success ? 'Copied!' : 'Failed';
        btn.style.opacity = '0.7';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.opacity = '';
        }, 2000);
    }

    function fallbackCopy() {
        // Works over plain HTTP (no secure-context required)
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
            document.execCommand('copy');
            flashBtn(true);
        } catch (e) {
            console.warn('Copy fallback failed:', e);
            flashBtn(false);
        }
        document.body.removeChild(ta);
    }

    // navigator.clipboard requires HTTPS or localhost (secure context).
    // When served over HTTP on a LAN IP, skip straight to the fallback.
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => flashBtn(true)).catch(fallbackCopy);
    } else {
        fallbackCopy();
    }
}

// ============ Syntax Highlighting (Basic) ============
function highlightPython(code) {
    if (!code) return '';
    let escaped = escapeHtml(code);

    // Helper: replace pattern but skip over any HTML tags or entities already in the string
    function safeReplace(str, pattern, fn) {
        const safe = new RegExp(`(<[^>]+>|&[#\\w]+;)|(?:${pattern.source})`, pattern.flags.replace('g','') + 'g');
        return str.replace(safe, (match, skip, ...groups) => {
            if (skip !== undefined) return skip;  // inside a tag/entity — leave untouched
            return fn(match, ...groups);
        });
    }

    // 1. Triple-quoted strings (must run first)
    escaped = escaped.replace(/(&#39;&#39;&#39;[\s\S]*?&#39;&#39;&#39;|&quot;&quot;&quot;[\s\S]*?&quot;&quot;&quot;)/g,
        '<span class="hl-string">$1</span>');

    // 2. Single / double-quoted strings
    escaped = escaped.replace(/((?:f|r|b)?&quot;(?:[^&]|&(?!quot;))*?&quot;)/g,
        '<span class="hl-string">$1</span>');
    escaped = escaped.replace(/((?:f|r|b)?&#39;(?:[^&]|&(?!#39;))*?&#39;)/g,
        '<span class="hl-string">$1</span>');

    // 3. Comments
    escaped = escaped.replace(/(#[^\n]*)/g, '<span class="hl-comment">$1</span>');

    // 4. Function names  (highlight name after "def", skip spans)
    escaped = escaped.replace(/(<[^>]+>|&[#\w]+;)|(\bdef\s+)(\w+)/g,
        (m, skip, kw, name) => skip !== undefined ? skip : `${kw}<span class="hl-func">${name}</span>`);

    // 5. Class names  (highlight name after "class", skip spans)
    escaped = escaped.replace(/(<[^>]+>|&[#\w]+;)|(\bclass\s+)(\w+)/g,
        (m, skip, kw, name) => skip !== undefined ? skip : `${kw}<span class="hl-func">${name}</span>`);

    // 6. Decorators
    escaped = escaped.replace(/^(@\w+)/gm, '<span class="hl-decorator">$1</span>');

    // 7. Keywords — alternation skips HTML tags/entities so "class" in
    //    class="hl-keyword" is never re-processed by this regex.
    const keywords = [
        'import', 'from', 'def', 'class', 'return', 'if', 'elif', 'else',
        'for', 'while', 'in', 'not', 'and', 'or', 'try', 'except',
        'finally', 'with', 'as', 'raise', 'pass', 'break', 'continue',
        'True', 'False', 'None', 'lambda', 'yield', 'assert', 'global',
        'nonlocal', 'del', 'is'
    ];
    const kwPat = keywords.join('|');
    const kwRegex = new RegExp(`(<[^>]+>|&[#\\w]+;)|(\\b(?:${kwPat})\\b)`, 'g');
    escaped = escaped.replace(kwRegex, (m, skip) =>
        skip !== undefined ? skip : `<span class="hl-keyword">${m}</span>`);

    // 8. Numbers — skip tags and entities (e.g. &#39; contains "39")
    escaped = escaped.replace(/(<[^>]+>|&[#\w]+;)|(\b\d+\.?\d*\b)/g,
        (m, skip, num) => skip !== undefined ? skip : `<span class="hl-number">${num}</span>`);

    return escaped;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

// ============== HELPERS ==============

function copyFullCode(importsId, codeId, btn) {
    const impEl = document.getElementById(importsId);
    const codeEl = document.getElementById(codeId);
    let fullText = '';
    if (impEl) fullText += (impEl.innerText || impEl.textContent) + '\n\n';
    if (codeEl) fullText += (codeEl.innerText || codeEl.textContent);
    
    function flashBtn(success) {
        const originalText = btn.innerHTML;
        btn.innerHTML = success ? '✓ Copied!' : '✗ Failed';
        btn.style.opacity = '0.7';
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.opacity = '1';
        }, 2000);
    }
    
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(fullText).then(() => flashBtn(true)).catch(() => flashBtn(false));
    } else {
        const ta = document.createElement('textarea');
        ta.value = fullText;
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand('copy'); flashBtn(true); } catch(e) { flashBtn(false); }
        document.body.removeChild(ta);
    }
}

function downloadCode(importsId, codeId, prefix) {
    const impEl = document.getElementById(importsId);
    const codeEl = document.getElementById(codeId);
    let fullText = '# ' + (prefix || 'Generated Code').split('\n').join('\n# ') + '\n\n';
    if (impEl) fullText += (impEl.innerText || impEl.textContent) + '\n\n';
    if (codeEl) fullText += (codeEl.innerText || codeEl.textContent);
    
    const blob = new Blob([fullText], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'generated_code.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function buildQualityGauge(score) {
    const p = Math.min(Math.max(score * 10, 0), 100);
    const offset = 220 - (220 * p / 100);
    let color = '#4ade80';
    let glow = 'rgba(74,222,128,0.4)';
    if (score < 5) { color = '#fca5a5'; glow = 'rgba(252,165,165,0.4)'; }
    else if (score < 7) { color = '#fde68a'; glow = 'rgba(253,230,138,0.4)'; }
    
    setTimeout(() => {
        const fills = document.querySelectorAll('.gauge-fill');
        fills.forEach(f => {
            if (f.dataset.target === String(offset)) f.style.strokeDashoffset = offset;
        });
    }, 100);

    return `
        <div class="quality-gauge-wrapper" style="--gauge-glow: ${glow}">
            <svg class="quality-gauge-svg" width="80" height="80" viewBox="0 0 80 80">
                <circle class="gauge-track" cx="40" cy="40" r="35"></circle>
                <circle class="gauge-fill" data-target="${offset}" cx="40" cy="40" r="35" stroke="${color}"></circle>
                <g class="gauge-text-group" transform="origin(40 40)">
                    <text class="gauge-score" x="40" y="38">${score.toFixed(1)}</text>
                    <text class="gauge-label" x="40" y="52">QUALITY</text>
                </g>
            </svg>
        </div>`;
}

function buildScoreBars(cx, q) {
    const maintain = cx.maintainability === 'high' ? 95 : cx.maintainability === 'moderate' ? 65 : 35;
    const style = q * 10;
    const cmt = Math.min(cx.comment_ratio || 0, 100);
    
    setTimeout(() => {
        const fills = document.querySelectorAll('.score-bar-fill');
        fills.forEach(f => {
            if (f.dataset.w) f.style.width = f.dataset.w + '%';
        });
    }, 100);

    return `<div class="score-breakdown">
        ${makeScoreRow('Style/Lint', style)}
        ${makeScoreRow('Maintainability', maintain)}
        ${makeScoreRow('Comments', cmt)}
    </div>`;
}

function makeScoreRow(label, val) {
    const cls = val >= 70 ? 'bar-good' : val >= 50 ? 'bar-fair' : 'bar-poor';
    return `
        <div class="score-bar-row">
            <span class="score-bar-label">${label}</span>
            <div class="score-bar-track">
                <div class="score-bar-fill ${cls}" data-w="${val}"></div>
            </div>
            <span class="score-bar-val">${Math.round(val)}%</span>
        </div>`;
}

function buildHallucinations(halls) {
    if (!halls || !halls.length) return `<span class="hall-clean-check"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path class="check-path" d="M2 6l3 3 5-7"></path></svg> None</span>`;
    return `<div class="hall-chips">${halls.map(h => `<span class="hall-chip">${escapeHtml(h)}</span>`).join('')}</div>`;
}

function buildSparkline(times) {
    const max = Math.max(...times, 5);
    return `<div class="sparkline-row">
        <div class="sparkline-bars">
            ${times.map((t, i) => `<div class="sparkline-bar ${i === times.length-1 ? 'current' : ''}" style="height: ${Math.max((t/max)*100, 10)}%" title="${t}s"></div>`).join('')}
        </div>
        <span class="sparkline-label">${times[times.length-1]}s</span>
    </div>`;
}

function buildSecurityPanel(sec) {
    if (!sec || sec.length === 0) {
        return `
            <div class="sec-summary-bar" style="border-color: rgba(74,222,128,0.2);">
                <span style="color: #4ade80;">🛡️ Security Scan:</span>
                <span class="sec-count-chip sec-count-low">✓ 0 Issues</span>
            </div>`;
    }
    
    let highs = 0, meds = 0, lows = 0;
    const issueRows = sec.map(i => {
        if (i.severity === 'high') highs++;
        else if (i.severity === 'medium') meds++;
        else lows++;
        return `<div class="sec-issue"><span class="sec-severity sev-${i.severity}">${i.severity}</span><span class="sec-msg">${escapeHtml(i.issue)}</span>${i.line ? `<span class="sec-line">L${i.line}</span>` : ''}</div>`;
    }).join('');
    
    return `
        <div class="analysis-panel security-panel sec-warn">
            <div class="sec-summary-bar">
                <span style="color: #fde68a;">🛡️ Security Scan:</span>
                ${highs ? `<span class="sec-count-chip sec-count-high">${highs} HIGH</span>` : ''}
                ${meds ? `<span class="sec-count-chip sec-count-medium">${meds} MED</span>` : ''}
                ${lows ? `<span class="sec-count-chip sec-count-low">${lows} LOW</span>` : ''}
            </div>
            <div class="analysis-body">${issueRows}</div>
        </div>`;
}

function buildComplexityCards(cx) {
    if (!cx || !cx.loc) return '';
    
    setTimeout(() => {
        document.querySelectorAll('.cx-card-bar-fill').forEach(f => {
            if (f.dataset.w) f.style.width = f.dataset.w + '%';
        });
    }, 100);

    const makeCard = (val, lbl, pct, cls) => `
        <div class="cx-card">
            <div class="cx-card-top">
                <span class="cx-card-val ${cls}">${val}</span>
                <span class="cx-card-lbl">${lbl}</span>
            </div>
            <div class="cx-card-bar-track">
                <div class="cx-card-bar-fill ${cls}" data-w="${pct}"></div>
            </div>
        </div>`;
        
    return `<div class="cx-card-grid" style="margin-top: 14px;">
        ${makeCard(cx.loc, 'Lines<br>of Code', Math.min((cx.loc/100)*100, 100), 'cx-fair')}
        ${makeCard(cx.cyclomatic_complexity, 'Cyco<br>Metric', Math.min((cx.cyclomatic_complexity/15)*100, 100), cx.cyclomatic_complexity <= 5 ? 'cx-good' : cx.cyclomatic_complexity <= 10 ? 'cx-fair' : 'cx-poor')}
        ${makeCard(cx.functions, 'Total<br>Funcs', Math.min((cx.functions/10)*100, 100), 'cx-good')}
        ${makeCard(cx.classes, 'Total<br>Classes', Math.min((cx.classes/5)*100, 100), 'cx-good')}
        ${makeCard(cx.max_nesting, 'Max<br>Nesting', Math.min((cx.max_nesting/5)*100, 100), cx.max_nesting <= 2 ? 'cx-good' : cx.max_nesting <= 4 ? 'cx-fair' : 'cx-poor')}
        ${makeCard(cx.comment_ratio + '%', 'Comment<br>Ratio', Math.min(cx.comment_ratio, 100), cx.comment_ratio >= 10 ? 'cx-good' : 'cx-fair')}
    </div>`;
}

function buildTerminalPanel(exec) {
    if (!exec || !exec.executed) return '';
    const succ = exec.returncode === 0;
    
    let body = '';
    if (exec.stdout) body += `<div class="term-stdout">${escapeHtml(exec.stdout)}</div>`;
    if (exec.stderr) body += `<div class="term-stderr">${escapeHtml(exec.stderr)}</div>`;
    if (!exec.stdout && !exec.stderr) body += `<div class="term-empty">No output produced.</div>`;
    body += `<div class="term-cursor"></div>`;
    
    return `
        <div class="terminal-panel ${succ ? 'term-success' : 'term-error'}">
            <div class="terminal-panel-header">
                <div class="terminal-panel-left">
                    <div class="terminal-panel-dots">
                        <span class="td-red"></span><span class="td-yellow"></span><span class="td-green"></span>
                    </div>
                    <span class="terminal-panel-title">python sandbox_${Date.now().toString().slice(-4)}.py</span>
                </div>
                <div class="terminal-exit-badge ${succ ? 'exit-ok' : 'exit-err'}">
                    ${succ ? '✓ exit 0' : '✗ exit 1'}
                </div>
            </div>
            <div class="terminal-panel-body">${body}</div>
        </div>`;
}

function buildTestPanel(tests, testCodeId) {
    if (!tests || !tests.generated) return '';
    const pass = tests.test_passed;
    const total = (tests.pass_count || 0) + (tests.fail_count || 0);
    const pct = total === 0 ? 0 : ((tests.pass_count || 0) / total) * 100;
    const offset = 138 - (138 * pct / 100);
    
    setTimeout(() => {
        const fills = document.querySelectorAll('.test-ring-fill');
        fills.forEach(f => {
            if (f.dataset.target === String(offset)) f.style.strokeDashoffset = offset;
        });
    }, 100);

    const outLines = (tests.test_output || '').split('\n');
    const rows = outLines.filter(l => l.toLowerCase().includes('pass') || l.toLowerCase().includes('fail'))
                         .map(l => {
                             const isPass = l.toLowerCase().includes('pass');
                             return `<div class="test-row ${isPass ? 'tr-pass' : 'tr-fail'}">
                                 <span class="test-row-icon">${isPass ? '✓' : '✗'}</span>
                                 <span>${escapeHtml(l)}</span>
                             </div>`;
                         }).join('');

    return `
        <div class="accordion-section" style="margin-top: 14px;">
            <button class="accordion-toggle" onclick="this.parentElement.classList.toggle('open')">
                <div class="accordion-toggle-left">🧪 Auto-Generated Tests</div>
                <div class="accordion-chevron">▼</div>
            </button>
            <div class="accordion-body">
                <div class="test-ring-wrapper">
                    <svg class="test-ring-svg" width="50" height="50" viewBox="0 0 50 50">
                        <circle class="test-ring-track" cx="25" cy="25" r="22"></circle>
                        <circle class="test-ring-fill" data-target="${offset}" cx="25" cy="25" r="22" stroke="${pass ? '#4ade80' : '#fca5a5'}"></circle>
                        <g class="test-ring-label-group" transform="origin(25 25)">
                            <text class="test-ring-text" x="25" y="24">${Math.round(pct)}%</text>
                            <text class="test-ring-sublabel" x="25" y="32">PASS</text>
                        </g>
                    </svg>
                    <div class="test-ring-info">
                        <span class="test-ring-summary" style="color: ${pass ? '#4ade80' : '#fca5a5'}">${pass ? 'All Tests Passed' : 'Some Tests Failed'}</span>
                        <span class="test-ring-detail">${tests.pass_count} Passed · ${tests.fail_count} Failed</span>
                    </div>
                </div>
                ${rows ? `<div class="test-rows">${rows}</div>` : ''}
                ${tests.test_code ? `
                    <div class="code-section-header" style="justify-content: flex-end; border-top: none;">
                        <button class="accordion-copy-btn" onclick="copyCode('${testCodeId}')">Copy Test Code</button>
                    </div>
                    <div class="code-section-body code-body" id="${testCodeId}">${highlightPython(tests.test_code)}</div>
                ` : ''}
            </div>
        </div>`;
}

function updateHeroStats() {
    const statValues = document.querySelectorAll('.stat-value');
    if (statValues.length >= 3) {
        statValues[0].textContent = sessionStats.queries;
        statValues[0].nextElementSibling.textContent = 'Queries Asked';
        
        const avg = sessionStats.queries > 0 ? (sessionStats.sumQuality / sessionStats.queries).toFixed(1) : '0.0';
        statValues[1].textContent = avg;
        statValues[1].nextElementSibling.textContent = 'Avg Quality';
        
        statValues[2].textContent = sessionStats.totalTests;
        statValues[2].nextElementSibling.textContent = 'Tests Auto-Run';
    }
}
