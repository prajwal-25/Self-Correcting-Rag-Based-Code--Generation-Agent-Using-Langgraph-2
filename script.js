/* =============================================
   CODEFORGE AI — JavaScript
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

function useSuggestion(btn) {
    chatInput.value = btn.textContent;
    chatInput.focus();
    sendMessage();
}

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

    // Show typing indicator
    isProcessing = true;
    sendBtn.disabled = true;
    const typingEl = showTypingIndicator();

    // Call backend
    fetch('/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: msg })
    })
    .then(res => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return res.json();
    })
    .then(data => {
        typingEl.remove();
        appendAgentResponse(data);
    })
    .catch(err => {
        typingEl.remove();
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

    const preambleId = 'preamble-' + Date.now();
    const importsId = 'imports-' + Date.now();
    const codeId = 'code-' + Date.now();

    div.innerHTML = `
        <div class="message-avatar">⚡</div>
        <div class="message-bubble">
            <div class="response-top-row">
                <div class="status-badge ${statusClass}">${statusText}</div>
                <div class="iteration-info">Iterations: ${data.iterations || '?'} / 3</div>
            </div>
            <div class="code-sections-container">
                <div class="code-section">
                    <div class="code-section-header">
                        <span class="code-section-label">📝 Preamble</span>
                        <button class="code-copy-btn" onclick="copyCode('${preambleId}')">Copy</button>
                    </div>
                    <div class="code-section-body preamble-body" id="${preambleId}">${escapeHtml(data.prefix || '')}</div>
                </div>
                <div class="code-section">
                    <div class="code-section-header">
                        <span class="code-section-label">📦 Imports</span>
                        <button class="code-copy-btn" onclick="copyCode('${importsId}')">Copy</button>
                    </div>
                    <div class="code-section-body code-body" id="${importsId}">${highlightPython(data.imports || '')}</div>
                </div>
                <div class="code-section">
                    <div class="code-section-header">
                        <span class="code-section-label">⚙️ Code</span>
                        <button class="code-copy-btn" onclick="copyCode('${codeId}')">Copy</button>
                    </div>
                    <div class="code-section-body code-body" id="${codeId}">${highlightPython(data.code || '')}</div>
                </div>
            </div>
        </div>
    `;
    chatMessages.appendChild(div);
    scrollToBottom();
}

function appendErrorMessage(errMsg) {
    const div = document.createElement('div');
    div.className = 'message message-agent';
    div.innerHTML = `
        <div class="message-avatar">⚡</div>
        <div class="message-bubble">
            <div class="status-badge error">Connection Error</div>
            <p style="color: var(--text-secondary);">Could not reach the agent. Make sure the Flask server is running.</p>
            <p style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-tertiary); margin-top:8px;">${escapeHtml(errMsg)}</p>
        </div>
    `;
    chatMessages.appendChild(div);
    scrollToBottom();
}

function showTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'message message-agent';
    div.innerHTML = `
        <div class="message-avatar">⚡</div>
        <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    chatMessages.appendChild(div);
    scrollToBottom();
    return div;
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ============ Code Copy ============
function copyCode(id) {
    const codeEl = document.getElementById(id);
    const text = codeEl.innerText || codeEl.textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = codeEl.closest('.code-block-wrapper').querySelector('.code-copy-btn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
}

// ============ Syntax Highlighting (Basic) ============
function highlightPython(code) {
    if (!code) return '';
    let escaped = escapeHtml(code);

    // Keywords
    const keywords = ['import', 'from', 'def', 'class', 'return', 'if', 'elif', 'else', 
                       'for', 'while', 'in', 'not', 'and', 'or', 'try', 'except', 
                       'finally', 'with', 'as', 'raise', 'pass', 'break', 'continue',
                       'True', 'False', 'None', 'lambda', 'yield', 'assert', 'global',
                       'nonlocal', 'del', 'is'];
    
    // Strings (single and double quoted)
    escaped = escaped.replace(/(&#39;&#39;&#39;[\s\S]*?&#39;&#39;&#39;|&quot;&quot;&quot;[\s\S]*?&quot;&quot;&quot;)/g, 
        '<span class="hl-string">$1</span>');
    escaped = escaped.replace(/((?:f|r|b)?&quot;(?:[^&]|&(?!quot;))*?&quot;)/g, 
        '<span class="hl-string">$1</span>');
    escaped = escaped.replace(/((?:f|r|b)?&#39;(?:[^&]|&(?!#39;))*?&#39;)/g, 
        '<span class="hl-string">$1</span>');

    // Comments
    escaped = escaped.replace(/(#.*?)$/gm, '<span class="hl-comment">$1</span>');

    // Keywords (whole word)
    keywords.forEach(kw => {
        const regex = new RegExp(`\\b(${kw})\\b`, 'g');
        escaped = escaped.replace(regex, '<span class="hl-keyword">$1</span>');
    });

    // Function definitions
    escaped = escaped.replace(/\b(def\s+)(\w+)/g, '$1<span class="hl-func">$2</span>');
    
    // Class definitions
    escaped = escaped.replace(/\b(class\s+)(\w+)/g, '$1<span class="hl-func">$2</span>');

    // Decorators
    escaped = escaped.replace(/^(@\w+)/gm, '<span class="hl-decorator">$1</span>');

    // Numbers
    escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-number">$1</span>');

    return escaped;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}
