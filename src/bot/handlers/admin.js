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
      ctx.reply('🚫 You are not authorized to perform database operations.');
      return;
    }

    ctx.reply('🔄 Starting database backup...');

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = CONFIG.DATABASE_BACKUP_DIR;
      const dbFile = CONFIG.DATABASE_PATH;

      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      if (fs.existsSync(dbFile)) {
        const backupPath = path.join(backupDir, `messages.db.${timestamp}.backup`);
        fs.copyFileSync(dbFile, backupPath);

        ctx.reply(`✅ Database backup completed!\n\n📁 Backup file: ${path.basename(backupPath)}`, keyboards.admin);
      } else {
        ctx.reply('❌ Database file not found. Nothing to backup.', keyboards.admin);
      }
    } catch (error) {
      ctx.reply(`❌ Backup failed: ${error.message}`, keyboards.admin);
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
⬅️ BACK TO MAIN - Return to main menu`;

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

  console.log('✅ Admin handlers setup complete');
}

module.exports = {
  setupAdminHandlers
};
