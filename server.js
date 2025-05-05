const fs = require("fs");
const path = require("path");
const { Telegraf, Markup } = require("telegraf");
const { message } = require("telegraf/filters");
const fastify = require("fastify")({ logger: false });
// Import the database functions
const db = require("./src/messagesDb"); // Adjust path as necessary
// Telegram Bot Setup
let recordingHasStarted = false;
let isPaused = false;
let currentSessionId = null; // Track the current recording session

const bot = new Telegraf(process.env.BOT_TOKEN || "YOUR_BOT_TOKEN");

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

// Handle the button presses
bot.hears('🎙️ START RECORDING', (ctx) => {
  recordingHasStarted = true;
  isPaused = false;
  currentSessionId = generateSessionId();
  ctx.reply(`Recording started! New session: ${currentSessionId}`, activeRecordingKeyboard);
});

bot.hears('⏸️ PAUSE RECORDING', (ctx) => {
  if (recordingHasStarted && !isPaused) {
    isPaused = true;
    ctx.reply(`Recording paused. Session ${currentSessionId} is on hold. Press resume to continue recording in this session.`, pausedRecordingKeyboard);
  }
});

bot.hears('▶️ RESUME RECORDING', (ctx) => {
  if (recordingHasStarted && isPaused) {
    isPaused = false;
    ctx.reply(`Recording resumed. Continuing session: ${currentSessionId}`, activeRecordingKeyboard);
  }
});

bot.hears('⏹️ STOP RECORDING', (ctx) => {
  if (recordingHasStarted) {
    recordingHasStarted = false;
    isPaused = false;
    const lastSessionId = currentSessionId;
    currentSessionId = null;
    ctx.reply(`Recording stopped. Session ${lastSessionId} completed. Press the button to start a new session.`, startRecordingKeyboard);
  }
});

// Keep the /record and /stop commands as alternative ways to control recording
bot.command("record", (ctx) => {
  recordingHasStarted = true;
  isPaused = false;
  currentSessionId = generateSessionId();
  ctx.reply(`Recording started! New session: ${currentSessionId}`, activeRecordingKeyboard);
});

bot.command("pause", (ctx) => {
  if (recordingHasStarted && !isPaused) {
    isPaused = true;
    ctx.reply(`Recording paused. Session ${currentSessionId} is on hold.`, pausedRecordingKeyboard);
  } else {
    ctx.reply("No active recording to pause.", startRecordingKeyboard);
  }
});

bot.command("resume", (ctx) => {
  if (recordingHasStarted && isPaused) {
    isPaused = false;
    ctx.reply(`Recording resumed. Continuing session: ${currentSessionId}`, activeRecordingKeyboard);
  } else {
    ctx.reply("No paused recording to resume.", startRecordingKeyboard);
  }
});

bot.command("stop", (ctx) => {
  if (recordingHasStarted) {
    recordingHasStarted = false;
    isPaused = false;
    const lastSessionId = currentSessionId;
    currentSessionId = null;
    ctx.reply(`Recording stopped. Session ${lastSessionId} completed.`, startRecordingKeyboard);
  } else {
    ctx.reply("No active recording to stop.", startRecordingKeyboard);
  }
});

// Handle text messages
bot.on(message("text"), async (ctx) => {
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
    const msgToSave = {
      chat_id: ctx.chat.id.toString(),
      session_id: currentSessionId,
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
  } else if (recordingHasStarted && isPaused) {
    ctx.reply("Recording is currently paused. Press the resume button to continue recording.", pausedRecordingKeyboard);
  } else {
    ctx.reply("Recording is not started. Use the button to start recording.", startRecordingKeyboard);
  }
});

bot.launch();
// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
// Fastify server setup
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/",
});
fastify.register(require("@fastify/formbody"));
fastify.register(require("@fastify/view"), {
  engine: { handlebars: require("handlebars") },
});
fastify.get("/", async (request, reply) => {
  return reply.sendFile("index.html"); // Serve the index.html file
});
// Get unique session IDs instead of just chat IDs
fastify.get("/sessions", async (request, reply) => {
  try {
    const sessions = await db.getUniqueSessions();
    return reply.send(sessions); // Return the list of session IDs as JSON
  } catch (err) {
    console.error(err);
    return reply.status(500).send("Error retrieving session IDs.");
  }
});
// Keep the original chat_ids endpoint for backward compatibility
fastify.get("/chat_ids", async (request, reply) => {
  try {
    const chatIds = await db.getUniqueChatIds();
    return reply.send(chatIds); // Return the list of chat IDs as JSON
  } catch (err) {
    console.error(err);
    return reply.status(500).send("Error retrieving chat IDs.");
  }
});
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
// Fastify server start
fastify.listen(
  { port: process.env.PORT || 3000, host: "0.0.0.0" },
  (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Server listening at ${address}`);
  }
);