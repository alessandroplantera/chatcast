// src/bot/index.js - Telegram bot initialization and setup

const { Telegraf } = require('telegraf');
const { session } = require('telegraf');
const CONFIG = require('../config/constants');
const { setupRecordingHandlers } = require('./handlers/recording');
const { setupAdminHandlers } = require('./handlers/admin');
const { setupMessageHandler } = require('./handlers/messages');

/**
 * Initialize and configure Telegram bot
 * @param {Object} dependencies - Dependencies to inject (db, notionCms, io, emitters)
 * @returns {Telegraf|null} - Configured bot instance or null if disabled
 */
function initializeTelegramBot(dependencies) {
  const { db, notionCms, io, emitSessionUpdate, emitSessionNew, syncNotion } = dependencies;

  if (!CONFIG.TELEGRAM_BOT_TOKEN || CONFIG.TELEGRAM_DISABLED) {
    console.log('🔧 Telegram bot disabled - no token provided or explicitly disabled');
    return null;
  }

  if (CONFIG.isDevelopment()) {
    console.log('🔍 Telegram Debug:');
    console.log('- Token exists:', !!CONFIG.TELEGRAM_BOT_TOKEN);
    console.log('- Token length:', CONFIG.TELEGRAM_BOT_TOKEN?.length);
  }

  try {
    const bot = new Telegraf(CONFIG.TELEGRAM_BOT_TOKEN);

    // Enable session management (per-chat, not per-user)
    // This way, all participants in the same chat share
    // the same recording state and are recorded together.
    bot.use(session({
      getSessionKey: (ctx) => {
        // Fallback to update_id-based key if chat is missing
        return ctx.chat?.id ? String(ctx.chat.id) : String(ctx.update.update_id);
      }
    }));

    // Setup all handlers with dependencies
    const handlerDeps = { db, notionCms, io, emitSessionUpdate, emitSessionNew, syncNotion };

    setupRecordingHandlers(bot, handlerDeps);
    setupAdminHandlers(bot, handlerDeps);
    setupMessageHandler(bot, handlerDeps);

    // Launch the bot
    bot
      .launch()
      .then(() => {
        console.log('✅ Telegram bot started successfully');
      })
      .catch((err) => {
        console.error('❌ Failed to start Telegram bot:', err.message);
        return null;
      });

    return bot;
  } catch (error) {
    console.error('❌ Failed to initialize Telegram bot:', error.message);
    return null;
  }
}

module.exports = {
  initializeTelegramBot
};
