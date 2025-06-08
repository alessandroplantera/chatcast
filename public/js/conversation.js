// conversation.js - Simple conversation view functionality

// Global variables
let lastMessageCount = 0;
let refreshInterval = null;
let sessionId = null;
let sessionStatus = 'completed';

// Time management
function updateTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  const timeElement = document.getElementById('current-time');
  if (timeElement) {
    timeElement.textContent = timeString;
  }
}

function startTimeUpdates() {
  updateTime(); // Update immediately
  setInterval(updateTime, 60000); // Update every minute
}

// Initialization helpers
function getInitialMessageCount() {
  const messageThread = document.querySelector('.message-thread');
  return messageThread ? messageThread.children.length : 0;
}

function getSessionId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('session_id');
}

function getSessionStatus() {
  return document.body.dataset.sessionStatus || 'completed';
}

function initializeGlobals() {
  lastMessageCount = getInitialMessageCount();
  sessionId = getSessionId();
  sessionStatus = getSessionStatus();
  
  console.log('🔧 Session initialized:', {
    sessionId: sessionId,
    status: sessionStatus,
    messageCount: lastMessageCount
  });
}

// Auto-refresh functionality
function setupAutoRefresh() {
  if (!sessionId) {
    console.log('No session ID found, auto-refresh disabled');
    return;
  }

  let interval = 0;
  
  if (sessionStatus === 'active') {
    interval = 3000; // 3 seconds for active sessions
  } else if (sessionStatus === 'paused') {
    interval = 10000; // 10 seconds for paused sessions
  }
  // completed sessions get 0 (no refresh)

  if (interval > 0) {
    refreshInterval = setInterval(checkForNewMessages, interval);
    console.log(`🔄 Auto-refresh enabled: ${sessionStatus} session (${interval/1000}s intervals)`);
  } else {
    console.log('📁 Archived session - no auto-refresh needed');
  }
}

function checkForNewMessages() {
  if (!sessionId) return;

  fetch(`/messages?session_id=${sessionId}`)
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      if (data.length !== lastMessageCount) {
        console.log(`New messages detected: ${data.length} (was ${lastMessageCount})`);
        lastMessageCount = data.length;
        window.location.reload();
      }
    })
    .catch(function(error) {
      console.error('Error checking for new messages:', error);
    });
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    console.log('🛑 Auto-refresh stopped');
  }
}

function manualRefresh() {
  console.log('🔄 Manual refresh triggered');
  checkForNewMessages();
}

// Navigation
function goBack() {
  stopAutoRefresh();
  
  if (document.referrer && document.referrer.includes(window.location.origin)) {
    window.history.back();
  } else {
    window.location.href = '/';
  }
}

// UI Management
function scrollToBottom() {
  const messageThread = document.querySelector('.message-thread');
  if (messageThread) {
    messageThread.scrollTop = messageThread.scrollHeight;
  }
}

function scrollToTop() {
  const messageThread = document.querySelector('.message-thread');
  if (messageThread) {
    messageThread.scrollTop = 0;
  }
}

function addLiveSessionEffects() {
  if (sessionStatus === 'active') {
    document.body.classList.add('live-session');
    
    // Add subtle pulsing effect for live sessions
    const style = document.createElement('style');
    style.textContent = `
      .live-session .header__brand-name {
        animation: livePulse 2s infinite;
      }
      
      .live-session .status-indicator--live::before {
        animation: livePulse 1.5s infinite;
      }
      
      @keyframes livePulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
    `;
    document.head.appendChild(style);
  }
}

// Event listeners
function setupNavigationFab() {
  const fabButton = document.querySelector('.navigation-fab');
  if (fabButton) {
    fabButton.addEventListener('click', goBack);
  }
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    switch(e.key) {
      case 'Escape':
        e.preventDefault();
        goBack();
        break;
      case 'r':
      case 'R':
        if (e.ctrlKey || e.metaKey) return; // Let browser handle Ctrl+R
        e.preventDefault();
        manualRefresh();
        break;
      case ' ':
        if (!e.target.matches('input, textarea')) {
          e.preventDefault();
          scrollToBottom();
        }
        break;
      case 'End':
        e.preventDefault();
        scrollToBottom();
        break;
      case 'Home':
        e.preventDefault();
        scrollToTop();
        break;
    }
  });
}

function setupPageUnload() {
  window.addEventListener('beforeunload', function() {
    stopAutoRefresh();
  });
}

// Visibility handling for performance
function setupVisibilityHandling() {
  document.addEventListener('visibilitychange', function() {
    if (sessionStatus !== 'active') return;

    if (document.hidden) {
      stopAutoRefresh();
      console.log('⏰ Auto-refresh paused (window hidden)');
    } else {
      setupAutoRefresh();
      console.log('🔄 Auto-refresh resumed (window visible)');
      // Check immediately when window becomes visible
      setTimeout(checkForNewMessages, 500);
    }
  });
}

// Debug helpers
function getDebugInfo() {
  return {
    sessionId: sessionId,
    sessionStatus: sessionStatus,
    messageCount: lastMessageCount,
    autoRefreshActive: !!refreshInterval,
    isVisible: !document.hidden
  };
}

// Initialize everything
function initConversation() {
  initializeGlobals();
  startTimeUpdates();
  setupAutoRefresh();
  setupNavigationFab();
  setupKeyboardShortcuts();
  setupPageUnload();
  setupVisibilityHandling();
  scrollToBottom();
  addLiveSessionEffects();
  
  console.log('💬 Conversation view initialized');
  
  // Make debug info available globally
  window.getConversationDebugInfo = getDebugInfo;
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', initConversation);