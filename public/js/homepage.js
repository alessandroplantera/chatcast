// homepage.js - Simple homepage functionality

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
  
  // Navigation functions
  function viewSession(sessionId) {
    if (sessionId) {
      window.location.href = `/messages-view?session_id=${sessionId}`;
    }
  }
  
  function showAbout() {
    const aboutText = `ChatCast: Real-time conversation recording and archiving platform.
  
  Record, organize, and revisit your important conversations.
  
  Features:
  • Live conversation recording
  • Real-time message synchronization
  • Conversation archiving
  • Multi-user support
  • Telegram integration
  
  Built with modern web technologies for seamless performance.`;
  
    alert(aboutText);
  }
  
  function refreshPage() {
    window.location.reload();
  }
  
  function showKeyboardShortcuts() {
    const shortcuts = `Keyboard Shortcuts:
  
  R - Refresh page
  ? - Show this help
  Escape - Close modals
  Click - Navigate to conversation
  Enter - Activate focused element`;
  
    alert(shortcuts);
  }
  
  // Event handlers
  function setupConversationItemClick() {
    document.addEventListener('click', function(e) {
      const conversationItem = e.target.closest('.conversation-list__item');
      if (conversationItem) {
        e.preventDefault(); // Prevent any default behavior
        
        const sessionId = conversationItem.getAttribute('data-session-id');
        if (sessionId && sessionId.trim() !== '') {
          console.log('Navigating to session:', sessionId);
          viewSession(sessionId);
        } else {
          console.log('No session ID found or empty session ID');
        }
      }
    });
  }
  
  function setupCtaClick() {
    const ctaTitle = document.querySelector('.conversation-display__cta-title');
    if (ctaTitle) {
      ctaTitle.addEventListener('click', showAbout);
    }
  }
  
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
      switch(e.key) {
        case 'r':
        case 'R':
          if (e.ctrlKey || e.metaKey) return; // Let browser handle Ctrl+R
          e.preventDefault();
          refreshPage();
          break;
        case '?':
          e.preventDefault();
          showKeyboardShortcuts();
          break;
        case 'Escape':
          closeModals();
          break;
      }
    });
  }
  
  function closeModals() {
    const modals = document.querySelectorAll('.modal, .dropdown');
    modals.forEach(function(modal) {
      modal.classList.remove('active', 'open');
    });
  }
  
  // Visual effects
  function setupHoverEffects() {
    const conversationItems = document.querySelectorAll('.conversation-list__item');
    
    conversationItems.forEach(function(item) {
      item.addEventListener('mouseenter', function() {
        this.style.transform = 'translateX(4px)';
        this.style.transition = 'transform 0.2s ease';
      });
      
      item.addEventListener('mouseleave', function() {
        this.style.transform = 'translateX(0)';
      });
    });
  
    // Conversation bubble hover effect
    const visualCircle = document.querySelector('.conversation-display__visual-circle');
    if (visualCircle) {
      visualCircle.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.05)';
      });
      
      visualCircle.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1)';
      });
    }
  }
  
  // Initialize everything when DOM is loaded
  function initHomepage() {
    startTimeUpdates();
    setupConversationItemClick();
    setupCtaClick();
    setupKeyboardShortcuts();
    setupHoverEffects();
    
    console.log('📱 Homepage initialized');
  }
  
  // Start when DOM is ready
  document.addEventListener('DOMContentLoaded', initHomepage);