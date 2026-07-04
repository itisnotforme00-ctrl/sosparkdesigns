(function () {
  'use strict';

  const widget = document.createElement('div');
  widget.id = 'ss-chat';
  widget.innerHTML = `
    <button class="ssc-toggle" aria-label="Chat with Spark" aria-expanded="false">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span class="ssc-toggle__pulse"></span>
    </button>
    <div class="ssc-panel" hidden role="dialog" aria-modal="true" aria-label="Spark AI Assistant">
      <div class="ssc-panel__head">
        <div class="ssc-panel__brand">
          <div class="ssc-avatar">S</div>
          <div>
            <div class="ssc-name">Spark</div>
            <div class="ssc-status"><span class="ssc-online"></span>Online · SoSpark AI</div>
          </div>
        </div>
        <button class="ssc-close" aria-label="Close">&times;</button>
      </div>
      <div class="ssc-messages" id="ssc-msgs" role="log" aria-live="polite">
        <div class="ssc-msg ssc-msg--ai">
          <div class="ssc-bubble">Hi! I'm Spark ✦ SoSpark Design's AI assistant. Ask me about our services, process, or how we can help your brand.</div>
        </div>
      </div>
      <div class="ssc-input-row">
        <input type="text" id="ssc-input" class="ssc-input" placeholder="Ask me anything…" autocomplete="off" maxlength="500" aria-label="Message" />
        <button class="ssc-send" id="ssc-send" aria-label="Send">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #ss-chat {
      position: fixed; bottom: 28px; right: 28px; z-index: 9000;
      font-family: 'DM Sans', 'Inter', sans-serif;
    }
    .ssc-toggle {
      width: 56px; height: 56px; border-radius: 50%;
      background: #1A1714; color: #FAFAF7;
      border: none; display: flex; align-items: center; justify-content: center;
      cursor: none; position: relative;
      box-shadow: 0 8px 24px rgba(26,23,20,0.2);
      transition: transform 250ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 250ms ease;
    }
    .ssc-toggle:hover { transform: scale(1.1); box-shadow: 0 12px 32px rgba(37,99,235,0.3); }
    .ssc-toggle__pulse {
      position: absolute; top: 10px; right: 10px;
      width: 10px; height: 10px;
      background: #22c55e; border-radius: 50%; border: 2px solid #FAFAF7;
    }
    .ssc-panel {
      position: absolute; bottom: 68px; right: 0;
      width: 360px; max-height: 520px;
      background: rgba(255,253,250,0.92);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border: 1px solid rgba(255,255,255,0.7);
      border-radius: 24px;
      display: flex; flex-direction: column;
      overflow: hidden;
      box-shadow: 0 24px 80px rgba(26,23,20,0.14), 0 4px 16px rgba(26,23,20,0.06);
      animation: panelIn 280ms cubic-bezier(0.16,1,0.3,1);
    }
    .ssc-panel[hidden] { display: none; }
    @keyframes panelIn {
      from { opacity: 0; transform: translateY(12px) scale(0.95); }
      to   { opacity: 1; transform: none; }
    }
    .ssc-panel__head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 16px; border-bottom: 1px solid rgba(200,195,188,0.3);
      background: rgba(255,253,250,0.6);
      flex-shrink: 0;
    }
    .ssc-panel__brand { display: flex; align-items: center; gap: 10px; }
    .ssc-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg, rgba(37,99,235,0.15), rgba(201,151,58,0.15));
      border: 1px solid rgba(37,99,235,0.3);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Playfair Display', 'Space Grotesk', serif;
      font-weight: 700; font-size: 14px; color: #2563EB;
    }
    .ssc-name { font-weight: 600; font-size: 14px; color: #1A1714; }
    .ssc-status { font-size: 11px; color: #8A8480; display: flex; align-items: center; gap: 4px; }
    .ssc-online {
      width: 6px; height: 6px; background: #22c55e; border-radius: 50%;
      display: inline-block; animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.2)} }
    .ssc-close {
      background: none; border: none; color: #8A8480; font-size: 20px;
      cursor: none; line-height: 1; padding: 4px; transition: color 200ms;
    }
    .ssc-close:hover { color: #1A1714; }
    .ssc-messages {
      flex: 1; overflow-y: auto; padding: 14px;
      display: flex; flex-direction: column; gap: 10px;
      scrollbar-width: thin; scrollbar-color: #E2DDD5 transparent;
    }
    .ssc-msg { display: flex; }
    .ssc-msg--user { justify-content: flex-end; }
    .ssc-bubble {
      max-width: 82%; padding: 10px 14px; border-radius: 16px;
      font-size: 13px; line-height: 1.55;
    }
    .ssc-msg--ai .ssc-bubble {
      background: rgba(237,233,225,0.8);
      border: 1px solid rgba(200,195,188,0.4);
      color: #4A4540;
      border-radius: 4px 16px 16px 16px;
    }
    .ssc-msg--user .ssc-bubble {
      background: #1A1714; color: #FAFAF7;
      border-radius: 16px 4px 16px 16px;
    }
    .ssc-typing .ssc-bubble { display: flex; gap: 4px; align-items: center; padding: 14px; }
    .ssc-dot {
      width: 6px; height: 6px; border-radius: 50%; background: #8A8480;
      animation: typingBounce 1.2s ease-in-out infinite;
    }
    .ssc-dot:nth-child(2) { animation-delay: 0.2s; }
    .ssc-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typingBounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
    .ssc-input-row {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 14px;
      border-top: 1px solid rgba(200,195,188,0.3);
      background: rgba(255,253,250,0.6);
      flex-shrink: 0;
    }
    .ssc-input {
      flex: 1; background: rgba(237,233,225,0.6);
      border: 1px solid rgba(200,195,188,0.5);
      border-radius: 999px; padding: 9px 14px;
      font-size: 13px; color: #1A1714; outline: none;
      transition: border-color 200ms;
    }
    .ssc-input::placeholder { color: #8A8480; }
    .ssc-input:focus { border-color: #2563EB; }
    .ssc-send {
      width: 36px; height: 36px; border-radius: 50%;
      background: #1A1714; color: #FAFAF7; border: none;
      cursor: none; display: flex; align-items: center; justify-content: center;
      transition: background 200ms, transform 150ms; flex-shrink: 0;
    }
    .ssc-send:hover { background: #2563EB; transform: scale(1.05); }
    .ssc-send:disabled { opacity: 0.4; }
    @media (max-width: 480px) {
      #ss-chat { bottom: 16px; right: 16px; }
      .ssc-panel { width: calc(100vw - 32px); }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(widget);

  const toggle  = widget.querySelector('.ssc-toggle');
  const panel   = widget.querySelector('.ssc-panel');
  const close   = widget.querySelector('.ssc-close');
  const input   = widget.querySelector('#ssc-input');
  const sendBtn = widget.querySelector('#ssc-send');
  const msgs    = widget.querySelector('#ssc-msgs');

  let isOpen = false, loading = false;
  let history = [];

  const open  = () => { isOpen = true;  panel.hidden = false; toggle.setAttribute('aria-expanded','true');  input.focus(); };
  const close_ = () => { isOpen = false; panel.hidden = true;  toggle.setAttribute('aria-expanded','false'); };

  toggle.addEventListener('click', () => isOpen ? close_() : open());
  close.addEventListener('click', close_);

  function appendMsg(role, text) {
    const d = document.createElement('div');
    d.className = 'ssc-msg ssc-msg--' + (role === 'user' ? 'user' : 'ai');
    d.innerHTML = '<div class="ssc-bubble">' + esc(text) + '</div>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  function showTyping() {
    const d = document.createElement('div');
    d.className = 'ssc-msg ssc-msg--ai ssc-typing';
    d.id = 'ssc-typing';
    d.innerHTML = '<div class="ssc-bubble"><span class="ssc-dot"></span><span class="ssc-dot"></span><span class="ssc-dot"></span></div>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function hideTyping() {
    const t = document.getElementById('ssc-typing');
    if (t) t.remove();
  }

  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // A6: on-brand messages for each known failure case, instead of a raw JS
  // error or a silent stall. Keyed loosely off HTTP status / backend `code`
  // rather than string-matching error text.
  const FALLBACK_MESSAGES = {
    NOT_CONFIGURED: "I'm not able to chat right now — the team's already been notified. Feel free to reach out through the contact page in the meantime.",
    RATE_LIMITED: "I'm getting a lot of messages right now — give it a minute and try again.",
    POOL_EXHAUSTED: "I'm having trouble connecting on my end. Please try again shortly, or reach out via the contact page.",
    TIMEOUT: 'That took longer than expected — please try again.',
    GENERIC: 'Sorry, I ran into an issue on my end. Please try again in a moment.',
    OFFLINE: 'Connection issue — please try again.',
  };

  async function send() {
    const text = input.value.trim();
    if (!text || loading) return;
    input.value = '';
    loading = true;
    sendBtn.disabled = true;

    appendMsg('user', text);
    history.push({ role: 'user', content: text });
    showTyping();

    // Guard against a hung request leaving the "typing…" indicator forever.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      let data = {};
      try { data = await res.json(); } catch { /* non-JSON error body, fall through */ }

      hideTyping();

      if (res.ok && data.reply) {
        appendMsg('ai', data.reply);
        history.push({ role: 'assistant', content: data.reply });
      } else if (res.status === 429) {
        // Server-wide 60 req/min limiter (set in server.js) or an
        // exhausted-but-rate-limited pool.
        appendMsg('ai', FALLBACK_MESSAGES.RATE_LIMITED);
      } else if (data.code === 'NOT_CONFIGURED') {
        appendMsg('ai', FALLBACK_MESSAGES.NOT_CONFIGURED);
      } else if (data.code === 'POOL_EXHAUSTED') {
        appendMsg('ai', FALLBACK_MESSAGES.POOL_EXHAUSTED);
      } else {
        appendMsg('ai', FALLBACK_MESSAGES.GENERIC);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      hideTyping();
      if (err.name === 'AbortError') {
        appendMsg('ai', FALLBACK_MESSAGES.TIMEOUT);
      } else {
        appendMsg('ai', FALLBACK_MESSAGES.OFFLINE);
      }
    }

    loading = false;
    sendBtn.disabled = false;
    input.focus();
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
})();