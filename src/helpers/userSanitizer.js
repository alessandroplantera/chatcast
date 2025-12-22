// src/helpers/userSanitizer.js - User metadata sanitization helpers

/**
 * Sanitize a single message - replace real username with display name
 */
function sanitizeMessage(msg, userMetadata) {
  const metadata = userMetadata.get(msg.username?.toLowerCase());
  const displayName = metadata?.override || metadata?.originalName || msg.username;

  return {
    id: msg.id,
    text: msg.message,
    date: msg.date,
    session_id: msg.session_id,
    username: displayName,
    displayName: displayName,
    isGuest: metadata?.isGuest || false,
    isHost: metadata?.isHost || false,
  };
}

/**
 * Sanitize session details - replace author and participants with display names
 */
function sanitizeSession(session, userMetadata) {
  if (!session) return null;

  const authorMeta = userMetadata.get(session.author?.toLowerCase());
  const authorDisplay = authorMeta?.override || authorMeta?.originalName || session.author;

  const participantsDisplay = (session.participants || []).map(p => {
    const meta = userMetadata.get(p?.toLowerCase());
    return meta?.override || meta?.originalName || p;
  });

  return {
    session_id: session.session_id,
    title: session.title,
    start_date: session.start_date,
    end_date: session.end_date,
    participants: participantsDisplay,
    message_count: session.message_count,
    status: session.status,
    author: authorDisplay,
  };
}

/**
 * Enrich session with display names and guest/host flags
 */
function enrichSession(session, userMetadata) {
  let authorDisplay = session.author_display || session.author;
  let authorIsGuest = false;
  let authorIsHost = false;

  if (session.author) {
    const metaForAuthor = userMetadata.get(String(session.author).toLowerCase());
    if (metaForAuthor?.override) {
      authorDisplay = metaForAuthor.override;
    }
    // Get guest/host status from metadata, not from session object
    authorIsGuest = Boolean(metaForAuthor?.isGuest);
    authorIsHost = Boolean(metaForAuthor?.isHost);
  }

  const enrichedParticipants = (session.participants || []).map(p => {
    const meta = userMetadata.get(String(p).toLowerCase());
    const displayName = meta?.override || meta?.originalName || p;

    return {
      original: displayName,
      display: displayName,
      isGuest: meta?.isGuest || false
    };
  });

  return {
    session_id: session.session_id,
    title: session.title,
    start_date: session.start_date,
    end_date: session.end_date,
    message_count: session.message_count,
    status: session.status,
    author: authorDisplay,
    authorDisplay,
    participants: enrichedParticipants.map(p => p.display),
    participantsEnriched: enrichedParticipants,
    author_is_guest: authorIsGuest,
    author_is_host: authorIsHost
  };
}

/**
 * Build safe user metadata object for public API
 * Only exposes display names, never real usernames
 */
function buildSafeUserMetadata(userMetadata) {
  const safeMetadata = {};

  userMetadata.forEach((val, key) => {
    const displayName = val.override || val.originalName || null;

    if (displayName) {
      const safeKey = displayName.toLowerCase();
      safeMetadata[safeKey] = {
        displayName,
        isGuest: Boolean(val.isGuest),
        isHost: Boolean(val.isHost)
      };
    }
  });

  return safeMetadata;
}

/**
 * Sanitize Notion page response to hide original usernames
 */
function sanitizeNotionPage(pageData) {
  if (!pageData) return null;

  const props = pageData.properties || {};

  // Find Override property (case-insensitive)
  let overrideValue = null;
  Object.keys(props).forEach(k => {
    if (k && k.toLowerCase() === 'override' && props[k]) {
      const raw = props[k];
      overrideValue = (typeof raw === 'string') ? raw : (Array.isArray(raw) ? raw[0] : String(raw || ''));
    }
  });

  return {
    id: pageData.id,
    title: overrideValue || 'Guest',
    properties: {
      Date: props.Date || null,
      URL: props.URL || null,
      '@': props['@'] || null,
      Media: props.Media || [],
      Status: props.Status || [],
      Description: props.Description || '',
      Override: overrideValue || null
    },
    content: pageData.content || '',
    cover: pageData.cover || null,
    icon: pageData.icon || null,
    media: pageData.media || null,
    lastEdited: pageData.lastEdited || null
  };
}

/**
 * Replace usernames in text with display names
 */
function replaceUsernamesInText(text, userMetadata) {
  if (!text) return text;

  let result = text;

  userMetadata.forEach((meta, originalName) => {
    const isPerson = Boolean(meta.isGuest) || Boolean(meta.isHost);
    if (!isPerson) return;

    const displayName = meta.override || meta.originalName || originalName;
    const candidates = new Set();

    if (meta.originalName) candidates.add(meta.originalName);
    if (meta.override) candidates.add(meta.override);

    candidates.forEach((candidate) => {
      if (!candidate) return;
      const escaped = String(candidate).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?:<${escaped}>|\\b${escaped}\\b)`, 'gi');
      result = result.replace(re, displayName);
    });
  });

  return result;
}

module.exports = {
  sanitizeMessage,
  sanitizeSession,
  enrichSession,
  buildSafeUserMetadata,
  sanitizeNotionPage,
  replaceUsernamesInText
};
