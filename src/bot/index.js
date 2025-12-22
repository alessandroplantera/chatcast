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
  const { db, notionCms, io, emitSessionUpdate, emitSessionNew } = dependencies;

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

    // Enable session management
    bot.use(session());

    // Setup all handlers with dependencies
    const handlerDeps = { db, notionCms, io, emitSessionUpdate, emitSessionNew };

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

    // Graceful stop handlers
    const stopBot = (signal) => {
      console.log(`Stopping Telegram bot (${signal})...`);
      bot.stop(signal);
    };

    process.once('SIGINT', () => stopBot('SIGINT'));
    process.once('SIGTERM', () => stopBot('SIGTERM'));

    return bot;
  } catch (error) {
    console.error('❌ Failed to initialize Telegram bot:', error.message);
    return null;
  }
}

module.exports = {
  initializeTelegramBot
};
