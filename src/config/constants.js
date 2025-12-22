// src/config/constants.js - Centralized configuration and constants

module.exports = {
  // Server
  PORT: process.env.PORT || 3000,
  HOST: '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_URL: process.env.APP_URL || '',

  // Database
  DATABASE_PATH: process.env.DATABASE_PATH || process.env.MESSAGES_DB_PATH || './.data/messages.db',
  DATABASE_BACKUP_DIR: process.env.DATABASE_BACKUP_DIR || '/app/.data/backups',

  // Notion
  NOTION_TOKEN: process.env.NOTION_TOKEN || process.env.NOTION_API_KEY,
  NOTION_DATABASE_ID: process.env.NOTION_DATABASE_ID,

  // Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN,
  TELEGRAM_DISABLED: process.env.TELEGRAM_DISABLED === 'true',
  ADMIN_TELEGRAM_USERS: process.env.ADMIN_TELEGRAM_USERS
    ? process.env.ADMIN_TELEGRAM_USERS.split(',').map(id => parseInt(id.trim()))
    : [],

  // Security
  ADMIN_API_KEY: process.env.ADMIN_API_KEY,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : null,

  // Rate Limiting
  RATE_LIMIT: {
    MAX_REQUESTS: 100,
    TIME_WINDOW: '1 minute',
  },

  // Timeouts and Intervals
  TIMEOUTS: {
    ONE_HOUR: 60 * 60 * 1000,
    THIRTY_MINUTES: 30 * 60 * 1000,
    ONE_MINUTE: 60 * 1000,
    SESSION_CHECK_INTERVAL: 30 * 60 * 1000, // 30 minutes
    NOTION_SYNC_INTERVAL: 30 * 60 * 1000, // 30 minutes
  },

  // SEO Defaults
  SEO: {
    DEFAULT_TITLE: 'Dialogs',
    DEFAULT_DESCRIPTION: 'Dialogs — conversations and recordings.',
    DEFAULT_IMAGE: '/graphics/og-default.png',
  },

  // Session Status Values
  SESSION_STATUS: {
    ACTIVE: 'active',
    PAUSED: 'paused',
    COMPLETED: 'completed',
  },

  // Production mode check
  isProduction() {
    return this.NODE_ENV === 'production';
  },

  isDevelopment() {
    return this.NODE_ENV !== 'production';
  }
};
