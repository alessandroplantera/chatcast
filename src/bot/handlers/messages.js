// src/bot/handlers/messages.js - Message recording handler

const { message } = require('telegraf/filters');
const BotSessionManager = require('../sessionManager');
const { BUTTON_MESSAGES, keyboards } = require('../keyboards');

/**
 * Setup message handler
 */
function setupMessageHandler(bot, { db, notionCms, io }) {

  bot.on(message('text'), async (ctx) => {
    const messageText = ctx.message.text;
    const userName = ctx.from.username || ctx.from.first_name || 'Anonymous';

    // Check if we're waiting for a session title
    if (BotSessionManager.isAwaitingTitle(ctx)) {
      const title = messageText.trim();

      if (!title) {
        ctx.reply('Please enter a valid title for the session:');
        return;
      }

      await ctx.finalizeSessionStart(ctx, title);
      return;
    }

    // Ignore button messages
    if (BUTTON_MESSAGES.includes(messageText)) {
      return;
    }

    // Record message if conditions are met
    if (BotSessionManager.isRecording(ctx)) {
      const sessionId = BotSessionManager.getSessionId(ctx);

      try {
        const session = await db.getSession(sessionId);
        const sessionTitle = session ? session.title : null;

        const msgToSave = {
          chat_id: ctx.chat.id.toString(),
          session_id: sessionId,
          session_title: sessionTitle,
          date: new Date(ctx.message.date * 1000).toISOString(),
          username: userName,
          message: messageText,
        };

        const savedId = await db.saveMessage(msgToSave);
        const savedMessage = Object.assign({ id: savedId }, msgToSave);

        // Sanitize message for realtime emission
        let sanitizedMessage = { ...savedMessage };
        try {
          const userMetadata = await notionCms.getUserMetadata();
          const authorMeta = userMetadata.get(userName.toLowerCase());
          sanitizedMessage.displayName = authorMeta?.override || authorMeta?.originalName || userName;
          sanitizedMessage.isGuest = authorMeta?.isGuest === true;
          sanitizedMessage.isHost = authorMeta?.isHost === true;
          sanitizedMessage.text = sanitizedMessage.message;
        } catch (e) {
          console.error('Error enriching message:', e);
          sanitizedMessage.displayName = userName;
          sanitizedMessage.text = sanitizedMessage.message;
        }

        // Emit realtime event
        if (io) {
          io.to(`session:${sessionId}`).emit('message:new', sanitizedMessage);
        }

        // React with eye emoji
        await ctx.telegram.setMessageReaction(
          ctx.chat.id,
          ctx.message.message_id,
          [{ type: 'emoji', emoji: '👀' }]
        );

      } catch (error) {
        console.error('❌ Error processing message:', error);
      }

    } else if (BotSessionManager.isPaused(ctx)) {
      ctx.reply(
        'Recording is currently paused. Press the resume button to continue recording.',
        keyboards.pausedRecording
      );

    } else if (messageText.length > 3) {
      ctx.reply(
        "🎙️ Recording is not active. Press 'START RECORDING' to begin a new session.",
        keyboards.startRecording
      );
    }
  });

  console.log('✅ Message handler setup complete');
}

module.exports = {
  setupMessageHandler
};
