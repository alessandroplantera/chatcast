// layout-toggles.js - unified homepage + inline thread behaviors
(function () {
  const layout = document.getElementById('app-layout');
  const threadSection = document.getElementById('col-center');
  const threadRoot = document.getElementById('message-thread-root');
  const sidebar = document.getElementById('col-right');
  const sidebarPanel = document.getElementById('sidebar-panel');
  
  // Guest card elements
  const guestCard = document.getElementById('guest-card');
  const guestCardTitle = document.getElementById('guest-card-title');
  const guestCardCover = document.getElementById('guest-card-cover');
  const guestCardContent = document.getElementById('guest-card-content');

  // Sidebar tabs
  const tabAbout = document.getElementById('sidebar-tab-about');
  const tabGuest = document.getElementById('sidebar-tab-guest');
  const guestTabTitle = document.getElementById('guest-tab-title');
  const contentAbout = document.getElementById('sidebar-content-about');
  const contentGuest = document.getElementById('sidebar-content-guest');

  // Preloaded guest data cache (from Notion)
  const guestCache = new Map();
  let guestCacheLoaded = false;

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

  function toggleSidebar() {
    if (!sidebar) return;
    const isCollapsed = sidebar.classList.contains('is-collapsed');
    if (isCollapsed) {
      openSidebar();
    } else {
      closeSidebar();
    }
  }

  // Check if we're on mobile
  function isMobile() {
    return window.innerWidth <= 768;
  }

  // ============================================
  // NOTION PRELOAD (load all guests at startup)
  // ============================================
  
  async function preloadNotionGuests() {
    if (guestCacheLoaded) return;
    
    try {
      const res = await fetch('/api/notion/pages');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      
      if (data.pages && Array.isArray(data.pages)) {
        // Store basic info in cache
        data.pages.forEach(page => {
          if (page.title && page.title.toLowerCase() !== 'upcoming-chat') {
            guestCache.set(page.title.toLowerCase(), {
              id: page.id,
              title: page.title,
              properties: page.properties,
              cover: page.cover,
              icon: page.icon,
              // Mark as partial - will fetch full content on demand
              partial: true
            });
          }
        });
        guestCacheLoaded = true;
        console.log(`Notion: Preloaded ${guestCache.size} guests`);
      }
    } catch (err) {
      console.error('Failed to preload Notion guests:', err);
    }
  }

  // ============================================
  // UPCOMING CHAT BANNER (Notion CMS)
  // ============================================
  
  async function loadUpcomingChatBanner() {
    const bannerDate = document.getElementById('upcoming-chat-date');
    const bannerParticipants = document.getElementById('upcoming-chat-participants');
    const bannerTopic = document.getElementById('upcoming-chat-topic');
    
    if (!bannerParticipants) return;
    
    // Wait for guests to be preloaded first
    await preloadNotionGuests();
    
    try {
      const res = await fetch('/api/notion/upcoming-chat');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      
      if (data.found && data.properties) {
        // Get date
        const date = data.properties.Date || data.properties.date;
        if (date && bannerDate) {
          bannerDate.textContent = formatBannerDate(date);
        }
        
        // Parse Description: "Guest1 and Guest2 / Topic"
        const description = data.properties.Description || data.properties.description || '';
        const parts = description.split('/').map(s => s.trim());
        
        if (parts.length >= 2) {
          // Participants part (before /)
          const participantsText = parts[0];
          // Topic part (after /)
          const topicText = parts.slice(1).join('/').trim(); // In case topic contains /
          
          // Make guest names clickable and add "will talk about:"
          bannerParticipants.innerHTML = linkifyGuestNames(participantsText) + ' will talk about:';
          
          if (bannerTopic) {
            bannerTopic.textContent = topicText;
          }
        } else {
          // No / found, just show description
          bannerParticipants.innerHTML = linkifyGuestNames(description);
          if (bannerTopic) bannerTopic.textContent = '';
        }
      } else {
        bannerParticipants.textContent = 'No Upcoming Chats Scheduled';
        if (bannerDate) bannerDate.textContent = '';
        if (bannerTopic) bannerTopic.textContent = '';
      }
    } catch (err) {
      console.error('Failed to load upcoming chat:', err);
      bannerParticipants.textContent = 'No Upcoming Chats Scheduled';
      if (bannerDate) bannerDate.textContent = '';
      if (bannerTopic) bannerTopic.textContent = '';
    }
  }
  
  /**
   * Find guest names in text and wrap them with clickable spans
   */
  function linkifyGuestNames(text) {
    if (!text || guestCache.size === 0) return escapeHTML(text);
    
    let result = escapeHTML(text);
    
    // Sort by name length (longest first) to avoid partial replacements
    const guestNames = Array.from(guestCache.values())
      .map(g => g.title)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    
    for (const name of guestNames) {
      // Case-insensitive search, but preserve original case in output
      const regex = new RegExp(`(${escapeRegex(name)})`, 'gi');
      result = result.replace(regex, `<span class="js-guest-name guest-link" data-guest-name="${escapeHTML(name)}">&lt;$1&gt;</span>`);
    }
    
    return result;
  }
  
  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  function formatBannerDate(dateString) {
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString('en-GB', { 
        weekday: 'short',
        day: '2-digit', 
        month: 'short', 
        year: 'numeric'
      });
    } catch (e) {
      return dateString;
    }
  }
  
  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  // ============================================
  // GUEST CARD (Notion CMS)
  // ============================================
  
  function showGuestCard() {
    if (guestCard) {
      guestCard.classList.add('is-visible');
    }
  }
  
  function hideGuestCard() {
    if (guestCard) {
      guestCard.classList.remove('is-visible');
      // Clear content
      if (guestCardTitle) guestCardTitle.textContent = '';
      if (guestCardCover) guestCardCover.innerHTML = '';
      if (guestCardContent) guestCardContent.innerHTML = '';
    }
    // Hide guest tab and switch to about
    hideGuestTab();
  }
  
  async function loadGuestInfo(guestName) {
    if (!guestName) return;
    
    const cacheKey = guestName.toLowerCase();
    
    // Check if we have it in cache (full data)
    const cached = guestCache.get(cacheKey);
    if (cached && !cached.partial) {
      renderGuestCard(cached);
      switchToGuestTab();
      return true;
    }
    
    try {
      const res = await fetch(`/api/notion/page/${encodeURIComponent(guestName)}`);
      
      if (!res.ok) {
        if (res.status === 404) {
          console.log(`No Notion page found for guest: ${guestName}`);
          return false;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      
      const data = await res.json();
      
      // Store full data in cache
      guestCache.set(cacheKey, { ...data, partial: false });
      
      renderGuestCard(data);
      switchToGuestTab();
      return true;
    } catch (err) {
      console.error('Failed to load guest info:', err);
      return false;
    }
  }
  
  function renderGuestCard(data) {
    if (!guestCard) return;
    
    const guestName = data.title || 'Guest';
    
    // Set title (hidden, for reference)
    if (guestCardTitle) {
      guestCardTitle.textContent = `<${guestName}>`;
    }
    
    // Set tab title
    if (guestTabTitle) {
      guestTabTitle.textContent = `<${guestName}>`;
    }
    
    // Set cover image (use media first, then cover, then first file)
    if (guestCardCover) {
      const imageUrl = data.media || data.cover || (data.properties?.Media?.[0]);
      if (imageUrl) {
        guestCardCover.innerHTML = `<img src="${imageUrl}" alt="${escapeHTML(guestName)}" />`;
      } else {
        guestCardCover.innerHTML = '';
      }
    }
    
    // Set content: use Description from properties, or page content, or fallback
    if (guestCardContent) {
      const description = data.properties?.Description;
      const socialHandle = data.properties?.['@'];
      const url = data.properties?.URL;
      
      let html = '';
      
      // Add description
      if (description) {
        html += `<p>${escapeHTML(description)}</p>`;
      }
      
      // Add social handle as link (uses URL as href)
      if (socialHandle) {
        if (url) {
          html += `<p class="guest-card__social"><a href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(socialHandle)}</a></p>`;
        } else {
          html += `<p class="guest-card__social">${escapeHTML(socialHandle)}</p>`;
        }
      }
      
      // Add page content if any
      if (data.content) {
        html += data.content;
      }
      
      guestCardContent.innerHTML = html || '<p>No additional information available.</p>';
    }
    
    showGuestCard();
    openSidebar();
  }

  // ============================================
  // SIDEBAR TABS
  // ============================================
  
  const tabsContainer = document.querySelector('.sidebar__tabs');
  
  function switchToAboutTab() {
    // Only add is-active if there's a guest tab visible
    const hasGuestTab = tabGuest && !tabGuest.hidden;
    if (tabAbout) {
      if (hasGuestTab) {
        tabAbout.classList.add('is-active');
      } else {
        tabAbout.classList.remove('is-active');
      }
    }
    if (tabGuest) tabGuest.classList.remove('is-active');
    if (contentAbout) contentAbout.classList.add('is-active');
    if (contentGuest) contentGuest.classList.remove('is-active');
  }
  
  function switchToGuestTab() {
    if (tabAbout) tabAbout.classList.remove('is-active');
    if (tabGuest) {
      tabGuest.classList.add('is-active');
      tabGuest.hidden = false;
    }
    if (contentAbout) contentAbout.classList.remove('is-active');
    if (contentGuest) contentGuest.classList.add('is-active');
    // Add has-guest class to enable multi-tab styling
    if (tabsContainer) tabsContainer.classList.add('has-guest');
  }
  
  function hasGuestData() {
    return guestCardTitle && guestCardTitle.textContent.trim() !== '';
  }
  
  function showGuestTab() {
    if (tabGuest) tabGuest.hidden = false;
    if (tabsContainer) tabsContainer.classList.add('has-guest');
  }
  
  function hideGuestTab() {
    if (tabGuest) tabGuest.hidden = true;
    // Remove has-guest class - ABOUT takes full width again
    if (tabsContainer) tabsContainer.classList.remove('has-guest');
    if (tabAbout) tabAbout.classList.remove('is-active'); // No active state when alone
    switchToAboutTab();
  }
  
  // Extract guest name from click on user__guest element
  function getGuestNameFromElement(el) {
    const text = el.textContent || '';
    // Remove < and > brackets
    return text.replace(/^<|>$/g, '').trim();
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
      const userClass = isGuest ? 'user-badge user__guest js-guest-name' : 'user-badge';
      const displayName = `&lt;${author}&gt;`;
      return `
        <div class="message-thread__message ${alignClass}">
          <div class="message-thread__header">
            <span class="message-thread__username ${userClass}" data-guest-name="${author}">${displayName}</span>
          </div>
          <div class="message-thread__content">${content}</div>
          <time class="message-thread__timestamp">${time}</time>
        </div>`;
    }).join('');

    threadRoot.innerHTML = html;
  }

  // Render thread header with session info
  function renderThreadHeader(session) {
    const headerContent = document.getElementById('thread-header-content');
    if (!headerContent || !session) return;

    const author = escapeHTML(session.author || 'Host');
    const title = escapeHTML(session.title || `Conversation ${session.session_id}`);
    const participants = session.participants || [];
    const messageCount = session.message_count || 0;
    const status = session.status || 'archived';
    const startDate = session.start_date ? formatDate(session.start_date) : 'No date available';

    // Filter out the author from participants
    const guests = participants.filter(p => p !== session.author);
    const guestHtml = guests.length > 0
      ? guests.map(g => `<span class="user-badge user__guest js-guest-name" data-guest-name="${escapeHTML(g)}">&lt;${escapeHTML(g)}&gt;</span>`).join(' ')
      : '<span class="user-badge user__guest">&lt;Guest&gt;</span>';

    const statusLabel = status === 'active' ? 'Live' : status === 'paused' ? 'Paused' : 'Archived';
    const messagesLabel = messageCount === 1 ? '1 message' : `${messageCount} messages`;

    headerContent.innerHTML = `
      <div class="conversation-list__header">
        <div>
          <div class="conversation-list__header-title">
            <span class="user-badge">&lt;${author}&gt;</span> and ${guestHtml} talking about ${title}
          </div>
        </div>
      </div>
      <div class="conversation-list__meta">
        <div class="conversation-list__meta-info">
          <div class="infos__sx">
            <span class="status-indicator status-indicator--${status}">${statusLabel}</span>
            - ${startDate}
          </div>
          <div class="infos__dx">
            <div class="conversation-list__header-meta">
              <div class="conversation-list__meta-badge">[${messagesLabel}]</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function formatDate(dateString) {
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return dateString;
    }
  }

  async function loadThread(sessionId) {
    if (!sessionId) return;
    try {
      // Fetch messages JSON from server
      const res = await fetch(`/messages?session_id=${encodeURIComponent(sessionId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderThreadHeader(data.session);
      renderMessages(data.messages, data.session?.author);
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
    loadUpcomingChatBanner(); // Load banner from Notion
    preloadNotionGuests(); // Preload guest data for faster clicks
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
          // On mobile, toggle instead of just open
          if (isMobile()) {
            toggleSidebar();
          } else {
            openSidebar();
          }
          return;
        }
        if (e.target.closest('.js-sidebar-close')) {
          e.preventDefault();
          closeSidebar();
          return;
        }
        // Close guest card
        if (e.target.closest('.js-guest-card-close')) {
          e.preventDefault();
          hideGuestCard();
          return;
        }
        // Tab clicks
        if (e.target.closest('.js-tab-about')) {
          e.preventDefault();
          switchToAboutTab();
          return;
        }
        if (e.target.closest('.js-tab-guest')) {
          e.preventDefault();
          switchToGuestTab();
          return;
        }
        // Click on guest name to load info from Notion
        if (e.target.closest('.js-guest-name')) {
          e.preventDefault();
          e.stopPropagation();
          const guestEl = e.target.closest('.js-guest-name');
          const guestName = guestEl.getAttribute('data-guest-name') || getGuestNameFromElement(guestEl);
          if (guestName) {
            loadGuestInfo(guestName);
          }
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
