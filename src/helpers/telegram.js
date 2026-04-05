// src/helpers/telegram.js - Telegram bot helper functions

/**
 * Get user info from Telegram context for logging
 */
function getUserInfo(ctx) {
  return {
    id: ctx.from.id,
    username: ctx.from.username || 'unknown',
    first_name: ctx.from.first_name || 'unknown'
  };
}

/**
 * Generate a unique session ID
 */
function generateSessionId() {
  return `session_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

module.exports = {
  getUserInfo,
  generateSessionId
};
