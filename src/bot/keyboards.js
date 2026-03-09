// src/bot/keyboards.js - Telegram bot keyboard layouts

const { Markup } = require('telegraf');

const keyboards = {
  // Main keyboard when no recording is active
  startRecording: Markup.keyboard([
    [Markup.button.text('🎙️ START RECORDING')],
    [Markup.button.text('🔧 ADMIN PANEL')],
  ]).resize(),

  // Keyboard during active recording
  activeRecording: Markup.keyboard([
    [
      Markup.button.text('⏸️ PAUSE RECORDING'),
      Markup.button.text('⏹️ STOP RECORDING'),
    ],
    [Markup.button.text('🔧 ADMIN PANEL')],
  ]).resize(),

  // Keyboard when recording is paused
  pausedRecording: Markup.keyboard([
    [
      Markup.button.text('▶️ RESUME RECORDING'),
      Markup.button.text('⏹️ STOP RECORDING'),
    ],
    [Markup.button.text('🔧 ADMIN PANEL')],
  ]).resize(),

  // Admin panel keyboard
  admin: Markup.keyboard([
    [
      Markup.button.text('📊 DB STATUS'),
      Markup.button.text('💾 BACKUP DB'),
    ],
    [
      Markup.button.text('🗑️ RESET DB'),
      Markup.button.text('🧾 LIST SESSIONS'),
    ],
    [Markup.button.text('🔄 SYNC NOTION')],
    [
      Markup.button.text('❓ ADMIN HELP'),
      Markup.button.text('⬅️ BACK TO MAIN'),
    ],
  ]).resize(),

  // Inline keyboard for database reset confirmation
  resetConfirmation: Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Yes, Reset Database', 'confirm_reset'),
      Markup.button.callback('❌ Cancel', 'cancel_reset')
    ]
  ])
};

// List of button messages to ignore in text handler
const BUTTON_MESSAGES = [
  '🎙️ START RECORDING',
  '⏸️ PAUSE RECORDING',
  '▶️ RESUME RECORDING',
  '⏹️ STOP RECORDING',
  '🔧 ADMIN PANEL',
  '📊 DB STATUS',
  '💾 BACKUP DB',
  '🗑️ RESET DB',
  '🧾 LIST SESSIONS',
  '🔄 SYNC NOTION',
  '❓ ADMIN HELP',
  '⬅️ BACK TO MAIN'
];

module.exports = {
  keyboards,
  BUTTON_MESSAGES
};
