const sqlite3 = require("sqlite3").verbose();
const dbWrapper = require("sqlite");

const dbFile = "./.data/messages.db";
const exists = require("fs").existsSync(dbFile);

let db; // To store the database connection

// Initialize the database
async function initializeDb() {
  db = await dbWrapper.open({ filename: dbFile, driver: sqlite3.Database });

  if (!exists) {
    await db.run(`
      CREATE TABLE Messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        session_id TEXT,
        date TEXT,
        username TEXT,
        message TEXT
      )
    `);
    console.log("Messages table created.");
  }
}

initializeDb().catch((err) => {
  console.error("Error initializing database:", err);
});

// Save a message to the database
async function saveMessage(messageData) {
  try {
    await db.run(
      `INSERT INTO Messages (chat_id, date, username, message) VALUES (?, ?, ?, ?)`,
      [messageData.chat_id, messageData.date, messageData.username, messageData.message]
    );
  } catch (error) {
    console.error("Error saving message:", error);
  }
}

// Retrieve messages based on chat ID
async function getMessages(chatId = "all") {
  try {
    let query;
    let params = [];

    if (chatId === "all") {
      query = "SELECT * FROM Messages ORDER BY date DESC";
    } else {
      query = "SELECT * FROM Messages WHERE chat_id = ? ORDER BY date DESC";
      params.push(chatId);
    }

    const rows = await db.all(query, params);
    return rows;
  } catch (err) {
    console.error("Error retrieving messages:", err);
    return [];
  }
}

// Get a list of unique chat IDs
async function getUniqueChatIds() {
  try {
    const rows = await db.all("SELECT DISTINCT chat_id FROM Messages");
    return rows.map(row => row.chat_id);
  } catch (err) {
    console.error("Error retrieving unique chat IDs:", err);
    return [];
  }
}

// Get a list of unique chat IDs
async function getUniqueSession_id() {
  try {
    const rows = await db.all("SELECT DISTINCT session_id FROM Messages");
    return rows.map(row => row.session_id);
  } catch (err) {
    console.error("Error retrieving unique chat IDs:", err);
    return [];
  }
}

module.exports = {
  saveMessage,
  getMessages,
  getUniqueChatIds,
  getUniqueSession_id,

};
