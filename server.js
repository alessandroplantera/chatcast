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

const bot = new Telegraf(process.env.BOT_TOKEN || "YOUR_BOT_TOKEN");

// Enable session management for the bot
bot.use(session());

// Function to generate a unique session ID
function generateSessionId() {
  return `session_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

// Create the keyboard layouts
const startRecordingKeyboard = Markup.keyboard([
  [Markup.button.text('🎙️ START RECORDING')],
]).resize();

const activeRecordingKeyboard = Markup.keyboard([
  [Markup.button.text('⏸️ PAUSE RECORDING'), Markup.button.text('⏹️ STOP RECORDING')],
]).resize();

const pausedRecordingKeyboard = Markup.keyboard([
  [Markup.button.text('▶️ RESUME RECORDING'), Markup.button.text('⏹️ STOP RECORDING')],
]).resize();

// Bot commands
bot.start((ctx) => {
  ctx.reply(
    "Yo! I'm ready whenever you are. Press the button to start recording.", 
    startRecordingKeyboard
  );
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
async function finalizeSessionStart(ctx, title) {
  try {
    await db.saveSession({
      session_id: currentSessionId,
      title: title,
      created_at: new Date().toISOString(),
      status: 'active'
    });
    
    recordingHasStarted = true;
    awaitingSessionTitle = false;
    
    ctx.reply(
      `Recording started!\nSession: "${title}" (${currentSessionId})`,
      activeRecordingKeyboard
    );
  } catch (error) {
    console.error("Error starting session:", error);
    ctx.reply("Failed to start recording session. Please try again.", startRecordingKeyboard);
    recordingHasStarted = false;
    awaitingSessionTitle = false;
    currentSessionId = null;
  }
}

// Handle the button presses
bot.hears('🎙️ START RECORDING', (ctx) => {
  startRecording(ctx);
});

bot.hears('⏸️ PAUSE RECORDING', async (ctx) => {
  if (recordingHasStarted && !isPaused) {
    isPaused = true;
    
    // Update session status in database
    try {
      const session = await db.getSession(currentSessionId);
      if (session) {
        await db.saveSession({
          ...session,
          status: 'paused'
        });
      }
    } catch (error) {
      console.error("Error updating session status:", error);
    }
    
    ctx.reply(`Recording paused. Session is on hold. Press resume to continue recording in this session.`, pausedRecordingKeyboard);
  }
});

bot.hears('▶️ RESUME RECORDING', async (ctx) => {
  if (recordingHasStarted && isPaused) {
    isPaused = false;
    
    // Update session status in database
    try {
      const session = await db.getSession(currentSessionId);
      if (session) {
        await db.saveSession({
          ...session,
          status: 'active'
        });
      }
    } catch (error) {
      console.error("Error updating session status:", error);
    }
    
    ctx.reply(`Recording resumed. Continuing session.`, activeRecordingKeyboard);
  }
});

bot.hears('⏹️ STOP RECORDING', async (ctx) => {
  if (recordingHasStarted) {
    // Recupera l'ID sessione corrente prima di reimpostarlo
    const lastSessionId = currentSessionId;
    
    // Aggiorna lo stato della sessione nel database
    try {
      if (lastSessionId) {
        console.log(`Stopping recording for session: ${lastSessionId}`);
        
        // Prima verifica la sessione attuale
        const currentSession = await db.getSession(lastSessionId);
        console.log(`Current session before stop: ${JSON.stringify(currentSession)}`);
        
        // Forza lo stato a 'completed'
        const updateResult = await db.saveSession({
          session_id: lastSessionId,
          status: 'completed'
        });
        
        console.log(`Session updated with result: ${JSON.stringify(updateResult)}`);
        
        // Verifica che lo stato sia stato effettivamente aggiornato
        const updatedSession = await db.getSession(lastSessionId);
        console.log(`Session after update: ${JSON.stringify(updatedSession)}`);
        
        // Se la sessione ancora non è marcata come completata, prova ad aggiornare direttamente
        if (updatedSession && updatedSession.status !== 'completed') {
          console.log(`Forcing direct update for session ${lastSessionId}`);
          await db.run(
            "UPDATE Sessions SET status = 'completed' WHERE session_id = ?", 
            [lastSessionId]
          );
        }
        
        ctx.reply(`Recording stopped. Session completed successfully. Press the button to start a new session.`, startRecordingKeyboard);
      } else {
        ctx.reply(`Recording stopped. No active session was found. Press the button to start a new session.`, startRecordingKeyboard);
      }
    } catch (error) {
      console.error("Error updating session status on stop:", error);
      ctx.reply(`Recording stopped. Note: There was an error updating the session status. Press the button to start a new session.`, startRecordingKeyboard);
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
          status: 'paused'
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
    
    // Update session status in database
    try {
      const session = await db.getSession(currentSessionId);
      if (session) {
        await db.saveSession({
          ...session,
          status: 'active'
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

// Correzione per il gestore di bot.command("stop")
bot.command("stop", async (ctx) => {
  if (recordingHasStarted) {
    // Recupera l'ID sessione corrente prima di reimpostarlo
    const lastSessionId = currentSessionId;
    
    // Aggiorna lo stato della sessione nel database
    try {
      if (lastSessionId) {
        console.log(`Stopping recording via command for session: ${lastSessionId}`);
        
        // Prima verifica la sessione attuale
        const currentSession = await db.getSession(lastSessionId);
        console.log(`Current session before stop: ${JSON.stringify(currentSession)}`);
        
        // Forza lo stato a 'completed'
        const updateResult = await db.saveSession({
          session_id: lastSessionId,
          status: 'completed'
        });
        
        console.log(`Session updated with result: ${JSON.stringify(updateResult)}`);
        
        // Verifica che lo stato sia stato effettivamente aggiornato
        const updatedSession = await db.getSession(lastSessionId);
        console.log(`Session after update: ${JSON.stringify(updatedSession)}`);
        
        // Se la sessione ancora non è marcata come completata, prova ad aggiornare direttamente
        if (updatedSession && updatedSession.status !== 'completed') {
          console.log(`Forcing direct update for session ${lastSessionId}`);
          await db.run(
            "UPDATE Sessions SET status = 'completed' WHERE session_id = ?", 
            [lastSessionId]
          );
        }
        
        ctx.reply(`Recording stopped. Session completed successfully.`, startRecordingKeyboard);
      } else {
        ctx.reply(`Recording stopped. No active session was found.`, startRecordingKeyboard);
      }
    } catch (error) {
      console.error("Error updating session status on stop command:", error);
      ctx.reply(`Recording stopped. Note: There was an error updating the session status.`, startRecordingKeyboard);
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

// Handle text messages
bot.on(message("text"), async (ctx) => {
  // Check if we're waiting for a session title
  if (awaitingSessionTitle) {
    const title = ctx.message.text.trim();
    
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
  if ([
    '🎙️ START RECORDING', 
    '⏸️ PAUSE RECORDING', 
    '▶️ RESUME RECORDING', 
    '⏹️ STOP RECORDING'
  ].includes(ctx.message.text)) {
    return;
  }
  
  if (recordingHasStarted && !isPaused && currentSessionId) {
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
      console.log("Message saved:", msgToSave);
      
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
      console.error("Error processing message:", error);
    }
  } else if (recordingHasStarted && isPaused) {
    ctx.reply("Recording is currently paused. Press the resume button to continue recording.", pausedRecordingKeyboard);
  } else if (!awaitingSessionTitle) {
    ctx.reply("Recording is not started. Use the button to start recording.", startRecordingKeyboard);
  }
});

bot.launch().then(() => {
  console.log('Telegram bot started successfully');
}).catch(err => {
  console.error('Failed to start  bot:', err);
});

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

// Register handlebars helpers
handlebars.registerHelper('formatDate', function(dateString) {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleString();
});

handlebars.registerHelper('toLowerCase', function(str) {
  return str ? str.toLowerCase() : '';
});

handlebars.registerHelper('truncateText', function(text, length) {
  if (!text) return "";
  length = parseInt(length) || 30;
  if (text.length <= length) return text;
  return text.substring(0, length) + "...";
});

handlebars.registerHelper('eq', function(a, b) {
  return a === b;
});

handlebars.registerHelper('statusIcon', function(status) {
  if (!status) return 'fa-circle-question';
  
  switch(status.toLowerCase()) {
    case 'active':
      return 'fa-circle-play';
    case 'paused':
      return 'fa-circle-pause';
    case 'completed':
      return 'fa-circle-check';
    default:
      return 'fa-circle-question';
  }
});

handlebars.registerHelper('groupByUser', function(messages, options) {
  if (!messages || !messages.length) return options.inverse(this);
  
  // Sort messages by date
  messages.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const groups = [];
  let currentGroup = [];
  let currentUser = null;
  
  messages.forEach(message => {
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
  
  let result = '';
  groups.forEach(group => {
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
    handlebars: handlebars
  },
  templates: path.join(__dirname, 'src/views')
});
fastify.register(require("@fastify/cors")); // Enable CORS for frontend

// Serve the index page
fastify.get("/", async (request, reply) => {
  return reply.sendFile("index.html");
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
      messages
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
      ...result
    });
  } catch (err) {
    console.error("Error while checking sessions:", err);
    return reply.status(500).send({
      success: false,
      error: "Error while checking sessions",
      details: err.message
    });
  }
});

// Endpoint per aggiornare manualmente lo stato di una sessione specifica
fastify.put("/session/:id/status", async (request, reply) => {
  try {
    const sessionId = request.params.id;
    const { status } = request.body;
    
    // Validare lo stato
    if (!status || !['active', 'paused', 'completed'].includes(status)) {
      return reply.status(400).send({
        success: false,
        error: "Invalid status. Must be one of: active, paused, completed"
      });
    }
    
    // Ottenere la sessione esistente
    const session = await db.getSession(sessionId);
    
    if (!session) {
      return reply.status(404).send({
        success: false,
        error: "Session not found"
      });
    }
    
    // Aggiornare lo stato
    await db.saveSession({
      ...session,
      status: status
    });
    
    return reply.send({
      success: true,
      message: `Session ${sessionId} status updated to ${status}`,
      session_id: sessionId,
      status: status
    });
  } catch (err) {
    console.error("Error updating session status:", err);
    return reply.status(500).send({
      success: false,
      error: "Error updating session status",
      details: err.message
    });
  }
});


// Aggiungi questo endpoint al server.js per correggere manualmente lo stato delle sessioni

// Endpoint per correggere manualmente lo stato di una sessione specifica
fastify.post("/api/fix-session/:id", async (request, reply) => {
  try {
    const sessionId = request.params.id;
    const { status } = request.body;
    
    if (!sessionId) {
      return reply.status(400).send({
        success: false,
        error: "Session ID is required"
      });
    }
    
    // Validare lo stato
    if (!status || !['active', 'paused', 'completed'].includes(status)) {
      return reply.status(400).send({
        success: false,
        error: "Invalid status. Must be one of: active, paused, completed"
      });
    }
    
    // Usa la funzione di correzione forzata
    const result = await db.forceUpdateSessionStatus(sessionId, status);
    
    if (result) {
      return reply.send({
        success: true,
        message: `Session ${sessionId} status successfully updated to ${status}`,
        session_id: sessionId,
        status: status
      });
    } else {
      return reply.status(500).send({
        success: false,
        error: `Failed to update session ${sessionId} status`
      });
    }
  } catch (err) {
    console.error("Error handling manual fix request:", err);
    return reply.status(500).send({
      success: false,
      error: "Error updating session status",
      details: err.message
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
        error: "No sessions found"
      });
    }
    
    // Conta le sessioni aggiornate
    let updatedCount = 0;
    
    // Controlla ogni sessione
    for (const session of sessions) {
      // Se lo stato è nullo o undefined, imposta "completed"
      if (!session.status) {
        const result = await db.forceUpdateSessionStatus(session.session_id, 'completed');
        if (result) updatedCount++;
      }
      // Se lo stato è "active" ma la sessione è vecchia, imposta "completed"
      else if (session.status === 'active') {
        const lastMsg = await db.get(
          "SELECT date FROM Messages WHERE session_id = ? ORDER BY date DESC LIMIT 1",
          [session.session_id]
        );
        
        const lastMsgTime = lastMsg ? new Date(lastMsg.date).getTime() : 0;
        const creationTime = new Date(session.created_at).getTime();
        const oneHourAgo = Date.now() - (1 * 60 * 60 * 1000);
        
        // Se l'ultimo messaggio o la creazione è più vecchia di 1 ora, marca come completata
        if ((lastMsgTime && lastMsgTime < oneHourAgo) || 
            (!lastMsgTime && creationTime < oneHourAgo)) {
          const result = await db.forceUpdateSessionStatus(session.session_id, 'completed');
          if (result) updatedCount++;
        }
      }
    }
    
    return reply.send({
      success: true,
      message: `Checked ${sessions.length} sessions, updated ${updatedCount} to completed status`,
      total: sessions.length,
      updated: updatedCount
    });
  } catch (err) {
    console.error("Error handling fix-all-sessions request:", err);
    return reply.status(500).send({
      success: false,
      error: "Error updating sessions",
      details: err.message
    });
  }
});

let sessionCheckInterval;


// Avvia il server con una migliore inizializzazione
const start = async () => {
  try {
    // Verifica che il database sia inizializzato correttamente
    if (typeof db.verifyAndRepairDatabase === 'function') {
      await db.verifyAndRepairDatabase();
    }
    
    // Esegui un controllo iniziale delle sessioni
    if (typeof db.checkAndFixSessionStatuses === 'function') {
      console.log("Running initial session status check...");
      try {
        const result = await db.checkAndFixSessionStatuses();
        console.log(`Initial session status check: checked ${result.checked}, updated ${result.updated}`);
      } catch (err) {
        console.error("Error in initial session status check:", err);
      }
    }
    
    // Avvia il server
    await fastify.listen({ port: process.env.PORT || 3000, host: "0.0.0.0" });
    console.log(`Server listening on ${fastify.server.address().port}`);
    
    // Imposta il controllo periodico delle sessioni
    const sessionCheckInterval = setInterval(async () => {
      try {
        if (typeof db.checkAndFixSessionStatuses === 'function') {
          const result = await db.checkAndFixSessionStatuses();
          console.log(`Periodic session check: checked ${result.checked}, updated ${result.updated}`);
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
      bot.stop("SIGINT");
    });
    
    process.once("SIGTERM", () => {
      console.log("Received SIGTERM, stopping server...");
      clearInterval(sessionCheckInterval);
      fastify.close();
      bot.stop("SIGTERM");
    });
    
  } catch (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
};

// Esegui il server
start();