// layout-toggles.js - unified homepage + inline thread behaviors
(function () {
  const layout = document.getElementById('app-layout');
  const threadSection = document.getElementById('col-center');
  const threadRoot = document.getElementById('message-thread-root');
  const sidebar = document.getElementById('col-right');
  const initialTitle = document.title || 'Dialogs';

  // About panel elements
  const aboutPanel = document.getElementById('about-panel');
  const aboutSidebarTab = document.querySelector('.js-about-tab-open');

  // Guest panel elements
  const guestPanel = document.getElementById('guest-panel');
  const guestSidebarTab = document.getElementById('guest-sidebar-tab');
  const guestSidebarTabLabel = document.getElementById('guest-sidebar-tab-label');
  const guestPanelTitle = document.getElementById('guest-panel-title');

  // Guest card elements
  const guestCard = document.getElementById('guest-card');
  const guestCardTitle = document.getElementById('guest-card-title');
  const guestCardCover = document.getElementById('guest-card-cover');
  const guestCardContent = document.getElementById('guest-card-content');

  // Preloaded guest data cache (from Notion)
  const guestCache = new Map();
  let guestCacheLoaded = false;
  
  // User metadata cache (override names, status from Notion)
  let userMetadataCache = {};
  // Socket state for real-time updates (inline thread)
  let currentSocketSession = null;
  let socketMessageHandler = null;
  
  // Helper to get display name with override
  // Searches by key first, then by checking if the input matches any originalName or displayName
  function getDisplayName(username) {
    if (!username) return 'Anonymous';
    const userLower = username.toLowerCase();
    
    // Direct key match
    let metadata = userMetadataCache[userLower];
    
    // If not found, search through all entries to find by displayName
    if (!metadata) {
      for (const [key, meta] of Object.entries(userMetadataCache)) {
        // Check if the input matches the displayName (case-insensitive)
        if (meta.displayName && meta.displayName.toLowerCase() === userLower) {
          metadata = meta;
          break;
        }
      }
    }
    
    return metadata?.displayName || metadata?.override || username;
  }

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

    // Leave socket room and remove handler when thread is closed
    try {
      if (window.SocketClient && currentSocketSession) {
        if (socketMessageHandler) {
          SocketClient.off('message:new', socketMessageHandler);
          socketMessageHandler = null;
        }
        SocketClient.leaveSession(currentSocketSession);
        currentSocketSession = null;
      }
    } catch (e) { /* ignore */ }
    // Restore URL/title when closing inline thread
    try {
      if (window.history && window.history.pushState) {
        window.history.pushState(null, initialTitle, window.location.pathname);
        document.title = initialTitle;
      }
    } catch (e) { /* ignore */ }
  }

  // About panel open/close
  function openAboutPanel() {
    if (!sidebar || !aboutPanel) return;
    closeGuestPanel(); // Close guest panel if open
    sidebar.classList.remove('is-collapsed');
    sidebar.setAttribute('aria-expanded', 'true');
    aboutPanel.hidden = false;
    if (layout) layout.classList.remove('is-right-collapsed');
  }

  function closeAboutPanel() {
    if (!sidebar || !aboutPanel) return;
    sidebar.classList.add('is-collapsed');
    sidebar.setAttribute('aria-expanded', 'false');
    aboutPanel.hidden = true;
    if (layout) layout.classList.add('is-right-collapsed');
  }

  // Guest panel open/close
  function openGuestPanel() {
    if (!sidebar || !guestPanel) return;
    closeAboutPanel(); // Close about panel if open
    sidebar.classList.remove('is-collapsed');
    sidebar.setAttribute('aria-expanded', 'true');
    guestPanel.hidden = false;
    if (layout) layout.classList.remove('is-right-collapsed');
  }

  function closeGuestPanel() {
    if (!guestPanel) return;
    guestPanel.hidden = true;
    // Don't collapse sidebar here - let closeAboutPanel handle it if needed
  }

  // Close all panels and collapse sidebar
  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.add('is-collapsed');
    sidebar.setAttribute('aria-expanded', 'false');
    if (aboutPanel) aboutPanel.hidden = true;
    if (guestPanel) guestPanel.hidden = true;
    if (layout) layout.classList.add('is-right-collapsed');
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
      // Fetch user metadata (server returns both mappings)
      // Keys are displayName (lowercase) -> { displayName, isGuest, isHost }
      const res = await fetch('/api/user-metadata');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      // Both byOriginal and byDisplay now use displayName as key (for privacy)
      const source = data.byOriginal || data.byDisplay || {};
      Object.entries(source).forEach(([key, meta]) => {
        // key is displayName lowercased
        userMetadataCache[key] = {
          displayName: meta.displayName || key,
          override: meta.displayName || null, // For backward compatibility
          isGuest: Boolean(meta.isGuest),
          isHost: Boolean(meta.isHost),
          // originalName is not exposed for privacy, use displayName
          originalName: meta.displayName || key
        };
      });
      guestCacheLoaded = true;
    } catch (err) {
      console.error('Failed to preload user metadata:', err);
    }
  }

  // ============================================
  // UPCOMING CHAT BANNER (Notion CMS)
  // ============================================
  
  async function loadUpcomingChatBanner() {
    const bannerDate = document.getElementById('upcoming-chat-date');
    const bannerTime = document.getElementById('upcoming-chat-time');
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
        // Get time
        if (date && bannerTime) {
          bannerTime.textContent = formatBannerTime(date);
        }
        // Description comes entirely from Notion; we no longer split on '/'
        const description = data.properties.Description || data.properties.description || '';
        const normalized = normalizeParticipantsText(description);

        if (normalized) {
          // Render full sentence, with participant names turned into clickable badges
          bannerParticipants.innerHTML = linkifyGuestNames(normalized);
        } else {
          bannerParticipants.textContent = '';
        }

        if (bannerTopic) bannerTopic.textContent = '';
      } else {
        bannerParticipants.textContent = 'No Upcoming Chats Scheduled';
        if (bannerDate) bannerDate.textContent = '';
        if (bannerTime) bannerTime.textContent = '';
        if (bannerTopic) bannerTopic.textContent = '';
      }
    } catch (err) {
      console.error('Failed to load upcoming chat:', err);
      bannerParticipants.textContent = 'No Upcoming Chats Scheduled';
      if (bannerDate) bannerDate.textContent = '';
      if (bannerTime) bannerTime.textContent = '';
      if (bannerTopic) bannerTopic.textContent = '';
    }
  }
  
  // Normalize participants text coming from Notion Description
  // Strips angle brackets so we do not end up with duplicated
  // "<<Name>>" when linkifyGuestNames adds its own < > wrappers.
  function normalizeParticipantsText(text) {
    if (!text) return '';
    return text.replace(/[<>]/g, '').trim();
  }

  // Render upcoming chat participants safely using DOM nodes
  function renderUpcomingParticipants(text, container) {
    if (!container) return;

    // Clear previous content
    container.textContent = '';

    if (!text) return;

    // Remove potential quotes around the whole string
    const clean = text.replace(/["“”]/g, '').trim();
    if (!clean) return;

    // Very simple split: "Name1 and Name2" -> [Name1, Name2]
    const names = clean.split(/\s+and\s+/i).map(n => n.trim()).filter(Boolean);

    names.forEach((name, index) => {
      if (index > 0) {
        container.appendChild(document.createTextNode(' and '));
      }

      // Try to find meta - first by exact key, then by override match
      const nameLower = name.toLowerCase();
      let meta = userMetadataCache[nameLower];
      let originalName = name;

      if (meta) {
        // Found by key - use the stored originalName
        originalName = meta.originalName || name;
      } else {
        // Search by override (display name)
        for (const [origKey, m] of Object.entries(userMetadataCache)) {
          if (m.override && m.override.toLowerCase() === nameLower) {
            meta = m;
            originalName = m.originalName || origKey;
            break;
          }
        }
      }

      const isGuest = meta?.isGuest === true;
      const displayName = meta?.override || name;

      const span = document.createElement('span');
      span.className = isGuest ? 'user-badge user__guest js-guest-name' : 'user-badge js-guest-name';
      // Use original name for data-guest-name so Notion lookup works
      span.setAttribute('data-guest-name', originalName);
      span.textContent = `<${displayName}>`;

      container.appendChild(span);
    });
  }

  /**
   * Find guest/host names in text and wrap them with clickable spans
   * Searches for BOTH original names and override names in the text
   * Always uses original name in data-guest-name for Notion lookup
   * Applies correct styling: violet for guests, white for hosts
   */
  function linkifyGuestNames(text) {
    if (!text || (guestCache.size === 0 && Object.keys(userMetadataCache).length === 0)) return escapeHTML(text);

    // DON'T escape the entire text yet - we'll escape parts as we replace
    let result = text;

    // Build list of all names (original + override) with metadata
    const nameMatches = [];
    const processedNames = new Set(); // Track already replaced names to avoid duplicates

    if (guestCache.size > 0) {
      for (const guest of guestCache.values()) {
        const originalName = guest.title;
        if (!originalName) continue;

        const displayName = getDisplayName(originalName);
        const metadata = userMetadataCache[originalName.toLowerCase()];
        const isGuest = metadata?.isGuest === true;
        const userClass = isGuest ? 'user-badge user__guest js-guest-name' : 'user-badge js-guest-name';

        // Add both original and override (if different) to search
        nameMatches.push({
          searchTerm: originalName,
          originalName,
          displayName,
          userClass
        });

        // If override exists and is different, also search for it
        if (metadata?.override && metadata.override !== originalName) {
          nameMatches.push({
            searchTerm: metadata.override,
            originalName, // IMPORTANT: still use original for data-guest-name
            displayName,
            userClass
          });
        }
      }
    } else {
      // Fallback to using userMetadataCache to build matches keyed by originalName
      for (const [origKey, meta] of Object.entries(userMetadataCache)) {
        const originalName = meta.originalName || origKey;
        const displayName = meta.override || meta.displayName || originalName;
        const isGuest = meta.isGuest === true;
        const userClass = isGuest ? 'user-badge user__guest js-guest-name' : 'user-badge js-guest-name';

        nameMatches.push({ searchTerm: originalName, originalName, displayName, userClass });
        if (displayName && displayName !== originalName) {
          nameMatches.push({ searchTerm: displayName, originalName, displayName, userClass });
        }
      }
    }

    // Sort by search term length (longest first) to avoid partial replacements
    nameMatches.sort((a, b) => b.searchTerm.length - a.searchTerm.length);

    // Replace names with spans, avoiding duplicates
    for (const match of nameMatches) {
      const lowerTerm = match.searchTerm.toLowerCase();

      // Skip if already processed to avoid double replacements
      if (processedNames.has(lowerTerm)) continue;

      // Case-insensitive search and replace
      const regex = new RegExp(`\\b(${escapeRegex(match.searchTerm)})\\b`, 'gi');
      result = result.replace(regex, (_, name) => {
        processedNames.add(name.toLowerCase());
        return `<span class="${match.userClass}" data-guest-name="${escapeHTML(match.originalName)}">&lt;${escapeHTML(match.displayName)}&gt;</span>`;
      });
    }

    // Now escape any remaining non-replaced text parts
    // Split by our inserted spans and escape only the text parts
    const parts = result.split(/(<span[^>]*>.*?<\/span>)/);
    result = parts.map(part => {
      if (part.startsWith('<span')) {
        return part; // Already our HTML, don't escape
      }
      return escapeHTML(part);
    }).join('');

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

  function formatBannerTime(dateString) {
    try {
      const d = new Date(dateString);
      const hours = d.getHours();
      const minutes = d.getMinutes();
      const period = hours >= 12 ? 'P.M.' : 'A.M.';
      const displayHours = hours % 12 || 12;
      const displayMinutes = minutes.toString().padStart(2, '0');
      return `${displayHours}.${displayMinutes} ${period} (CET)`;
    } catch (e) {
      return '';
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
    // Show guest sidebar tab when collapsed
    if (guestSidebarTab) {
      guestSidebarTab.hidden = false;
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
    // Hide guest sidebar tab
    if (guestSidebarTab) {
      guestSidebarTab.hidden = true;
    }
    // Close guest panel and collapse sidebar
    closeGuestPanel();
    closeSidebar();
  }

  async function loadGuestInfo(guestName) {
    if (!guestName) return;

    // Resolve display name to original name using userMetadataCache
    // The guestName might be "Alessandro Plantera" but the Notion page is titled "aleplante"
    let lookupName = guestName;
    const inputLower = guestName.toLowerCase();

    // First check if the input matches a key directly
    if (userMetadataCache[inputLower]) {
      // It's already the original name
      lookupName = userMetadataCache[inputLower].originalName || guestName;
    } else {
      // Check if it matches any override (display name)
      for (const [origKey, meta] of Object.entries(userMetadataCache)) {
        if (meta.override && meta.override.toLowerCase() === inputLower) {
          // Found! Use the original name for Notion lookup
          lookupName = meta.originalName || origKey;
          break;
        }
      }
    }

    const cacheKey = lookupName.toLowerCase();

    // Check if we have it in cache (full data)
    const cached = guestCache.get(cacheKey);
    if (cached && !cached.partial) {
      renderGuestCard(cached);
      openGuestPanel();
      return true;
    }

    try {
      const res = await fetch(`/api/notion/page/${encodeURIComponent(lookupName)}`);

      if (!res.ok) {
        if (res.status === 404) {
          console.log(`No Notion page found for guest: ${lookupName} (original input: ${guestName})`);
          return false;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      // Store full data in cache
      guestCache.set(cacheKey, { ...data, partial: false });

      renderGuestCard(data);
      openGuestPanel();
      return true;
    } catch (err) {
      console.error('Failed to load guest info:', err);
      return false;
    }
  }
  
  function renderGuestCard(data) {
    if (!guestCard) return;

    const originalName = data.title || 'Guest';
    // Prefer explicit Override property from Notion page if present
    const overrideProp = (data.properties && (data.properties.Override || data.properties.override));
    const overrideValue = (typeof overrideProp === 'string') ? overrideProp : (overrideProp && overrideProp.title) || null;
    const displayName = overrideValue || getDisplayName(originalName); // Use Override if available, otherwise fallback

    // Set title (hidden, for reference)
    if (guestCardTitle) {
      guestCardTitle.textContent = `<${displayName}>`;
    }

    // Set panel title (use override)
    if (guestPanelTitle) {
      guestPanelTitle.textContent = `<${displayName}>`;
    }

    // Set sidebar tab label (use override)
    if (guestSidebarTabLabel) {
      guestSidebarTabLabel.textContent = `<${displayName}>`;
    }

    // Set cover image (use media first, then cover, then first file)
    if (guestCardCover) {
      const imageUrl = data.media || data.cover || (data.properties?.Media?.[0]);
      if (imageUrl) {
        guestCardCover.innerHTML = `<img src="${imageUrl}" alt="${escapeHTML(displayName)}" />`;
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
  }

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  function hasGuestData() {
    return guestCardTitle && guestCardTitle.textContent.trim() !== '';
  }
  
  // Extract guest name from click on user__guest element
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
  function renderMessages(messages) {
    if (!threadRoot) return;
    if (!Array.isArray(messages) || messages.length === 0) {
      threadRoot.innerHTML = '<div class="message-thread__empty">No messages in this conversation.</div>';
      return;
    }

    const html = messages.map(m => {
      // Use displayName from Notion override, fallback to username
      const displayName = escapeHTML(m.displayName || m.username || 'Anonymous');
      const originalName = escapeHTML(m.username || 'Anonymous');
      const content = escapeHTML(m.text || m.message || '');
      const time = fmtTime(m.date || m.sent_at);

      // Use ONLY Notion status (isGuest from backend)
      const isGuest = m.isGuest === true;

      const alignClass = isGuest ? 'message-thread__message--guest' : 'message-thread__message--host';
      // All clickable, guests are violet
      const userClass = isGuest ? 'user-badge user__guest js-guest-name' : 'user-badge js-guest-name';
      const formattedName = `&lt;${displayName}&gt;`;

      return `
        <div class="message-thread__message ${alignClass}">
          <div class="message-thread__header">
            <span class="message-thread__username ${userClass}" data-guest-name="${originalName}">${formattedName}</span>
          </div>
          <div class="message-thread__content">${content}</div>
          <time class="message-thread__timestamp">${time}</time>
        </div>`;
    }).join('');

    threadRoot.innerHTML = html;
  }

  // Render thread header with session info
  function renderThreadHeader(session, userMetadata = {}) {
    const headerContent = document.getElementById('thread-header-content');
    if (!headerContent || !session) return;

    // Helper to get display name - session data is already sanitized with display names
    // userMetadata keys are displayName (lowercase) -> { displayName, isGuest, isHost }
    const getDisplayName = (name) => {
      const metadata = userMetadata[name?.toLowerCase()];
      // name is already the display name from sanitized session data
      return escapeHTML(metadata?.displayName || metadata?.override || name || 'Anonymous');
    };

    // Helper to check if user is guest from Notion
    const isGuestFromNotion = (name) => {
      const metadata = userMetadata[name?.toLowerCase()];
      return metadata?.isGuest === true;
    };

    const authorDisplay = getDisplayName(session.author);
    const title = escapeHTML(session.title || `Conversation ${session.session_id}`);
    const participants = session.participants || [];
    const messageCount = session.message_count || 0;
    const status = session.status || 'archived';
    const startDate = session.start_date ? formatDate(session.start_date) : 'No date available';

    // Filter out the author from participants and apply overrides
    const guests = participants.filter(p => p !== session.author);
    const guestHtml = guests.length > 0
      ? guests.map(g => {
          const guestDisplay = getDisplayName(g);
          const isGuest = isGuestFromNotion(g);
          // All clickable, guests are violet
          const userClass = isGuest ? 'user-badge user__guest js-guest-name' : 'user-badge js-guest-name';
          return `<span class="${userClass}" data-guest-name="${escapeHTML(g)}">&lt;${guestDisplay}&gt;</span>`;
        }).join(' ')
      : '<span class="user-badge user__guest">&lt;Guest&gt;</span>';

    const statusLabel = status === 'active' ? 'Live' : status === 'paused' ? 'Paused' : 'Archived';
    const messagesLabel = messageCount === 1 ? '1 message' : `${messageCount} messages`;

    // Check if author is guest from Notion
    const isAuthorGuest = isGuestFromNotion(session.author);
    const authorClass = isAuthorGuest ? 'user-badge user__guest js-guest-name' : 'user-badge js-guest-name';
    
    headerContent.innerHTML = `
      <div class="conversation-list__header">
        <div>
          <div class="conversation-list__header-title">
            <span class="${authorClass}" data-guest-name="${escapeHTML(session.author)}">&lt;${authorDisplay}&gt;</span> and ${guestHtml} talking about ${title}
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

      // Update userMetadataCache with correct data from /messages endpoint
      if (data.userMetadata) {
        Object.entries(data.userMetadata).forEach(([key, val]) => {
          userMetadataCache[key] = val;
        });
        // cache updated
      }

      // Pass userMetadata to header rendering for name overrides
      renderThreadHeader(data.session, data.userMetadata);
      renderMessages(data.messages);
      showThread();
      // Update document title and push a permalink into history
      try {
        const titleText = (data.session && data.session.title) ? `Dialogs - ${data.session.title}` : initialTitle;
        document.title = titleText;
        const newUrl = window.location.pathname + '?session_id=' + encodeURIComponent(sessionId);
        if (window.history && window.history.pushState) window.history.pushState({ sessionId }, titleText, newUrl);
      } catch (e) { /* ignore */ }

      // --- Socket: join the session room and listen for incoming messages ---
      try {
        if (window.SocketClient) {
          // Remove previous handler/room if switching
          if (currentSocketSession && currentSocketSession !== sessionId) {
            SocketClient.leaveSession(currentSocketSession);
            if (socketMessageHandler) SocketClient.off('message:new', socketMessageHandler);
            socketMessageHandler = null;
          }

          // Define handler that appends incoming messages to the open thread
          socketMessageHandler = function (msg) {
            try {
              if (!msg || msg.session_id !== sessionId) return;
              // Avoid duplicates: simple guard by message id if present
              const existing = threadRoot.querySelector(`[data-message-id=\"${msg.id}\"]`);
              if (existing) return;

              // Look up metadata from cache to get displayName and isGuest
              const usernameLower = (msg.username || '').toLowerCase();
              const meta = userMetadataCache[usernameLower];
              const displayName = escapeHTML(msg.displayName || meta?.displayName || meta?.override || msg.username || 'Anonymous');
              const originalName = escapeHTML(msg.username || 'Anonymous');
              const content = escapeHTML(msg.text || msg.message || '');
              const time = fmtTime(msg.date || msg.sent_at || new Date().toISOString());
              // Prefer server-provided isGuest, then fallback to cache
              const isGuest = (msg.isGuest === true) || (meta?.isGuest === true);
              const alignClass = isGuest ? 'message-thread__message--guest' : 'message-thread__message--host';
              const userClass = isGuest ? 'user-badge user__guest js-guest-name' : 'user-badge js-guest-name';

              const node = document.createElement('div');
              node.className = `message-thread__message ${alignClass}`;
              node.innerHTML = `
                <div class="message-thread__header">
                  <span class="message-thread__username ${userClass}" data-guest-name="${originalName}">&lt;${displayName}&gt;</span>
                </div>
                <div class="message-thread__content">${content}</div>
                <time class="message-thread__timestamp">${time}</time>`;
              if (msg.id) node.setAttribute('data-message-id', msg.id);

              // Append and scroll
              threadRoot.appendChild(node);
              threadRoot.scrollTop = threadRoot.scrollHeight;
            } catch (e) { console.error('Socket handler error', e); }
          };

          SocketClient.connect();
          SocketClient.joinSession(sessionId);
          SocketClient.on('message:new', socketMessageHandler);
          currentSocketSession = sessionId;
        }
      } catch (e) {
        console.error('Failed to attach socket handler for thread:', e);
      }
    } catch (err) {
      console.error('Failed to load thread', err);
      if (threadRoot) threadRoot.innerHTML = `<div class="message-thread__error">Failed to load messages: ${escapeHTML(err.message)}</div>`;
      showThread();
    }
  }

  // Apply override display names to conversation list items and banner
  function applyOverridesToConversationList() {
    try {
      // Conversation list badges
      const badges = document.querySelectorAll('.conversation-list__item .user-badge');
      badges.forEach(el => {
        const originalName = (el.getAttribute('data-guest-name') || '').trim();
        if (!originalName) return;
        const meta = userMetadataCache[originalName.toLowerCase()];
        if (meta && meta.override && meta.override !== originalName) {
          el.innerHTML = `&lt;${escapeHTML(meta.override)}&gt;`;
        }
      });

      // Upcoming chat banner participants (if present)
      const bannerParticipants = document.getElementById('upcoming-chat-participants');
      if (bannerParticipants && bannerParticipants.innerHTML) {
        // Replace any occurrences of original names with their overrides
        let html = bannerParticipants.innerHTML;
        for (const [origKey, meta] of Object.entries(userMetadataCache)) {
          const orig = meta.originalName || origKey;
          const override = meta.override;
          if (!override || override === orig) continue;
          const re = new RegExp(escapeRegex(escapeHTML(orig)), 'gi');
          html = html.replace(re, escapeHTML(override));
        }
        bannerParticipants.innerHTML = html;
      }
    } catch (err) {
      console.error('Error applying overrides to conversation list:', err);
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
  document.addEventListener('DOMContentLoaded', async function () {
    startTimeUpdates();
    // Preload metadata first, then apply overrides to server-rendered HTML
    await preloadNotionGuests(); // Populate userMetadataCache
    applyOverridesToConversationList(); // Update conversation list and banner text
    // Setup global sessions subscription for realtime conversation-list updates
    try {
      if (window.SocketClient) {
        SocketClient.connect();
        // Join a global 'sessions' room to receive session updates
        // Use joinRoom so we subscribe to the exact room name emitted by the server
        SocketClient.joinRoom('sessions');
        SocketClient.on('session:update', function (session) {
          console.log('[layout-toggles] received session:update', session && session.session_id);

          try {
            if (!session || !session.session_id) return;
            const id = session.session_id;

            // Fetch authoritative session details from server to avoid cache/mismatch
            fetch(`/session/${encodeURIComponent(id)}?_=${Date.now()}`)
              .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
              })
              .then(remote => {
                try {
                  // Update conversation list item if present
                  const item = document.querySelector(`.conversation-list__item[data-session-id="${id}"]`);
                  if (item) {
                    // Update status indicator
                    const statusEl = item.querySelector('.status-indicator');
                    if (statusEl) {
                      const s = remote.status || 'completed';
                      const label = s === 'active' ? 'Live' : s === 'paused' ? 'Paused' : 'Archived';
                      statusEl.className = `status-indicator status-indicator--${s}`;
                      statusEl.textContent = label;
                    }

                    // Update message count badge
                    const badge = item.querySelector('.conversation-list__meta-badge');
                    if (badge) {
                      const count = remote.message_count || 0;
                      badge.innerHTML = count === 1 ? `[1 message]` : `[${count} messages]`;
                    }

                    // Optionally update title / participants if present
                    const titleEl = item.querySelector('.conversation-list__header-title');
                    if (titleEl && remote.title) {
                      if (!titleEl.textContent.includes(remote.title)) {
                        const parts = titleEl.textContent.split(' talking about ');
                        const left = parts[0] || '';
                        titleEl.textContent = `${left} talking about ${remote.title}`;
                      }
                    }
                  } else {
                    // If item is not present (e.g. new session), consider reloading the list or inserting it
                    console.log('[layout-toggles] session:update: item not found in DOM for', id);
                  }

                  // If this session is currently open in the inline thread, update header
                  if (currentSocketSession && currentSocketSession === id) {
                    try {
                      renderThreadHeader(remote, userMetadataCache);
                    } catch (e) { /* ignore */ }
                  }
                } catch (e) { console.error('Error applying remote session details', e); }
              })
              .catch(err => {
                console.error('Failed to fetch session details for realtime update:', err);
              });
          } catch (e) { console.error('Error applying realtime session update', e); }
        });

        // Listen for new sessions to add them to the conversation list
        SocketClient.on('session:new', function (session) {
          console.log('[layout-toggles] received session:new', session && session.session_id);
          try {
            if (!session || !session.session_id) return;
            const id = session.session_id;

            // Check if item already exists
            if (document.querySelector(`.conversation-list__item[data-session-id="${id}"]`)) {
              console.log('[layout-toggles] session:new: item already exists for', id);
              return;
            }

            // Find the conversation list container
            const listContainer = document.querySelector('.conversation-list');
            if (!listContainer) {
              console.log('[layout-toggles] session:new: conversation-list container not found');
              return;
            }

            // Remove empty state if present (first conversation arriving)
            const emptyState = listContainer.querySelector('.conversation-list__empty-state');
            if (emptyState) {
              emptyState.remove();
              console.log('[layout-toggles] session:new: removed empty state');
            }

            // Build the new item HTML
            const statusLabel = session.status === 'active' ? 'Live' : session.status === 'paused' ? 'Paused' : 'Archived';
            const authorDisplay = session.author || 'Host';
            const title = session.title || `Conversation ${id}`;
            const messageCount = session.message_count || 0;
            const dateStr = session.created_at ? new Date(session.created_at).toLocaleDateString() : 'No date';

            const itemHTML = `
              <div class="conversation-list__item" data-session-id="${id}">
                <div class="conversation-list__header">
                  <div>
                    <div class="conversation-list__header-title">
                      <span class="user-badge" data-guest-name="${authorDisplay}">${authorDisplay}</span> and <span class="user-badge user-badge--guest">Guest</span> talking about ${title}
                    </div>
                  </div>
                </div>
                <div class="conversation-list__meta">
                  <div class="conversation-list__meta-info">
                    <div class="infos__sx">
                      <span class="status-indicator status-indicator--${session.status || 'active'}">${statusLabel}</span>
                      - ${dateStr}
                    </div>
                    <div class="infos__dx">
                      <div class="conversation-list__header-meta">
                        <div class="conversation-list__meta-badge">
                          ${messageCount === 1 ? '[1 message]' : `[${messageCount} messages]`}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `;

            // Insert at the top of the list (newest first)
            listContainer.insertAdjacentHTML('afterbegin', itemHTML);
            console.log('[layout-toggles] session:new: added new conversation item for', id);

            // Apply metadata overrides to the new item if available
            try { applyOverridesToConversationList(); } catch (e) { /* ignore */ }

          } catch (e) { console.error('Error handling session:new', e); }
        });
      }
    } catch (e) {
      console.error('Failed to setup sessions realtime subscription', e);
    }
    // Then load banner (which also uses linkifyGuestNames and can rely on cache)
    await loadUpcomingChatBanner(); // Load banner from Notion
    // setupHoverEffects();

    const hasInline = !!(threadSection && threadRoot);
    // Handle browser back/forward to open/close inline threads
    try {
      window.addEventListener('popstate', function (e) {
        const state = e.state;
        if (state && state.sessionId) {
          const el = document.querySelector(`.conversation-list__item[data-session-id="${state.sessionId}"]`);
          if (el) markActiveItem(el);
          loadThread(state.sessionId);
        } else {
          hideThread();
        }
      });
    } catch (e) { /* ignore */ }

    // Auto-open thread if URL contains session_id on initial page load
    try {
      const params = new URLSearchParams(window.location.search);
      const initialSession = params.get('session_id');
      if (initialSession) {
        const el = document.querySelector(`.conversation-list__item[data-session-id="${initialSession}"]`);
        if (el) markActiveItem(el);
        loadThread(initialSession);
      }
    } catch (e) { /* ignore */ }
    if (hasInline) {
      document.addEventListener('click', function (e) {
        if (e.target.closest('.js-thread-close')) {
          e.preventDefault();
          hideThread();
          return;
        }
        // Open about panel
        if (e.target.closest('.js-about-tab-open')) {
          e.preventDefault();
          if (isMobile()) {
            // On mobile, toggle if already open
            const isOpen = aboutPanel && !aboutPanel.hidden;
            if (isOpen) {
              closeAboutPanel();
            } else {
              openAboutPanel();
            }
          } else {
            openAboutPanel();
          }
          return;
        }
        // Close about panel
        if (e.target.closest('.js-about-close')) {
          e.preventDefault();
          closeAboutPanel();
          return;
        }
        // Open guest panel
        if (e.target.closest('.js-guest-tab-open')) {
          e.preventDefault();
          if (isMobile()) {
            // On mobile, toggle if already open
            const isOpen = guestPanel && !guestPanel.hidden;
            if (isOpen) {
              closeGuestPanel();
              closeSidebar();
            } else {
              openGuestPanel();
            }
          } else {
            openGuestPanel();
          }
          return;
        }
        // Close guest panel
        if (e.target.closest('.js-guest-close')) {
          e.preventDefault();
          hideGuestCard();
          return;
        }
        // Click on guest/host name to load info from Notion
        if (e.target.closest('.js-guest-name')) {
          e.preventDefault();
          e.stopPropagation();
          const guestEl = e.target.closest('.js-guest-name');
          // Always use data-guest-name (original name) for Notion lookup
          const originalName = guestEl.getAttribute('data-guest-name');
          if (originalName) {
            loadGuestInfo(originalName);
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
