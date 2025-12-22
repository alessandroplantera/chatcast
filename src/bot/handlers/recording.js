// src/bot/handlers/recording.js - Recording control handlers

const BotSessionManager = require('../sessionManager');
const { keyboards } = require('../keyboards');
const CONFIG = require('../../config/constants');

/**
 * Setup recording control handlers
 */
function setupRecordingHandlers(bot, { db, emitSessionUpdate, emitSessionNew }) {

  // Start command and button
  bot.start((ctx) => {
    const { isAdminUser } = require('../../middleware/auth');
    const user = { id: ctx.from.id, username: ctx.from.username };

    let welcomeMessage = "Yo! I'm ready whenever you are. Press the button to start recording.";

    if (isAdminUser(user.id)) {
      welcomeMessage += "\n\n🔧 As an admin, you can also access the Admin Panel for database management.";
    }

    ctx.reply(welcomeMessage, keyboards.startRecording);
  });

  // Start recording button/command
  const startRecording = (ctx) => {
    BotSessionManager.startRecording(ctx);
    ctx.reply('Please enter a title for this recording session:');
  };

  bot.hears('🎙️ START RECORDING', startRecording);
  bot.command('record', startRecording);

  // Pause recording
  const pauseRecording = async (ctx) => {
    if (BotSessionManager.pauseRecording(ctx)) {
      const sessionId = BotSessionManager.getSessionId(ctx);

      try {
        const session = await db.getSession(sessionId);
        if (session) {
          await db.saveSession({
            ...session,
            status: CONFIG.SESSION_STATUS.PAUSED,
          });
          if (typeof emitSessionUpdate === 'function') {
            emitSessionUpdate(sessionId).catch(() => {});
          }
        }
      } catch (error) {
        console.error('Error updating session status:', error);
      }

      ctx.reply(
        'Recording paused. Session is on hold. Press resume to continue recording in this session.',
        keyboards.pausedRecording
      );
    }
  };

  bot.hears('⏸️ PAUSE RECORDING', pauseRecording);
  bot.command('pause', pauseRecording);

  // Resume recording
  const resumeRecording = async (ctx) => {
    if (BotSessionManager.resumeRecording(ctx)) {
      const sessionId = BotSessionManager.getSessionId(ctx);

      try {
        const session = await db.getSession(sessionId);
        if (session) {
          await db.saveSession({
            ...session,
            status: CONFIG.SESSION_STATUS.ACTIVE,
          });
          if (typeof emitSessionUpdate === 'function') {
            emitSessionUpdate(sessionId).catch(() => {});
          }
        }
      } catch (error) {
        console.error('Error updating session status:', error);
      }

      ctx.reply(
        'Recording resumed. Continuing session.',
        keyboards.activeRecording
      );
    } else {
      ctx.reply('No paused recording to resume.', keyboards.startRecording);
    }
  };

  bot.hears('▶️ RESUME RECORDING', resumeRecording);
  bot.command('resume', resumeRecording);

  // Stop recording
  const stopRecording = async (ctx) => {
    const { wasRecording, sessionId } = BotSessionManager.stopRecording(ctx);

    if (wasRecording) {
      try {
        if (sessionId) {
          await db.saveSession({
            session_id: sessionId,
            status: CONFIG.SESSION_STATUS.COMPLETED,
          });

          if (typeof emitSessionUpdate === 'function') {
            emitSessionUpdate(sessionId).catch(() => {});
          }

          ctx.reply(
            'Recording stopped. Session completed successfully. Press the button to start a new session.',
            keyboards.startRecording
          );
        } else {
          ctx.reply(
            'Recording stopped. No active session was found. Press the button to start a new session.',
            keyboards.startRecording
          );
        }
      } catch (error) {
        console.error('Error updating session status on stop:', error);
        ctx.reply(
          'Recording stopped. Note: There was an error updating the session status. Press the button to start a new session.',
          keyboards.startRecording
        );
      }
    } else {
      ctx.reply('No active recording to stop.', keyboards.startRecording);
    }
  };

  bot.hears('⏹️ STOP RECORDING', stopRecording);
  bot.command('stop', stopRecording);

  // Helper: Finalize session start after title is provided
  async function finalizeSessionStart(ctx, title) {
    const sessionId = BotSessionManager.getSessionId(ctx);
    const author = BotSessionManager.getAuthor(ctx);

    try {
      const sessionData = {
        session_id: sessionId,
        title: title,
        created_at: new Date().toISOString(),
        status: CONFIG.SESSION_STATUS.ACTIVE,
        author: author,
      };

      await db.saveSession(sessionData);

      // Emit new session event
      if (typeof emitSessionNew === 'function') {
        emitSessionNew(sessionId).catch(() => {});
      }

      // Update session state
      BotSessionManager.finalizeStart(ctx);

      const successMessage = `✅ Recording started!

📝 Session: "${title}"
🆔 ID: ${sessionId}
🎤 Status: ACTIVE

🗣️ Start chatting and I'll record everything with a 👀 reaction!`;

      ctx.reply(successMessage, keyboards.activeRecording);

    } catch (error) {
      console.error('❌ Error in finalizeSessionStart:', error);

      ctx.reply(
        '❌ Failed to start recording session. Please try again.\n\nError: ' + error.message,
        keyboards.startRecording
      );

      // Reset on error
      BotSessionManager.initializeSession(ctx);
    }
  }

  // Export for use in message handler
  bot.context.finalizeSessionStart = finalizeSessionStart;

  console.log('✅ Recording handlers setup complete');
}

module.exports = {
  setupRecordingHandlers
};
