// layout-toggles.js - unified homepage + inline thread behaviors
(function () {
  const layout = document.getElementById('app-layout');
  const threadSection = document.getElementById('col-center');
  const threadRoot = document.getElementById('message-thread-root');
  const sidebar = document.getElementById('col-right');
  const sidebarPanel = document.getElementById('sidebar-panel');

  // Time management (used on homepage and potentially other views)
  function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const timeElement = document.getElementById('current-time');
    if (timeElement) timeElement.textContent = timeString;
  }

  function startTimeUpdates() {
    updateTime();
    setInterval(updateTime, 60000);
  }

//Thread section show/hide
  function showThread() {
    if (threadSection && threadSection.hasAttribute('hidden')) {
      threadSection.removeAttribute('hidden');
    }
    layout && layout.classList.remove('is-center-collapsed');
  }

  function hideThread() {
    if (threadSection) {
      threadSection.setAttribute('hidden', '');
	  document.querySelectorAll('.conversation-list__item.is-active').forEach(n => n.classList.remove('is-active'));

    }
    layout && layout.classList.add('is-center-collapsed');
    // Optional: clear content
     if (threadRoot) threadRoot.innerHTML = '';
  }

  // Sidebar open/close
  function openSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('is-collapsed');
    sidebar.setAttribute('aria-expanded', 'true');
    if (sidebarPanel) sidebarPanel.hidden = false;
    if (layout) layout.classList.remove('is-right-collapsed');
  }

  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.add('is-collapsed');
    sidebar.setAttribute('aria-expanded', 'false');
    if (sidebarPanel) sidebarPanel.hidden = true;
    if (layout) layout.classList.add('is-right-collapsed');
  }

  function fmtTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { return ''; }
  }

  function escapeHTML(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Populate selected message thread
  function renderMessages(messages, hostAuthor) {
    if (!threadRoot) return;
    if (!Array.isArray(messages) || messages.length === 0) {
      threadRoot.innerHTML = '<div class="message-thread__empty">No messages in this conversation.</div>';
      return;
    }

    const html = messages.map(m => {
      const author = escapeHTML(m.username || 'Anonymous');
      const content = escapeHTML(m.message || '');
      const time = fmtTime(m.date || m.sent_at);
      const isGuest = hostAuthor ? (author !== hostAuthor) : true;
      const alignClass = isGuest ? 'message-thread__message--guest' : 'message-thread__message--host';
      const userClass = isGuest ? 'user-badge user__guest' : 'user-badge';
      const displayName = `&lt;${author}&gt;`;
      return `
        <div class="message-thread__message ${alignClass}">
          <div class="message-thread__header">
            <span class="message-thread__username ${userClass}">${displayName}</span>
          </div>
          <div class="message-thread__content">${content}</div>
          <time class="message-thread__timestamp">${time}</time>
        </div>`;
    }).join('');

    threadRoot.innerHTML = html;
  }

  async function loadThread(sessionId) {
    if (!sessionId) return;
    try {
      // Fetch messages JSON from server
      const res = await fetch(`/messages?session_id=${encodeURIComponent(sessionId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderMessages(data.messages, data.author);
      showThread();
    } catch (err) {
      console.error('Failed to load thread', err);
      if (threadRoot) threadRoot.innerHTML = `<div class="message-thread__error">Failed to load messages: ${escapeHTML(err.message)}</div>`;
      showThread();
    }
  }

  function markActiveItem(el) {
    const wasActive = el?.classList.contains('is-active');
    document.querySelectorAll('.conversation-list__item.is-active').forEach(n => n.classList.remove('is-active'));
    
    if (wasActive) {
      // If clicking on already active item, close the thread
      hideThread();
      return false;
    } else {
      el?.classList.add('is-active');
      return true;
    }
  }

  function onListClick(e) {
    const item = e.target.closest('.conversation-list__item');
    if (!item) return;
    const sessionId = item.getAttribute('data-session-id');
    if (!sessionId) return;
    e.preventDefault();
    
    const shouldLoadThread = markActiveItem(item);
    if (shouldLoadThread) {
      loadThread(sessionId);
    }
  }

  // Hover effects (from homepage.js)
  function setupHoverEffects() {
    const conversationItems = document.querySelectorAll('.conversation-list__item');
    conversationItems.forEach(function (item) {
      item.addEventListener('mouseenter', function () {
        this.style.transform = 'translateX(4px)';
        this.style.transition = 'transform 0.2s ease';
      });
      item.addEventListener('mouseleave', function () {
        this.style.transform = 'translateX(0)';
      });
    });

    const visualCircle = document.querySelector('.conversation-display__visual-circle');
    if (visualCircle) {
      visualCircle.addEventListener('mouseenter', function () {
        this.style.transform = 'scale(1.05)';
      });
      visualCircle.addEventListener('mouseleave', function () {
        this.style.transform = 'scale(1)';
      });
    }
  }

  // Navigation fallback (when inline thread is not present)
  function viewSession(sessionId) {
    if (sessionId) {
      window.location.href = `/messages-view?session_id=${sessionId}`;
    }
  }

  function attachNavigationClick() {
    document.addEventListener('click', function (e) {
      const item = e.target.closest('.conversation-list__item');
      if (!item) return;
      e.preventDefault();
      const sessionId = item.getAttribute('data-session-id');
      if (sessionId && sessionId.trim() !== '') {
        viewSession(sessionId);
      }
    });
  }

  // Init
  document.addEventListener('DOMContentLoaded', function () {
    startTimeUpdates();
    // setupHoverEffects();

    const hasInline = !!(threadSection && threadRoot);
    if (hasInline) {
      document.addEventListener('click', function (e) {
        if (e.target.closest('.js-thread-close')) {
          e.preventDefault();
          hideThread();
          return;
        }
        if (e.target.closest('.js-sidebar-open')) {
          e.preventDefault();
          openSidebar();
          return;
        }
        if (e.target.closest('.js-sidebar-close')) {
          e.preventDefault();
          closeSidebar();
          return;
        }
        if (e.target.closest('.conversation-list__item')) {
          onListClick(e);
        }
      });
    } else {
      attachNavigationClick();
    }
  });
})();
