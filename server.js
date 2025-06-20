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

// Helper function to get user info for logging
function getUserInfo(ctx) {
  return {
    id: ctx.from.id,
    username: ctx.from.username || 'unknown',
    first_name: ctx.from.first_name || 'unknown'
  };
}

// Improved Telegram bot initialization
function initializeTelegramBot() {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

  if (!telegramToken || process.env.TELEGRAM_DISABLED === "true") {
    console.log(
      "🔧 Telegram bot disabled - no token provided or explicitly disabled"
    );
    return null;
  }

  // Debug token info
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
        bot = null; // Reset bot to null if failed
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

// Function to setup all bot handlers
// Function to setup all bot handlers - REPLACE your existing setupBotHandlers function
// Complete setupBotHandlers function - REPLACE YOUR ENTIRE EXISTING ONE
function setupBotHandlers() {
  if (!bot) return;

  // Create the keyboard layouts
  const startRecordingKeyboard = Markup.keyboard([
    [Markup.button.text("🎙️ START RECORDING")],
    [Markup.button.text("🔧 ADMIN PANEL")], // Add admin button
  ]).resize();

  const activeRecordingKeyboard = Markup.keyboard([
    [
      Markup.button.text("⏸️ PAUSE RECORDING"),
      Markup.button.text("⏹️ STOP RECORDING"),
    ],
    [Markup.button.text("🔧 ADMIN PANEL")], // Add admin button
  ]).resize();

  const pausedRecordingKeyboard = Markup.keyboard([
    [
      Markup.button.text("▶️ RESUME RECORDING"),
      Markup.button.text("⏹️ STOP RECORDING"),
    ],
    [Markup.button.text("🔧 ADMIN PANEL")], // Add admin button
  ]).resize();

  // Admin keyboard for authorized users
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

  // Function to handle session recording start
  async function startRecording(ctx) {
    recordingHasStarted = false; // Temporarily disable recording until we get the title
    isPaused = false;
    awaitingSessionTitle = true;
    currentSessionId = generateSessionId();

    ctx.reply("Please enter a title for this recording session:");
  }

  // Function to finalize session start after getting the title
  // Replace these two functions in your setupBotHandlers:

// Function to finalize session start after getting the title
async function finalizeSessionStart(ctx, title) {
  try {
    console.log(`Creating session with title: "${title}" and ID: ${currentSessionId}`);
    
    await db.saveSession({
      session_id: currentSessionId,
      title: title,
      created_at: new Date().toISOString(),
      status: "active",
    });

    // IMPORTANT: Set these in the correct order
    awaitingSessionTitle = false;  // Stop waiting for title FIRST
    recordingHasStarted = true;     // Then enable recording

    console.log(`✅ Session started successfully: ${currentSessionId}`);
    console.log(`Recording state: started=${recordingHasStarted}, paused=${isPaused}, awaiting=${awaitingSessionTitle}`);

    ctx.reply(
      `✅ Recording started!

📝 Session: "${title}"
🆔 ID: ${currentSessionId}
🎤 Status: ACTIVE - Ready to record messages

Start chatting and I'll record everything! 👀`,
      activeRecordingKeyboard
    );
  } catch (error) {
    console.error("Error starting session:", error);
    ctx.reply(
      "❌ Failed to start recording session. Please try again.",
      startRecordingKeyboard
    );
    recordingHasStarted = false;
    isPaused = false;
    awaitingSessionTitle = false;
    currentSessionId = null;
  }
}

  // Handle the button presses
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
    
    console.log(`📊 Database status requested by admin: ${user.username} (${user.id})`);
    
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
      
      // Get database counts using your existing db functions
      try {
        const messages = await db.getMessages('all');
        const sessions = await db.getAllSessions();
        const messageCount = messages ? messages.length : 0;
        const sessionCount = sessions ? sessions.length : 0;
        
        // Get latest session
        let latestSession = null;
        if (sessions && sessions.length > 0) {
          latestSession = sessions[0]; // Should be sorted by date
        }
        
        // Check backups
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
      console.error(`❌ Database status error (requested by ${user.username}):`, error);
      ctx.reply(`❌ Status check failed: ${error.message}`, adminKeyboard);
    }
  });

  bot.hears("💾 BACKUP DB", async (ctx) => {
    const user = getUserInfo(ctx);
    
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to perform database operations.');
      return;
    }
    
    console.log(`🔧 Database backup requested by admin: ${user.username} (${user.id})`);
    ctx.reply('🔄 Starting database backup...');
    
    try {
      const fs = require('fs');
      const path = require('path');
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = './backups';
      const dbFile = './.data/messages.db';
      
      // Ensure backup directory exists
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      if (fs.existsSync(dbFile)) {
        const backupPath = path.join(backupDir, `messages.db.${timestamp}.backup`);
        fs.copyFileSync(dbFile, backupPath);
        
        const stats = fs.statSync(backupPath);
        const sizeKB = (stats.size / 1024).toFixed(2);
        
        // Get database stats using your existing functions
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
          console.log(`✅ Database backup completed by ${user.username}: ${backupPath}`);
          
        } catch (dbError) {
          // If db functions fail, still show basic backup success
          const backupMessage = `✅ Database backup completed!
          
📁 Backup file: ${path.basename(backupPath)}
📊 Database size: ${sizeKB} KB
🕐 Backup time: ${new Date().toLocaleString()}

⚠️ Could not retrieve detailed stats: ${dbError.message}`;
          
          ctx.reply(backupMessage, adminKeyboard);
          console.log(`✅ Database backup completed by ${user.username}: ${backupPath}`);
        }
        
      } else {
        ctx.reply('❌ Database file not found. Nothing to backup.', adminKeyboard);
        console.log(`⚠️ Database backup failed - file not found. Requested by ${user.username}`);
      }
      
    } catch (error) {
      console.error(`❌ Database backup error (requested by ${user.username}):`, error);
      ctx.reply(`❌ Backup failed: ${error.message}`, adminKeyboard);
    }
  });

  bot.hears("🗑️ RESET DB", async (ctx) => {
    const user = getUserInfo(ctx);
    
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to perform database operations.');
      return;
    }
    
    console.log(`⚠️ Database reset requested by admin: ${user.username} (${user.id})`);
    
    // Create confirmation keyboard
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

  bot.hears("⏸️ PAUSE RECORDING", async (ctx) => {
    if (recordingHasStarted && !isPaused) {
      isPaused = true;

      // Update session status in database
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

      // Update session status in database
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
      // Recupera l'ID sessione corrente prima di reimpostarlo
      const lastSessionId = currentSessionId;

      // Aggiorna lo stato della sessione nel database
      try {
        if (lastSessionId) {
          console.log(`Stopping recording for session: ${lastSessionId}`);

          // Prima verifica la sessione attuale
          const currentSession = await db.getSession(lastSessionId);
          console.log(
            `Current session before stop: ${JSON.stringify(currentSession)}`
          );

          // Forza lo stato a 'completed'
          const updateResult = await db.saveSession({
            session_id: lastSessionId,
            status: "completed",
          });

          console.log(
            `Session updated with result: ${JSON.stringify(updateResult)}`
          );

          // Verifica che lo stato sia stato effettivamente aggiornato
          const updatedSession = await db.getSession(lastSessionId);
          console.log(
            `Session after update: ${JSON.stringify(updatedSession)}`
          );

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
        // Reimposta sempre le variabili di stato, anche in caso di errore
        recordingHasStarted = false;
        isPaused = false;
        currentSessionId = null;
      }
    } else {
      ctx.reply("No active recording to stop.", startRecordingKeyboard);
    }
  });

  // Keep the /record and /stop commands as alternative ways to control recording
  bot.command("record", (ctx) => {
    startRecording(ctx);
  });

  bot.command("pause", async (ctx) => {
    if (recordingHasStarted && !isPaused) {
      isPaused = true;

      // Update session status in database
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
        `Recording paused. Session is on hold.`,
        pausedRecordingKeyboard
      );
    } else {
      ctx.reply("No active recording to pause.", startRecordingKeyboard);
    }
  });

  bot.command("resume", async (ctx) => {
    if (recordingHasStarted && isPaused) {
      isPaused = false;

      // Update session status in database
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
    } else {
      ctx.reply("No paused recording to resume.", startRecordingKeyboard);
    }
  });

  bot.command("stop", async (ctx) => {
    if (recordingHasStarted) {
      // Recupera l'ID sessione corrente prima di reimpostarlo
      const lastSessionId = currentSessionId;

      // Aggiorna lo stato della sessione nel database
      try {
        if (lastSessionId) {
          console.log(
            `Stopping recording via command for session: ${lastSessionId}`
          );

          // Prima verifica la sessione attuale
          const currentSession = await db.getSession(lastSessionId);
          console.log(
            `Current session before stop: ${JSON.stringify(currentSession)}`
          );

          // Forza lo stato a 'completed'
          const updateResult = await db.saveSession({
            session_id: lastSessionId,
            status: "completed",
          });

          console.log(
            `Session updated with result: ${JSON.stringify(updateResult)}`
          );

          // Verifica che lo stato sia stato effettivamente aggiornato
          const updatedSession = await db.getSession(lastSessionId);
          console.log(
            `Session after update: ${JSON.stringify(updatedSession)}`
          );

          ctx.reply(
            `Recording stopped. Session completed successfully.`,
            startRecordingKeyboard
          );
        } else {
          ctx.reply(
            `Recording stopped. No active session was found.`,
            startRecordingKeyboard
          );
        }
      } catch (error) {
        console.error("Error updating session status on stop command:", error);
        ctx.reply(
          `Recording stopped. Note: There was an error updating the session status.`,
          startRecordingKeyboard
        );
      } finally {
        // Reimposta sempre le variabili di stato, anche in caso di errore
        recordingHasStarted = false;
        isPaused = false;
        currentSessionId = null;
      }
    } else {
      ctx.reply("No active recording to stop.", startRecordingKeyboard);
    }
  });

  // Handle text messages - FIXED VERSION
  bot.on(message("text"), async (ctx) => {
    console.log(`📨 Received message: "${ctx.message.text}"`);
    console.log(`Current state: recording=${recordingHasStarted}, paused=${isPaused}, awaiting=${awaitingSessionTitle}`);
  
    // Check if we're waiting for a session title
    if (awaitingSessionTitle) {
      const title = ctx.message.text.trim();
      console.log(`🏷️ Processing session title: "${title}"`);
  
      // Validate title (e.g., non-empty)
      if (!title) {
        ctx.reply("Please enter a valid title for the session:");
        return;
      }
  
      // Start the session with the provided title
      await finalizeSessionStart(ctx, title);
      return;
    }
  
    // Ignore the keyboard button messages
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
    
    if (buttonMessages.includes(ctx.message.text)) {
      console.log(`🔘 Ignoring button message: ${ctx.message.text}`);
      return; // Let the button handlers deal with these
    }
  
    // Handle recording messages
    if (recordingHasStarted && !isPaused && currentSessionId) {
      console.log(`💾 Recording message for session: ${currentSessionId}`);
      
      try {
        // Get session details
        const session = await db.getSession(currentSessionId);
        const sessionTitle = session ? session.title : null;
  
        const msgToSave = {
          chat_id: ctx.chat.id.toString(),
          session_id: currentSessionId,
          session_title: sessionTitle,
          date: new Date(ctx.message.date * 1000).toISOString(),
          username: ctx.from.username || "Anonymous",
          message: ctx.message.text,
        };
  
        // Save the message to the database
        await db.saveMessage(msgToSave);
        console.log("✅ Message saved successfully:", {
          session: currentSessionId,
          user: msgToSave.username,
          message: msgToSave.message.substring(0, 50) + "..."
        });
  
        // React with eye emoji to the original message
        try {
          await ctx.telegram.setMessageReaction(
            ctx.chat.id,
            ctx.message.message_id,
            [{ type: "emoji", emoji: "👀" }]
          );
        } catch (error) {
          console.error("Error setting reaction:", error);
        }
      } catch (error) {
        console.error("❌ Error processing message:", error);
      }
    } else if (recordingHasStarted && isPaused) {
      console.log(`⏸️ Message received but recording is paused`);
      ctx.reply(
        "Recording is currently paused. Press the resume button to continue recording.",
        pausedRecordingKeyboard
      );
    } else {
      // Log why message wasn't recorded
      console.log(`❌ Message not recorded. State: recording=${recordingHasStarted}, paused=${isPaused}, session=${currentSessionId}`);
      
      // Optional: Give user feedback if they seem to be trying to chat
      if (!awaitingSessionTitle && ctx.message.text.length > 3) {
        ctx.reply(
          "🎙️ Recording is not active. Press 'START RECORDING' to begin a new session.",
          startRecordingKeyboard
        );
      }
    }
  });

  // ===== ADMIN COMMANDS (keep these for backwards compatibility) =====

  // Database backup command
  bot.command('dbbackup', async (ctx) => {
    // Redirect to button handler
    const user = getUserInfo(ctx);
    
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to perform database operations.');
      return;
    }
    
    // Trigger the backup function directly
    bot.handleUpdate({
      ...ctx.update,
      message: {
        ...ctx.message,
        text: "💾 BACKUP DB"
      }
    });
  });

  // Database reset command
  bot.command('dbreset', async (ctx) => {
    const user = getUserInfo(ctx);
    
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to perform database operations.');
      return;
    }
    
    // Trigger the reset function directly
    bot.handleUpdate({
      ...ctx.update,
      message: {
        ...ctx.message,
        text: "🗑️ RESET DB"
      }
    });
  });

  // Database status command
  bot.command('dbstatus', async (ctx) => {
    const user = getUserInfo(ctx);
    
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to view database information.');
      return;
    }
    
    // Trigger the status function directly
    bot.handleUpdate({
      ...ctx.update,
      message: {
        ...ctx.message,
        text: "📊 DB STATUS"
      }
    });
  });

  // Admin help command
  bot.command('dbhelp', async (ctx) => {
    const user = getUserInfo(ctx);
    
    if (!isAdminUser(user.id)) {
      ctx.reply('🚫 You are not authorized to view admin commands.');
      return;
    }
    
    // Trigger the help function directly
    bot.handleUpdate({
      ...ctx.update,
      message: {
        ...ctx.message,
        text: "❓ ADMIN HELP"
      }
    });
  });

  // Handle reset confirmation
  bot.action('confirm_reset', async (ctx) => {
    const user = getUserInfo(ctx);
    
    if (!isAdminUser(user.id)) {
      ctx.answerCbQuery('🚫 Unauthorized');
      return;
    }
    
    console.log(`🗑️ Database reset confirmed by admin: ${user.username} (${user.id})`);
    
    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText('🔄 Resetting database... Please wait...');
      
      // First create a backup
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
        console.log(`📁 Auto-backup created before reset: ${backupPath}`);
      }
      
      // Get counts before reset using your existing functions
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
      
      // Perform the reset using direct SQLite operations
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

The database is now empty and ready for new recordings.

Use the keyboard below to continue:`;
      
      await ctx.editMessageText(resetMessage);
      
      // Show admin keyboard after reset
      setTimeout(() => {
        ctx.reply("Admin Panel:", adminKeyboard);
      }, 1000);
      
      console.log(`✅ Database reset completed by ${user.username}`);
      
      // Reset any active recording state
      recordingHasStarted = false;
      isPaused = false;
      currentSessionId = null;
      awaitingSessionTitle = false;
      
    } catch (error) {
      console.error(`❌ Database reset error (by ${user.username}):`, error);
      await ctx.editMessageText(`❌ Database reset failed: ${error.message}`);
    }
  });

  // Handle reset cancellation
  bot.action('cancel_reset', async (ctx) => {
    const user = getUserInfo(ctx);
    console.log(`❌ Database reset cancelled by: ${user.username} (${user.id})`);
    
    await ctx.answerCbQuery('Reset cancelled');
    await ctx.editMessageText('❌ Database reset cancelled. No changes made.');
    
    // Show admin keyboard after cancellation
    setTimeout(() => {
      ctx.reply("Admin Panel:", adminKeyboard);
    }, 1000);
  });

  console.log('🔧 Database admin commands registered for Telegram bot');
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
    return reply.view("homepage.hbs", { sessions });
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

    // If a session ID is provided, prioritize filtering by session
    if (sessionId) {
      const messages = await db.getMessagesBySession(sessionId);
      return reply.send(messages);
    } else {
      // Otherwise fall back to filtering by chat_id
      const messages = await db.getMessages(chatId);
      return reply.send(messages);
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
    const messages = await db.getMessagesBySession(sessionId);

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
      fastify.close();
      if (bot) bot.stop("SIGINT");
    });

    process.once("SIGTERM", () => {
      console.log("Received SIGTERM, stopping server...");
      clearInterval(sessionCheckInterval);
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