// Load environment variables first
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Telegraf, Markup, Scenes, session } = require("telegraf");
const { message } = require("telegraf/filters");
const fastify = require("fastify")({ logger: false });
const handlebars = require("handlebars");
// Import the database functions
const db = require("./src/messagesDb");
// Import Notion CMS functions
const notionCms = require("./src/notionCms");
// Import Notion Sync
const { startPeriodicSync, syncNotion, getSyncStatus } = require("./scripts/sync-notion");

// Telegram Bot Setup
let recordingHasStarted = false;
let isPaused = false;
let currentSessionId = null; // Track the current recording session
let awaitingSessionTitle = false; // Track if we're waiting for a session title
let bot = null; // Initialize as null

// Admin user configuration - Add to your .env file
const ADMIN_TELEGRAM_USERS = process.env.ADMIN_TELEGRAM_USERS 
  ? process.env.ADMIN_TELEGRAM_USERS.split(',').map(id => parseInt(id.trim()))
  : [];

console.log('Admin Telegram users configured:', ADMIN_TELEGRAM_USERS.length);

// Helper function to check if user is admin
function isAdminUser(userId) {
  return ADMIN_TELEGRAM_USERS.includes(userId);
}

// Helper to check admin API key for HTTP endpoints
function isAdminRequest(request) {
  const adminKeyHeader = request.headers['x-admin-key'] || request.headers['x-admin-token'];
  const adminKeyQuery = request.query && request.query.admin_key;
  const expected = process.env.ADMIN_API_KEY || null;
  if (!expected) return false; // no admin key configured
  return (adminKeyHeader && adminKeyHeader === expected) || (adminKeyQuery && adminKeyQuery === expected);
}

// Helper function to get user info for logging
function getUserInfo(ctx) {
  return {
    id: ctx.from.id,
    username: ctx.from.username || 'unknown',
    first_name: ctx.from.first_name || 'unknown'
  };
}

// Clean initializeTelegramBot function - no debug code
function initializeTelegramBot() {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

  if (!telegramToken || process.env.TELEGRAM_DISABLED === "true") {
    console.log("🔧 Telegram bot disabled - no token provided or explicitly disabled");
    return null;
  }

  console.log("🔍 Telegram Debug:");
  console.log("- Token exists:", !!telegramToken);
  console.log("- Token length:", telegramToken?.length);
  console.log("- Token preview:", telegramToken?.substring(0, 10) + "...");

  try {
    bot = new Telegraf(telegramToken);

    // Enable session management for the bot
    bot.use(session());

    // Set up all bot handlers
    setupBotHandlers();

    // Launch the bot
    bot
      .launch()
      .then(() => {
        console.log("✅ Telegram bot started successfully");
      })
      .catch((err) => {
        console.error("❌ Failed to start Telegram bot:", err.message);
        bot = null;
      });

    // Graceful stop handlers
    process.once("SIGINT", () => {
      if (bot) {
        console.log("Stopping Telegram bot...");
        bot.stop("SIGINT");
      }
    });
    process.once("SIGTERM", () => {
      if (bot) {
        console.log("Stopping Telegram bot...");
        bot.stop("SIGTERM");
      }
    });

    return bot;
  } catch (error) {
    console.error("❌ Failed to initialize Telegram bot:", error.message);
    return null;
  }
}

// Function to generate a unique session ID
function generateSessionId() {
  return `session_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

// Store the session author temporarily
let currentSessionAuthor = null;

// Clean startRecording function
async function startRecording(ctx) {
  recordingHasStarted = false;
  isPaused = false;
  awaitingSessionTitle = true;
  currentSessionId = generateSessionId();
  // Save the author (who started the recording)
  currentSessionAuthor = ctx.from.first_name || ctx.from.username || "Anonymous";

  ctx.reply("Please enter a title for this recording session:");
}

// Clean finalizeSessionStart function
async function finalizeSessionStart(ctx, title) {
  try {
    const sessionData = {
      session_id: currentSessionId,
      title: title,
      created_at: new Date().toISOString(),
      status: "active",
      author: currentSessionAuthor,
    };
    
    await db.saveSession(sessionData);

    // Update state variables
    awaitingSessionTitle = false;
    recordingHasStarted = true;
    isPaused = false;

    // Create the keyboard layouts
    const activeRecordingKeyboard = Markup.keyboard([
      [
        Markup.button.text("⏸️ PAUSE RECORDING"),
        Markup.button.text("⏹️ STOP RECORDING"),
      ],
      [Markup.button.text("🔧 ADMIN PANEL")],
    ]).resize();

    const successMessage = `✅ Recording started!

📝 Session: "${title}"
🆔 ID: ${currentSessionId}
🎤 Status: ACTIVE

🗣️ Start chatting and I'll record everything with a 👀 reaction!`;

    ctx.reply(successMessage, activeRecordingKeyboard);

  } catch (error) {
    console.error("❌ Error in finalizeSessionStart:", error);
    
    const startRecordingKeyboard = Markup.keyboard([
      [Markup.button.text("🎙️ START RECORDING")],
      [Markup.button.text("🔧 ADMIN PANEL")],
    ]).resize();
    
    ctx.reply(
      "❌ Failed to start recording session. Please try again.\n\nError: " + error.message,
      startRecordingKeyboard
    );
    
    // Reset everything on error
    recordingHasStarted = false;
    isPaused = false;
    awaitingSessionTitle = false;
    currentSessionId = null;
    currentSessionAuthor = null;
  }
}

// Complete clean setupBotHandlers function
function setupBotHandlers() {
  if (!bot) return;

  // Create the keyboard layouts
  const startRecordingKeyboard = Markup.keyboard([
    [Markup.button.text("🎙️ START RECORDING")],
    [Markup.button.text("🔧 ADMIN PANEL")],
  ]).resize();

  const activeRecordingKeyboard = Markup.keyboard([
    [
      Markup.button.text("⏸️ PAUSE RECORDING"),
      Markup.button.text("⏹️ STOP RECORDING"),
    ],
    [Markup.button.text("🔧 ADMIN PANEL")],
  ]).resize();

  const pausedRecordingKeyboard = Markup.keyboard([
    [
      Markup.button.text("▶️ RESUME RECORDING"),
      Markup.button.text("⏹️ STOP RECORDING"),
    ],
    [Markup.button.text("🔧 ADMIN PANEL")],
  ]).resize();

  const adminKeyboard = Markup.keyboard([
    [
      Markup.button.text("📊 DB STATUS"),
      Markup.button.text("💾 BACKUP DB"),
    ],
    [
      Markup.button.text("🗑️ RESET DB"),
      Markup.button.text("❓ ADMIN HELP"),
    ],
    [Markup.button.text("⬅️ BACK TO MAIN")],
  ]).resize();

  // Bot commands
  bot.start((ctx) => {
    const user = getUserInfo(ctx);
    let welcomeMessage = "Yo! I'm ready whenever you are. Press the button to start recording.";
    
    if (isAdminUser(user.id)) {
      welcomeMessage += "\n\n🔧 As an admin, you can also access the Admin Panel for database management.";
    }
    
    ctx.reply(welcomeMessage, startRecordingKeyboard);
  });

  // Handle button presses
  bot.hears("🎙️ START RECORDING", (ctx) => {
    startRecording(ctx);
  });

  // Admin Panel Access
  bot.hears("🔧 ADMIN PANEL", async (ctx) => {
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
      adminKeyboard
    );
  });

  bot.hears("⬅️ BACK TO MAIN", (ctx) => {
    ctx.reply("Returning to main menu...", startRecordingKeyboard);
  });

  // Admin button handlers
  bot.hears("📊 DB STATUS", async (ctx) => {
    const user = getUserInfo(ctx);
    
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to view database information.');
      return;
    }
    
    try {
      const fs = require('fs');
      const path = require('path');
      const dbFile = './.data/messages.db';
      
      if (!fs.existsSync(dbFile)) {
        ctx.reply('❌ Database file not found. Run the app first to create the database.', adminKeyboard);
        return;
      }
      
      const stats = fs.statSync(dbFile);
      const sizeKB = (stats.size / 1024).toFixed(2);
      
      try {
        const messages = await db.getMessages('all');
        const sessions = await db.getAllSessions();
        const messageCount = messages ? messages.length : 0;
        const sessionCount = sessions ? sessions.length : 0;
        
        let latestSession = null;
        if (sessions && sessions.length > 0) {
          latestSession = sessions[0];
        }
        
        const backupDir = './backups';
        let backupInfo = 'No backups found';
        if (fs.existsSync(backupDir)) {
          const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.backup'));
          if (backups.length > 0) {
            backupInfo = `${backups.length} backups available`;
          }
        }
        
        const statusMessage = `📊 Database Status

💾 Database: ${sizeKB} KB
🕐 Last modified: ${stats.mtime.toLocaleString()}

📈 Content:
• Messages: ${messageCount}
• Sessions: ${sessionCount}

${latestSession ? `🔄 Latest Session:
Title: ${latestSession.title || latestSession.session_id}
Status: ${latestSession.status || 'unknown'}` : '📭 No sessions found'}

💾 Backups: ${backupInfo}`;
        
        ctx.reply(statusMessage, adminKeyboard);
        
      } catch (dbError) {
        console.error('Database query error:', dbError);
        ctx.reply(`❌ Database query failed: ${dbError.message}`, adminKeyboard);
      }
      
    } catch (error) {
      console.error(`❌ Database status error:`, error);
      ctx.reply(`❌ Status check failed: ${error.message}`, adminKeyboard);
    }
  });

  bot.hears("💾 BACKUP DB", async (ctx) => {
    const user = getUserInfo(ctx);
    
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to perform database operations.');
      return;
    }
    
    ctx.reply('🔄 Starting database backup...');
    
    try {
      const fs = require('fs');
      const path = require('path');
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = './backups';
      const dbFile = './.data/messages.db';
      
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      if (fs.existsSync(dbFile)) {
        const backupPath = path.join(backupDir, `messages.db.${timestamp}.backup`);
        fs.copyFileSync(dbFile, backupPath);
        
        const stats = fs.statSync(backupPath);
        const sizeKB = (stats.size / 1024).toFixed(2);
        
        try {
          const messages = await db.getMessages('all');
          const sessions = await db.getAllSessions();
          const messageCount = messages ? messages.length : 0;
          const sessionCount = sessions ? sessions.length : 0;
          
          const backupMessage = `✅ Database backup completed!
          
📁 Backup file: ${path.basename(backupPath)}
📊 Database size: ${sizeKB} KB
💬 Messages backed up: ${messageCount}
📋 Sessions backed up: ${sessionCount}
🕐 Backup time: ${new Date().toLocaleString()}`;
          
          ctx.reply(backupMessage, adminKeyboard);
          
        } catch (dbError) {
          const backupMessage = `✅ Database backup completed!
          
📁 Backup file: ${path.basename(backupPath)}
📊 Database size: ${sizeKB} KB
🕐 Backup time: ${new Date().toLocaleString()}

⚠️ Could not retrieve detailed stats: ${dbError.message}`;
          
          ctx.reply(backupMessage, adminKeyboard);
        }
        
      } else {
        ctx.reply('❌ Database file not found. Nothing to backup.', adminKeyboard);
      }
      
    } catch (error) {
      console.error(`❌ Database backup error:`, error);
      ctx.reply(`❌ Backup failed: ${error.message}`, adminKeyboard);
    }
  });

  bot.hears("🗑️ RESET DB", async (ctx) => {
    const user = getUserInfo(ctx);
    
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to perform database operations.');
      return;
    }
    
    const confirmKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Yes, Reset Database', 'confirm_reset'),
        Markup.button.callback('❌ Cancel', 'cancel_reset')
      ]
    ]);
    
    ctx.reply(
      `⚠️ DATABASE RESET WARNING ⚠️

This will permanently delete ALL:
• Conversation messages
• Recording sessions  
• Chat history

Are you absolutely sure you want to proceed?

This action CANNOT be undone!`,
      confirmKeyboard
    );
  });

  bot.hears("❓ ADMIN HELP", async (ctx) => {
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
⬅️ BACK TO MAIN - Return to main menu

💬 Text Commands (also available):
/dbstatus - Check database status
/dbbackup - Create a backup  
/dbreset - Reset database
/dbhelp - Show this help

💡 Tips:
• Always backup before resetting
• Reset creates automatic backup
• Use DB STATUS to monitor database
• You can use either buttons or commands`;
    
    ctx.reply(helpMessage, adminKeyboard);
  });

  // Recording control buttons
  bot.hears("⏸️ PAUSE RECORDING", async (ctx) => {
    if (recordingHasStarted && !isPaused) {
      isPaused = true;

      try {
        const session = await db.getSession(currentSessionId);
        if (session) {
          await db.saveSession({
            ...session,
            status: "paused",
          });
        }
      } catch (error) {
        console.error("Error updating session status:", error);
      }

      ctx.reply(
        `Recording paused. Session is on hold. Press resume to continue recording in this session.`,
        pausedRecordingKeyboard
      );
    }
  });

  bot.hears("▶️ RESUME RECORDING", async (ctx) => {
    if (recordingHasStarted && isPaused) {
      isPaused = false;

      try {
        const session = await db.getSession(currentSessionId);
        if (session) {
          await db.saveSession({
            ...session,
            status: "active",
          });
        }
      } catch (error) {
        console.error("Error updating session status:", error);
      }

      ctx.reply(
        `Recording resumed. Continuing session.`,
        activeRecordingKeyboard
      );
    }
  });

  bot.hears("⏹️ STOP RECORDING", async (ctx) => {
    if (recordingHasStarted) {
      const lastSessionId = currentSessionId;

      try {
        if (lastSessionId) {
          const updateResult = await db.saveSession({
            session_id: lastSessionId,
            status: "completed",
          });

          ctx.reply(
            `Recording stopped. Session completed successfully. Press the button to start a new session.`,
            startRecordingKeyboard
          );
        } else {
          ctx.reply(
            `Recording stopped. No active session was found. Press the button to start a new session.`,
            startRecordingKeyboard
          );
        }
      } catch (error) {
        console.error("Error updating session status on stop:", error);
        ctx.reply(
          `Recording stopped. Note: There was an error updating the session status. Press the button to start a new session.`,
          startRecordingKeyboard
        );
      } finally {
        recordingHasStarted = false;
        isPaused = false;
        currentSessionId = null;
        currentSessionAuthor = null;
        awaitingSessionTitle = false;
      }
    } else {
      ctx.reply("No active recording to stop.", startRecordingKeyboard);
    }
  });

  // Command alternatives
  bot.command("record", (ctx) => {
    startRecording(ctx);
  });

  bot.command("pause", async (ctx) => {
    if (recordingHasStarted && !isPaused) {
      isPaused = true;
      try {
        const session = await db.getSession(currentSessionId);
        if (session) {
          await db.saveSession({
            ...session,
            status: "paused",
          });
        }
      } catch (error) {
        console.error("Error updating session status:", error);
      }
      ctx.reply(`Recording paused. Session is on hold.`, pausedRecordingKeyboard);
    } else {
      ctx.reply("No active recording to pause.", startRecordingKeyboard);
    }
  });

  bot.command("resume", async (ctx) => {
    if (recordingHasStarted && isPaused) {
      isPaused = false;
      try {
        const session = await db.getSession(currentSessionId);
        if (session) {
          await db.saveSession({
            ...session,
            status: "active",
          });
        }
      } catch (error) {
        console.error("Error updating session status:", error);
      }
      ctx.reply(`Recording resumed. Continuing session.`, activeRecordingKeyboard);
    } else {
      ctx.reply("No paused recording to resume.", startRecordingKeyboard);
    }
  });

  bot.command("stop", async (ctx) => {
    if (recordingHasStarted) {
      const lastSessionId = currentSessionId;
      try {
        if (lastSessionId) {
          await db.saveSession({
            session_id: lastSessionId,
            status: "completed",
          });
          ctx.reply(`Recording stopped. Session completed successfully.`, startRecordingKeyboard);
        } else {
          ctx.reply(`Recording stopped. No active session was found.`, startRecordingKeyboard);
        }
      } catch (error) {
        console.error("Error updating session status on stop command:", error);
        ctx.reply(`Recording stopped. Note: There was an error updating the session status.`, startRecordingKeyboard);
      } finally {
        recordingHasStarted = false;
        isPaused = false;
        currentSessionId = null;
        currentSessionAuthor = null;
        awaitingSessionTitle = false;
      }
    } else {
      ctx.reply("No active recording to stop.", startRecordingKeyboard);
    }
  });

  // Main text message handler with emoji reactions
  bot.on(message("text"), async (ctx) => {
    const messageText = ctx.message.text;
    const userName = ctx.from.username || ctx.from.first_name || "Anonymous";

    // Check if we're waiting for a session title
    if (awaitingSessionTitle && currentSessionId) {
      const title = messageText.trim();

      if (!title) {
        ctx.reply("Please enter a valid title for the session:");
        return;
      }

      await finalizeSessionStart(ctx, title);
      return;
    }

    // Ignore button messages
    const buttonMessages = [
      "🎙️ START RECORDING",
      "⏸️ PAUSE RECORDING", 
      "▶️ RESUME RECORDING",
      "⏹️ STOP RECORDING",
      "🔧 ADMIN PANEL",
      "📊 DB STATUS",
      "💾 BACKUP DB", 
      "🗑️ RESET DB",
      "❓ ADMIN HELP",
      "⬅️ BACK TO MAIN"
    ];
    
    if (buttonMessages.includes(messageText)) {
      return;
    }

    // Record message if conditions are met
    if (recordingHasStarted && !isPaused && currentSessionId && !awaitingSessionTitle) {
      try {
        const session = await db.getSession(currentSessionId);
        const sessionTitle = session ? session.title : null;

        const msgToSave = {
          chat_id: ctx.chat.id.toString(),
          session_id: currentSessionId,
          session_title: sessionTitle,
          date: new Date(ctx.message.date * 1000).toISOString(),
          username: userName,
          message: messageText,
        };

        await db.saveMessage(msgToSave);

        // React with eye emoji
        await ctx.telegram.setMessageReaction(
          ctx.chat.id,
          ctx.message.message_id,
          [{ type: "emoji", emoji: "👀" }]
        );

      } catch (error) {
        console.error("❌ Error processing message:", error);
      }
      
    } else if (recordingHasStarted && isPaused) {
      ctx.reply(
        "Recording is currently paused. Press the resume button to continue recording.",
        pausedRecordingKeyboard
      );
      
    } else if (messageText.length > 3 && !awaitingSessionTitle) {
      ctx.reply(
        "🎙️ Recording is not active. Press 'START RECORDING' to begin a new session.",
        startRecordingKeyboard
      );
    }
  });

  // Admin command alternatives
  bot.command('dbbackup', async (ctx) => {
    const user = getUserInfo(ctx);
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to perform database operations.');
      return;
    }
    bot.handleUpdate({
      ...ctx.update,
      message: { ...ctx.message, text: "💾 BACKUP DB" }
    });
  });

  bot.command('dbreset', async (ctx) => {
    const user = getUserInfo(ctx);
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to perform database operations.');
      return;
    }
    bot.handleUpdate({
      ...ctx.update,
      message: { ...ctx.message, text: "🗑️ RESET DB" }
    });
  });

  bot.command('dbstatus', async (ctx) => {
    const user = getUserInfo(ctx);
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to view database information.');
      return;
    }
    bot.handleUpdate({
      ...ctx.update,
      message: { ...ctx.message, text: "📊 DB STATUS" }
    });
  });

  bot.command('dbhelp', async (ctx) => {
    const user = getUserInfo(ctx);
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to view admin commands.');
      return;
    }
    bot.handleUpdate({
      ...ctx.update,
      message: { ...ctx.message, text: "❓ ADMIN HELP" }
    });
  });

  // Handle reset confirmation
  bot.action('confirm_reset', async (ctx) => {
    const user = getUserInfo(ctx);
    
    if (!isAdminUser(user.id)) {
      ctx.answerCbQuery('🚫 Unauthorized');
      return;
    }
    
    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText('🔄 Resetting database... Please wait...');
      
      const fs = require('fs');
      const path = require('path');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = './backups';
      const dbFile = './.data/messages.db';
      
      let backupCreated = false;
      if (fs.existsSync(dbFile)) {
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        
        const backupPath = path.join(backupDir, `messages.db.${timestamp}.backup`);
        fs.copyFileSync(dbFile, backupPath);
        backupCreated = true;
      }
      
      let messageCount = 0;
      let sessionCount = 0;
      
      try {
        const messages = await db.getMessages('all');
        const sessions = await db.getAllSessions();
        messageCount = messages ? messages.length : 0;
        sessionCount = sessions ? sessions.length : 0;
      } catch (dbError) {
        console.log('Could not get counts before reset:', dbError.message);
      }
      
      await new Promise((resolve, reject) => {
        const sqlite3 = require('sqlite3').verbose();
        const resetDb = new sqlite3.Database(dbFile, (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          resetDb.serialize(() => {
            resetDb.run("DELETE FROM Messages", (err) => {
              if (err) console.error('Error clearing Messages:', err);
            });
            
            resetDb.run("DELETE FROM Sessions", (err) => {
              if (err) console.error('Error clearing Sessions:', err);
            });
            
            resetDb.run("DELETE FROM sqlite_sequence WHERE name='Messages'", (err) => {
              if (err && !err.message.includes('no such table')) {
                console.error('Error resetting Messages sequence:', err);
              }
            });
            
            resetDb.run("DELETE FROM sqlite_sequence WHERE name='Sessions'", (err) => {
              if (err && !err.message.includes('no such table')) {
                console.error('Error resetting Sessions sequence:', err);
              }
            });
          });
          
          resetDb.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
      
      const resetMessage = `🗑️ Database reset completed!

📊 Data cleared:
• Messages: ${messageCount}
• Sessions: ${sessionCount}

${backupCreated ? '💾 Automatic backup created before reset' : '⚠️ No backup created (database was empty)'}

🕐 Reset time: ${new Date().toLocaleString()}
👤 Reset by: ${user.username}

The database is now empty and ready for new recordings.`;
      
      await ctx.editMessageText(resetMessage);
      
      setTimeout(() => {
        ctx.reply("Admin Panel:", adminKeyboard);
      }, 1000);
      
      recordingHasStarted = false;
      isPaused = false;
      currentSessionId = null;
      currentSessionAuthor = null;
      awaitingSessionTitle = false;
      
    } catch (error) {
      console.error(`❌ Database reset error:`, error);
      await ctx.editMessageText(`❌ Database reset failed: ${error.message}`);
    }
  });

  bot.action('cancel_reset', async (ctx) => {
    const user = getUserInfo(ctx);
    
    await ctx.answerCbQuery('Reset cancelled');
    await ctx.editMessageText('❌ Database reset cancelled. No changes made.');
    
    setTimeout(() => {
      ctx.reply("Admin Panel:", adminKeyboard);
    }, 1000);
  });

  console.log('✅ Bot handlers setup complete');
}

// Register handlebars helpers
handlebars.registerHelper("formatDate", function (dateString) {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleString();
});

handlebars.registerHelper("toLowerCase", function (str) {
  return str ? str.toLowerCase() : "";
});

handlebars.registerHelper("truncateText", function (text, length) {
  if (!text) return "";
  length = parseInt(length) || 30;
  if (text.length <= length) return text;
  return text.substring(0, length) + "...";
});

handlebars.registerHelper("eq", function (a, b) {
  return a === b;
});

handlebars.registerHelper("ne", function (a, b) {
  return a !== b;
});

handlebars.registerHelper("lte", function (a, b) {
  return a <= b;
});


handlebars.registerHelper("statusIcon", function (status) {
  if (!status) return "fa-circle-question";

  switch (status.toLowerCase()) {
    case "active":
      return "fa-circle-play";
    case "paused":
      return "fa-circle-pause";
    case "completed":
      return "fa-circle-check";
    default:
      return "fa-circle-question";
  }
});

handlebars.registerHelper("groupByUser", function (messages, options) {
  if (!messages || !messages.length) return options.inverse(this);

  // Sort messages by date
  messages.sort((a, b) => new Date(a.date) - new Date(b.date));

  const groups = [];
  let currentGroup = [];
  let currentUser = null;

  messages.forEach((message) => {
    // If this is a message from a new user, create a new group
    if (currentUser !== message.username) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [message];
      currentUser = message.username;
    } else {
      // Add to existing group
      currentGroup.push(message);
    }
  });

  // Add the last group if it exists
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  let result = "";
  groups.forEach((group) => {
    result += options.fn(group);
  });

  return result;
});

// Auto-register Handlebars partials from `src/views/partials` and also `src/views/layouts` (including nested folders)
try {
  const partialsDir = path.join(__dirname, "src", "views", "partials");
  const layoutsDir = path.join(__dirname, "src", "views", "layouts");

  function registerPartials(dir, base = "") {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    entries.forEach((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nextBase = base ? path.join(base, entry.name) : entry.name;
        registerPartials(fullPath, nextBase);
      } else if (entry.isFile() && entry.name.endsWith('.hbs')) {
        const name = path.basename(entry.name, '.hbs');
        const partialName = base ? path.join(base, name).replace(/\\/g, '/') : name;
        const content = fs.readFileSync(fullPath, 'utf8');
        handlebars.registerPartial(partialName, content);
      }
    });
  }

  registerPartials(partialsDir);
  registerPartials(layoutsDir, 'layouts');
  console.log('✅ Handlebars partials registered from', partialsDir);
} catch (err) {
  console.warn('⚠️ Could not auto-register Handlebars partials:', err && err.message ? err.message : err);
}

// Fastify server setup
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/",
});
fastify.register(require("@fastify/formbody"));
fastify.register(require("@fastify/view"), {
  engine: {
    handlebars: handlebars,
  },
  templates: path.join(__dirname, "src/views"),
});
fastify.register(require("@fastify/cors")); // Enable CORS for frontend

// Serve the index page
fastify.get("/", async (request, reply) => {
  try {
    const sessions = await db.getAllSessionsWithDetails();
    
    // Get user metadata from Notion for participants (still needed for non-authors)
    const userMetadata = await notionCms.getUserMetadata();
    
    // Enrich sessions with display names from DB cache (author) and Notion (participants)
    const enrichedSessions = sessions.map(session => {
      // Use cached DB values for author if present, otherwise try Notion metadata
      let authorDisplay = session.author_display || session.author;
      if ((!authorDisplay || authorDisplay === session.author) && session.author) {
        const metaForAuthor = userMetadata.get(String(session.author).toLowerCase());
        if (metaForAuthor) {
          authorDisplay = metaForAuthor.override || metaForAuthor.originalName || session.author;
        }
      }

      // Enrich participants with display names
      const enrichedParticipants = (session.participants || []).map(p => {
        const meta = userMetadata.get(String(p).toLowerCase());
        return {
          original: p,
          display: meta?.override || p,
          isGuest: meta?.isGuest || false
        };
      });

      return {
        ...session,
        authorDisplay,
        participantsEnriched: enrichedParticipants,
        // Pass cached values for frontend
        author_is_guest: Boolean(session.author_is_guest),
        author_is_host: Boolean(session.author_is_host)
      };
    });
    
    return reply.view("homepage.hbs", { sessions: enrichedSessions });
  } catch (err) {
    console.error(err);
    return reply.view("homepage.hbs", { sessions: [] });
  }
});

// Nuova pagina About
fastify.get("/about", async (request, reply) => {
  return reply.view("about.hbs");
});

// Enhanced endpoint to get sessions with details
fastify.get("/sessions-details", async (request, reply) => {
  try {
    const sessionsWithDetails = await db.getAllSessionsWithDetails();
    return reply.send(sessionsWithDetails);
  } catch (err) {
    console.error(err);
    return reply.status(500).send("Error retrieving sessions details.");
  }
});

// Get unique session IDs
fastify.get("/sessions", async (request, reply) => {
  try {
    const sessions = await db.getUniqueSessions();
    return reply.send(sessions);
  } catch (err) {
    console.error(err);
    return reply.status(500).send("Error retrieving session IDs.");
  }
});

// Get all sessions with metadata
fastify.get("/sessions-list", async (request, reply) => {
  try {
    const sessions = await db.getAllSessions();
    return reply.send(sessions);
  } catch (err) {
    console.error(err);
    return reply.status(500).send("Error retrieving sessions list.");
  }
});

// Get details for a specific session
fastify.get("/session/:id", async (request, reply) => {
  try {
    const sessionId = request.params.id;
    const sessionDetails = await db.getSessionDetails(sessionId);

    if (!sessionDetails) {
      return reply.status(404).send("Session not found");
    }

    return reply.send(sessionDetails);
  } catch (err) {
    console.error(err);
    return reply.status(500).send("Error retrieving session details.");
  }
});

// Keep the original chat_ids endpoint for backward compatibility
fastify.get("/chat_ids", async (request, reply) => {
  try {
    const chatIds = await db.getUniqueChatIds();
    return reply.send(chatIds);
  } catch (err) {
    console.error(err);
    return reply.status(500).send("Error retrieving chat IDs.");
  }
});

// Get messages with filtering options
fastify.get("/messages", async (request, reply) => {
  try {
    const sessionId = request.query.session_id;
    const chatId = request.query.chat_id || "all";

    // Get user metadata from Notion (fallback for users not in session table)
    const userMetadata = await notionCms.getUserMetadata();

    // If a session ID is provided, prioritize filtering by session
    if (sessionId) {
      let messages = await db.getMessagesBySession(sessionId);
      const sessionDetails = await db.getSessionDetails(sessionId);

      // Enrich messages with Notion metadata (override names, status)
      messages = messages.map(msg => {
        // Try to get metadata from Notion
        const metadata = userMetadata.get(msg.username.toLowerCase());
        return {
          ...msg,
          displayName: metadata?.override || msg.username, // Override if exists
          isGuest: metadata?.isGuest || false,
          isHost: metadata?.isHost || false,
          notionStatus: metadata?.status || []
        };
      });

      // Build safe userMetadata object (only override/status, never real names)
      const safeUserMetadata = Array.from(userMetadata.entries()).reduce((acc, [key, val]) => {
        acc[key] = {
          override: val.override,
          isGuest: val.isGuest,
          isHost: val.isHost,
          status: val.status
        };
        return acc;
      }, {});

      return reply.send({
        session: sessionDetails,
        messages: messages,
        userMetadata: safeUserMetadata
      });
    } else {
      // Otherwise fall back to filtering by chat_id
      let messages = await db.getMessages(chatId);

      // Enrich messages with Notion metadata
      messages = messages.map(msg => {
        const metadata = userMetadata.get(msg.username.toLowerCase());
        return {
          ...msg,
          displayName: metadata?.override || msg.username,
          isGuest: metadata?.isGuest || false,
          isHost: metadata?.isHost || false,
          notionStatus: metadata?.status || []
        };
      });

      const safeUserMetadata = Array.from(userMetadata.entries()).reduce((acc, [key, val]) => {
        acc[key] = {
          override: val.override,
          isGuest: val.isGuest,
          isHost: val.isHost,
          status: val.status
        };
        return acc;
      }, {});

      return reply.send({
        session: null,
        messages: messages,
        userMetadata: safeUserMetadata
      });
    }
  } catch (err) {
    console.error(err);
    return reply.status(500).send("Error retrieving messages.");
  }
});

// Render sessions list with handlebars
fastify.get("/sessions-view", async (request, reply) => {
  try {
    const sessions = await db.getAllSessionsWithDetails();
    return reply.view("index.hbs", { sessions });
  } catch (err) {
    console.error(err);
    return reply.status(500).send("Error rendering sessions view.");
  }
});

// Render messages for a session with handlebars
fastify.get("/messages-view", async (request, reply) => {
  try {
    const sessionId = request.query.session_id;

    if (!sessionId) {
      return reply.redirect("/sessions-view");
    }

    const sessionDetails = await db.getSessionDetails(sessionId);
    let messages = await db.getMessagesBySession(sessionId);

    // Enrich messages with Notion metadata (displayName, isGuest, isHost)
    try {
      const userMetadata = await notionCms.getUserMetadata();
      messages = messages.map(msg => {
        const meta = userMetadata.get(String(msg.username).toLowerCase());
        return {
          ...msg,
          displayName: meta?.override || msg.username,
          isGuest: meta?.isGuest || false,
          isHost: meta?.isHost || false
        };
      });
    } catch (e) {
      // If Notion fails, fall back to raw messages
      console.error('Failed to enrich messages for messages-view:', e && e.message ? e.message : e);
    }

    return reply.view("messages.hbs", {
      session: sessionDetails,
      messages,
    });
  } catch (err) {
    console.error(err);
    return reply.status(500).send("Error rendering messages view.");
  }
});

// Endpoint per verificare e correggere manualmente lo stato delle sessioni
fastify.get("/check-sessions", async (request, reply) => {
  try {
    const result = await db.checkAndFixSessionStatuses();
    return reply.send({
      success: true,
      message: `Checked ${result.checked} sessions, updated ${result.updated} to completed status`,
      ...result,
    });
  } catch (err) {
    console.error("Error while checking sessions:", err);
    return reply.status(500).send({
      success: false,
      error: "Error while checking sessions",
      details: err.message,
    });
  }
});

// Endpoint per aggiornare manualmente lo stato di una sessione specifica
fastify.put("/session/:id/status", async (request, reply) => {
  try {
    const sessionId = request.params.id;
    const { status } = request.body;

    // Validare lo stato
    if (!status || !["active", "paused", "completed"].includes(status)) {
      return reply.status(400).send({
        success: false,
        error: "Invalid status. Must be one of: active, paused, completed",
      });
    }

    // Ottenere la sessione esistente
    const session = await db.getSession(sessionId);

    if (!session) {
      return reply.status(404).send({
        success: false,
        error: "Session not found",
      });
    }

    // Aggiornare lo stato
    await db.saveSession({
      ...session,
      status: status,
    });

    return reply.send({
      success: true,
      message: `Session ${sessionId} status updated to ${status}`,
      session_id: sessionId,
      status: status,
    });
  } catch (err) {
    console.error("Error updating session status:", err);
    return reply.status(500).send({
      success: false,
      error: "Error updating session status",
      details: err.message,
    });
  }
});

// Endpoint per correggere manualmente lo stato di una sessione specifica
fastify.post("/api/fix-session/:id", async (request, reply) => {
  try {
    const sessionId = request.params.id;
    const { status } = request.body;

    if (!sessionId) {
      return reply.status(400).send({
        success: false,
        error: "Session ID is required",
      });
    }

    // Validare lo stato
    if (!status || !["active", "paused", "completed"].includes(status)) {
      return reply.status(400).send({
        success: false,
        error: "Invalid status. Must be one of: active, paused, completed",
      });
    }

    // Usa la funzione di correzione forzata
    const result = await db.forceUpdateSessionStatus(sessionId, status);

    if (result) {
      return reply.send({
        success: true,
        message: `Session ${sessionId} status successfully updated to ${status}`,
        session_id: sessionId,
        status: status,
      });
    } else {
      return reply.status(500).send({
        success: false,
        error: `Failed to update session ${sessionId} status`,
      });
    }
  } catch (err) {
    console.error("Error handling manual fix request:", err);
    return reply.status(500).send({
      success: false,
      error: "Error updating session status",
      details: err.message,
    });
  }
});

// Endpoint per verificare e correggere tutte le sessioni
fastify.post("/api/fix-all-sessions", async (request, reply) => {
  try {
    // Ottieni tutte le sessioni
    const sessions = await db.getAllSessions();

    if (!sessions || sessions.length === 0) {
      return reply.status(404).send({
        success: false,
        error: "No sessions found",
      });
    }

    // Conta le sessioni aggiornate
    let updatedCount = 0;

    // Controlla ogni sessione
    for (const session of sessions) {
      // Se lo stato è nullo o undefined, imposta "completed"
      if (!session.status) {
        const result = await db.forceUpdateSessionStatus(
          session.session_id,
          "completed"
        );
        if (result) updatedCount++;
      }
      // Se lo stato è "active" ma la sessione è vecchia, imposta "completed"
      else if (session.status === "active") {
        const lastMsg = await db.get(
          "SELECT date FROM Messages WHERE session_id = ? ORDER BY date DESC LIMIT 1",
          [session.session_id]
        );

        const lastMsgTime = lastMsg ? new Date(lastMsg.date).getTime() : 0;
        const creationTime = new Date(session.created_at).getTime();
        const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000;

        // Se l'ultimo messaggio o la creazione è più vecchia di 1 ora, marca come completata
        if (
          (lastMsgTime && lastMsgTime < oneHourAgo) ||
          (!lastMsgTime && creationTime < oneHourAgo)
        ) {
          const result = await db.forceUpdateSessionStatus(
            session.session_id,
            "completed"
          );
          if (result) updatedCount++;
        }
      }
    }

    return reply.send({
      success: true,
      message: `Checked ${sessions.length} sessions, updated ${updatedCount} to completed status`,
      total: sessions.length,
      updated: updatedCount,
    });
  } catch (err) {
    console.error("Error handling fix-all-sessions request:", err);
    return reply.status(500).send({
      success: false,
      error: "Error updating sessions",
      details: err.message,
    });
  }
});

// ============================================
// NOTION CMS API ENDPOINTS
// ============================================

// Get page content by title (for guests, etc.)
fastify.get("/api/notion/page/:title", async (request, reply) => {
  try {
    const { title } = request.params;
    if (!title) {
      return reply.status(400).send({ error: "Title parameter is required" });
    }

    const pageData = await notionCms.getPageByTitle(decodeURIComponent(title));
    
    if (!pageData) {
      return reply.status(404).send({ error: "Page not found", title });
    }

    return reply.send(pageData);
  } catch (err) {
    console.error("Error fetching Notion page:", err);
    return reply.status(500).send({ error: "Error fetching page from Notion" });
  }
});

// Get upcoming chat info
fastify.get("/api/notion/upcoming-chat", async (request, reply) => {
  try {
    const upcomingChat = await notionCms.getUpcomingChat();
    
    if (!upcomingChat) {
      return reply.send({ found: false, message: "No upcoming chat configured" });
    }

    return reply.send({ found: true, ...upcomingChat });
  } catch (err) {
    console.error("Error fetching upcoming chat:", err);
    return reply.status(500).send({ error: "Error fetching upcoming chat" });
  }
});

// List all pages (for debugging/admin)
fastify.get("/api/notion/pages", async (request, reply) => {
  try {
    if (!isAdminRequest(request)) return reply.status(401).send({ error: 'Unauthorized' });
    const pages = await notionCms.getAllPages();
    return reply.send({ count: pages.length, pages });
  } catch (err) {
    console.error("Error fetching all Notion pages:", err);
    return reply.status(500).send({ error: "Error fetching pages" });
  }
});

// DEPRECATED - Endpoint removed for privacy (exposed real names)
// Use /api/user-metadata instead

// Get user metadata (safe - return both mappings)
// - byOriginal: keys are the original username (lowercase) -> { originalName, displayName, isGuest, isHost }
// - byDisplay: keys are the override/displayName (lowercase) -> { displayName, isGuest, isHost, originalName }
fastify.get("/api/user-metadata", async (request, reply) => {
  try {
    const userMetadata = await notionCms.getUserMetadata();

    const byOriginal = {};
    const byDisplay = {};

    userMetadata.forEach((val, key) => {
      // `key` is expected to be the original name lowercased as returned by notionCms
      const originalKey = key;
      const originalName = val.originalName || key;
      const displayName = val.override || null;

      byOriginal[originalKey] = {
        originalName,
        displayName,
        isGuest: Boolean(val.isGuest),
        isHost: Boolean(val.isHost)
      };

      if (displayName) {
        byDisplay[displayName.toLowerCase()] = {
          displayName,
          isGuest: Boolean(val.isGuest),
          isHost: Boolean(val.isHost),
          originalName
        };
      }
    });

    // Return both mappings for proper name resolution
    // byOriginal: keyed by original name (lowercase) -> metadata
    // byDisplay: keyed by override/display name (lowercase) -> metadata
    return reply.send({
      byOriginal,  // Includes originalName and displayName
      byDisplay    // Includes originalName for reverse lookup
    });
  } catch (err) {
    console.error("Error fetching user metadata:", err);
    return reply.status(500).send({ error: "Error fetching metadata" });
  }
});

// Admin-only: full user metadata (original + display mapping) - requires ADMIN_API_KEY header or ?admin_key=
fastify.get("/api/user-metadata/admin", async (request, reply) => {
  try {
    if (!isAdminRequest(request)) return reply.status(401).send({ error: 'Unauthorized' });
    const userMetadata = await notionCms.getUserMetadata();

    const byOriginal = {};
    const byDisplay = {};
    userMetadata.forEach((val, key) => {
      const originalKey = key;
      const originalName = val.originalName || key;
      const displayName = val.override || null;

      byOriginal[originalKey] = {
        originalName,
        displayName,
        isGuest: Boolean(val.isGuest),
        isHost: Boolean(val.isHost)
      };

      if (displayName) {
        byDisplay[displayName.toLowerCase()] = {
          displayName,
          isGuest: Boolean(val.isGuest),
          isHost: Boolean(val.isHost),
          originalName
        };
      }
    });

    return reply.send({ byOriginal, byDisplay });
  } catch (err) {
    console.error("Error fetching admin user metadata:", err);
    return reply.status(500).send({ error: "Error fetching metadata" });
  }
});

// Clear Notion cache (force refresh)
fastify.post("/api/notion/clear-cache", async (request, reply) => {
  try {
    if (!isAdminRequest(request)) return reply.status(401).send({ error: 'Unauthorized' });
    notionCms.clearCache();
    return reply.send({ success: true, message: "Notion cache cleared" });
  } catch (err) {
    return reply.status(500).send({ error: "Error clearing cache" });
  }
});

// Manual sync endpoint (admin only)
fastify.post("/admin/sync", async (request, reply) => {
  try {
    if (!isAdminRequest(request)) return reply.status(401).send({ error: 'Unauthorized' });
    console.log('[Admin] Manual sync triggered');
    const result = await syncNotion();
    return reply.send({ success: true, result });
  } catch (err) {
    console.error("Error in manual sync:", err);
    return reply.status(500).send({ error: "Error syncing with Notion" });
  }
});

// Get sync status (for monitoring)
fastify.get("/admin/sync-status", async (request, reply) => {
  try {
    if (!isAdminRequest(request)) return reply.status(401).send({ error: 'Unauthorized' });
    const status = getSyncStatus();
    return reply.send(status);
  } catch (err) {
    return reply.status(500).send({ error: "Error getting sync status" });
  }
});

// Reset database (admin only)
fastify.post("/admin/reset-db", async (request, reply) => {
  try {
    if (!isAdminRequest(request)) return reply.status(401).send({ error: 'Unauthorized' });

    console.log('[Admin] Database reset triggered');

    const cleared = await db.resetDatabase();

    return reply.send({
      success: true,
      message: 'Database reset complete',
      cleared
    });
  } catch (err) {
    console.error("Error resetting database:", err);

    // Handle partial success (some operations failed)
    if (err.partial) {
      return reply.status(500).send({
        success: false,
        error: 'Database reset completed with errors',
        errors: err.errors,
        cleared: err.cleared
      });
    }

    return reply.status(500).send({
      error: "Error resetting database",
      details: err.message
    });
  }
});

let sessionCheckInterval;

// Avvia il server con una migliore inizializzazione
const start = async () => {
  try {
    // Verifica che il database sia inizializzato correttamente
    if (typeof db.verifyAndRepairDatabase === "function") {
      await db.verifyAndRepairDatabase();
    }

    // Esegui un controllo iniziale delle sessioni
    if (typeof db.checkAndFixSessionStatuses === "function") {
      console.log("Running initial session status check...");
      try {
        const result = await db.checkAndFixSessionStatuses();
        console.log(
          `Initial session status check: checked ${result.checked}, updated ${result.updated}`
        );
      } catch (err) {
        console.error("Error in initial session status check:", err);
      }
    }

    // Avvia il server
    await fastify.listen({ port: process.env.PORT || 3000, host: "0.0.0.0" });
    console.log(`Server listening on ${fastify.server.address().port}`);

    // Start Notion sync (runs initial sync + every 30 minutes)
    // startPeriodicSync returns an interval id so we can clear it on shutdown
    const notionSyncIntervalId = startPeriodicSync();

    // Initialize Telegram bot AFTER server is running
    initializeTelegramBot();

    // Imposta il controllo periodico delle sessioni
    sessionCheckInterval = setInterval(async () => {
      try {
        if (typeof db.checkAndFixSessionStatuses === "function") {
          const result = await db.checkAndFixSessionStatuses();
          if (result.updated > 0) {
            console.log(
              `Periodic session check: checked ${result.checked}, updated ${result.updated}`
            );
          }
        }
      } catch (err) {
        console.error("Error in periodic session status check:", err);
      }
    }, 30 * 60 * 1000); // Ogni 30 minuti

    // Gestione della terminazione del server
    process.once("SIGINT", () => {
      console.log("Received SIGINT, stopping server...");
      clearInterval(sessionCheckInterval);
      try { if (notionSyncIntervalId) clearInterval(notionSyncIntervalId); } catch (e) {}
      fastify.close();
      if (bot) bot.stop("SIGINT");
    });

    process.once("SIGTERM", () => {
      console.log("Received SIGTERM, stopping server...");
      clearInterval(sessionCheckInterval);
      try { if (notionSyncIntervalId) clearInterval(notionSyncIntervalId); } catch (e) {}
      fastify.close();
      if (bot) bot.stop("SIGTERM");
    });
  } catch (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
};

// Esegui il server
start();