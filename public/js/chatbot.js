// chatbot.js – lightweight client-side AI chat UI integration
(function() {
  // Generate a UUID v4 for the session if not already stored
  const clientIdKey = 'chatClientId';
  let clientId = sessionStorage.getItem(clientIdKey);
  if (!clientId) {
    clientId = crypto.randomUUID();
    sessionStorage.setItem(clientIdKey, clientId);
  }

  // Elements
  const toggleBtn = document.getElementById('chatbot-toggle');
  const overlay = document.getElementById('chatbot-overlay');
  const closeBtn = document.getElementById('chatbot-close');
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  const body = document.getElementById('chatbot-body');

  // Helper to append a message bubble
  function appendMessage(content, role = 'assistant') {
    const msg = document.createElement('div');
    msg.className = `chat-message ${role}`;
    msg.textContent = content;
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;
  }

  // Show/hide overlay
  toggleBtn && toggleBtn.addEventListener('click', () => {
    overlay && overlay.classList.remove('hidden');
    toggleBtn.style.display = 'none';
    // Show welcome screen once per session
    if (!sessionStorage.getItem('chatWelcomeShown')) {
      appendMessage('👋 Welcome! I’m your ESG assistant. Ask me anything.', 'assistant');
      sessionStorage.setItem('chatWelcomeShown', 'true');
    }
  });

  closeBtn && closeBtn.addEventListener('click', () => {
    overlay && overlay.classList.add('hidden');
    toggleBtn && (toggleBtn.style.display = 'flex');
  });

  // Send button – delegates to the page‑level sendMessage if it exists
  sendBtn && sendBtn.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) return;
    // Show user message immediately
    appendMessage(text, 'user');
    input.value = '';
    // Call the existing global sendMessage (defined in the page) if available
    if (typeof window.sendMessage === 'function') {
      // The global sendMessage reads from #chatInput, so temporarily set it
      input.value = text;
      await window.sendMessage();
    } else {
      console.warn('Global sendMessage function not found');
    }
  });
})();
