// src/bot/handlers/admin.js - Admin panel handlers

const { isAdminUser } = require('../../middleware/auth');
const { getUserInfo } = require('../../helpers/telegram');
const { keyboards } = require('../keyboards');
const CONFIG = require('../../config/constants');
const fs = require('fs');
const path = require('path');

/**
 * Setup admin panel handlers
 */
function setupAdminHandlers(bot, { db }) {

  // Admin panel access
  bot.hears('🔧 ADMIN PANEL', async (ctx) => {
    const user = getUserInfo(ctx);

    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to access the admin panel.');
      return;
    }

    ctx.reply(
      `🔧 Admin Panel

Welcome ${user.username}! Use the buttons below to manage the database:

📊 DB STATUS - Check database information
💾 BACKUP DB - Create database backup
🗑️ RESET DB - Clear all data (with confirmation)
🧾 LIST SESSIONS - Show recent sessions with titles
❓ ADMIN HELP - Show admin commands
⬅️ BACK TO MAIN - Return to main menu`,
      keyboards.admin
    );
  });

  // Back to main
  bot.hears('⬅️ BACK TO MAIN', (ctx) => {
    ctx.reply('Returning to main menu...', keyboards.startRecording);
  });

  // DB Status - simplified version
  bot.hears('📊 DB STATUS', async (ctx) => {
    const user = getUserInfo(ctx);
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to view database information.');
      return;
    }

    try {
      const dbFile = CONFIG.DATABASE_PATH;
      if (!fs.existsSync(dbFile)) {
        ctx.reply('❌ Database file not found.', keyboards.admin);
        return;
      }

      const stats = fs.statSync(dbFile);
      const sizeKB = (stats.size / 1024).toFixed(2);
      const messages = await db.getMessages('all');
      const sessions = await db.getAllSessions();

      const statusMessage = `📊 Database Status

💾 Database: ${sizeKB} KB
🕐 Last modified: ${stats.mtime.toLocaleString()}

📈 Content:
• Messages: ${messages.length}
• Sessions: ${sessions.length}`;

      ctx.reply(statusMessage, keyboards.admin);
    } catch (error) {
      ctx.reply(`❌ Status check failed: ${error.message}`, keyboards.admin);
    }
  });

  // DB Backup - simplified
  bot.hears('💾 BACKUP DB', async (ctx) => {
    const user = getUserInfo(ctx);
    if (!isAdminUser(user.id)) {
      await ctx.reply('🚫 You are not authorized to perform database operations.');
      return;
    }

    await ctx.reply('🔄 Starting database backup...');

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dbFile = CONFIG.DATABASE_PATH;

      console.log('[BACKUP] DB path:', dbFile);

      // Access getter and log it
      let backupDir;
      try {
        backupDir = CONFIG.DATABASE_BACKUP_DIR;
        console.log('[BACKUP] Backup dir resolved:', backupDir);
      } catch (err) {
        console.error('[BACKUP] Error accessing DATABASE_BACKUP_DIR:', err);
        await ctx.reply(`❌ Failed to resolve backup directory: ${err.message}`, keyboards.admin);
        return;
      }

      if (!fs.existsSync(backupDir)) {
        console.log('[BACKUP] Creating backup directory:', backupDir);
        fs.mkdirSync(backupDir, { recursive: true });
      }

      if (fs.existsSync(dbFile)) {
        const backupPath = path.join(backupDir, `messages.db.${timestamp}.backup`);
        console.log('[BACKUP] Copying to:', backupPath);

        fs.copyFileSync(dbFile, backupPath);

        const fileSize = fs.statSync(backupPath).size;
        console.log('[BACKUP] Backup created, size:', fileSize);

        await ctx.reply(`✅ Database backup completed!\n\n📁 File: ${path.basename(backupPath)}\n📂 Location: ${backupDir}\n💾 Size: ${(fileSize/1024).toFixed(2)} KB`, keyboards.admin);
      } else {
        await ctx.reply(`❌ Database file not found.\n\n📁 Path: ${dbFile}`, keyboards.admin);
      }
    } catch (error) {
      console.error('[BACKUP] Error:', error);
      await ctx.reply(`❌ Backup failed: ${error.message}`, keyboards.admin);
    }
  });

  // DB Reset confirmation
  bot.hears('🗑️ RESET DB', async (ctx) => {
    const user = getUserInfo(ctx);
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to perform database operations.');
      return;
    }

    ctx.reply(
      `⚠️ DATABASE RESET WARNING ⚠️

This will permanently delete ALL:
• Conversation messages
• Recording sessions
• Chat history

Are you absolutely sure you want to proceed?

This action CANNOT be undone!`,
      keyboards.resetConfirmation
    );
  });

  // DB Reset confirmation callback
  bot.action('confirm_reset', async (ctx) => {
    const user = getUserInfo(ctx);
    if (!isAdminUser(user.id)) {
      await ctx.answerCbQuery('🚫 Unauthorized');
      return;
    }

    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText('🔄 Resetting database... Please wait...');

      const sqlite3 = require('sqlite3').verbose();
      const dbFile = CONFIG.DATABASE_PATH;

      await new Promise((resolve, reject) => {
        const resetDb = new sqlite3.Database(dbFile, (err) => {
          if (err) {
            reject(err);
            return;
          }

          resetDb.serialize(() => {
            resetDb.run('DELETE FROM Messages');
            resetDb.run('DELETE FROM Sessions');
            resetDb.run("DELETE FROM sqlite_sequence WHERE name='Messages'");
            resetDb.run("DELETE FROM sqlite_sequence WHERE name='Sessions'");
          });

          resetDb.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });

      await ctx.editMessageText('🗑️ Database reset completed!');
      setTimeout(() => ctx.reply('Admin Panel:', keyboards.admin), 1000);

    } catch (error) {
      await ctx.editMessageText(`❌ Database reset failed: ${error.message}`);
    }
  });

  bot.action('cancel_reset', async (ctx) => {
    await ctx.answerCbQuery('Reset cancelled');
    await ctx.editMessageText('❌ Database reset cancelled. No changes made.');
    setTimeout(() => ctx.reply('Admin Panel:', keyboards.admin), 1000);
  });

  // Admin help
  bot.hears('❓ ADMIN HELP', async (ctx) => {
    const user = getUserInfo(ctx);
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to view admin commands.');
      return;
    }

    const helpMessage = `🔧 Database Admin Help

🎮 Button Commands:
📊 DB STATUS - Check database stats
💾 BACKUP DB - Create backup
🗑️ RESET DB - Clear all data
🧾 LIST SESSIONS - Show recent sessions with titles
⬅️ BACK TO MAIN - Return to main menu

🧹 Deletion:
/deletesession <session_id> - Permanently delete a session and its messages`;

    ctx.reply(helpMessage, keyboards.admin);
  });

  // Command alternatives
  bot.command('dbstatus', async (ctx) => {
    const user = getUserInfo(ctx);
    if (!isAdminUser(user.id)) return;
    bot.handleUpdate({
      ...ctx.update,
      message: { ...ctx.message, text: '📊 DB STATUS' }
    });
  });

  bot.command('dbbackup', async (ctx) => {
    const user = getUserInfo(ctx);
    if (!isAdminUser(user.id)) return;
    bot.handleUpdate({
      ...ctx.update,
      message: { ...ctx.message, text: '💾 BACKUP DB' }
    });
  });

  // List sessions with titles (admin-only, single text message)
  bot.hears('🧾 LIST SESSIONS', async (ctx) => {
    const user = getUserInfo(ctx);
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to view sessions.');
      return;
    }

    try {
      const sessions = await db.getAllSessionsWithDetails();

      if (!sessions || sessions.length === 0) {
        ctx.reply('No sessions found in the database.', keyboards.admin);
        return;
      }

      const lines = sessions.map((s, idx) => {
        const title = s.title || s.session_id;
        const status = s.status || 'unknown';
        const count = typeof s.message_count === 'number' ? s.message_count : 'unknown';
        return `${idx + 1}. ${title}\nID: ${s.session_id}\nStatus: ${status}\nMessages: ${count}`;
      });

      let msg = '🧾 Sessions (latest first)\n\n';
      msg += lines.join('\n\n');
      msg += '\n\nUse /deletesession <session_id> to delete one.';

      ctx.reply(msg, keyboards.admin);
    } catch (err) {
      console.error('Error listing sessions from bot command:', err);
      ctx.reply(`❌ Failed to list sessions: ${err.message}`);
    }
  });

  // Delete a specific session by ID (admin-only)
  bot.command('deletesession', async (ctx) => {
    const user = getUserInfo(ctx);
    if (!isAdminUser(user.id)) return;

    const parts = ctx.message.text.split(' ').slice(1);
    const sessionId = parts.join(' ').trim();

    if (!sessionId) {
      ctx.reply('Usage: /deletesession <session_id>');
      return;
    }

    try {
      const result = await db.deleteSession(sessionId);

      if (!result.sessionsDeleted && !result.messagesDeleted) {
        ctx.reply(`No data found for session ID: ${sessionId}`);
        return;
      }

      ctx.reply(
        `🗑️ Session deleted\n\nID: ${sessionId}\nMessages removed: ${result.messagesDeleted}\nSession rows removed: ${result.sessionsDeleted}`,
        keyboards.admin
      );
    } catch (err) {
      console.error('Error deleting session from bot command:', err);
      ctx.reply(`❌ Failed to delete session ${sessionId}: ${err.message}`);
    }
  });

  console.log('✅ Admin handlers setup complete');
}

module.exports = {
  setupAdminHandlers
};
