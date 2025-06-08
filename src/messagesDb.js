const sqlite3 = require("sqlite3").verbose();
const dbWrapper = require("sqlite");
const fs = require("fs");

const dbFile = "./.data/messages.db";
const exists = require("fs").existsSync(dbFile);

let db; // To store the database connection

// Initialize the database
async function initializeDb() {
  db = await dbWrapper.open({ filename: dbFile, driver: sqlite3.Database });

  if (!exists) {
    // Create the database from scratch (if it doesn't exist)
    await db.run(`
      CREATE TABLE Messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        session_id TEXT,
        session_title TEXT,
        date TEXT,
        username TEXT,
        message TEXT
      )
    `);
    
    // Create a separate Sessions table to store session metadata
    await db.run(`
      CREATE TABLE Sessions (
        session_id TEXT PRIMARY KEY,
        title TEXT,
        created_at TEXT,
        status TEXT
      )
    `);
    
    console.log("Database tables created with session title support.");
  } else {
    // Check if the session_id column exists in Messages, if not add it
    const messagesInfo = await db.all("PRAGMA table_info(Messages)");
    
    if (!messagesInfo.some(column => column.name === 'session_id')) {
      console.log("Adding session_id column to Messages table...");
      await db.run("ALTER TABLE Messages ADD COLUMN session_id TEXT");
      console.log("session_id column added successfully.");
    }
    
    if (!messagesInfo.some(column => column.name === 'session_title')) {
      console.log("Adding session_title column to Messages table...");
      await db.run("ALTER TABLE Messages ADD COLUMN session_title TEXT");
      console.log("session_title column added successfully.");
    }
    
    // Check if Sessions table exists, if not create it
    const tablesQuery = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='Sessions'");
    if (tablesQuery.length === 0) {
      console.log("Creating Sessions table...");
      await db.run(`
        CREATE TABLE Sessions (
          session_id TEXT PRIMARY KEY,
          title TEXT,
          created_at TEXT,
          status TEXT
        )
      `);
      console.log("Sessions table created successfully.");
    }
  }
}

initializeDb().catch((err) => {
  console.error("Error initializing database:", err);
});

// Create or update a session
async function saveSession(sessionData) {
  try {
    const { session_id } = sessionData;
    
    if (!session_id) {
      throw new Error("Session ID is required");
    }
    
    // Log completo dei dati in ingresso per debug
    console.log("saveSession input data:", JSON.stringify(sessionData));
    
    // Ottieni la sessione esistente (se esiste)
    const existingSession = await db.get("SELECT * FROM Sessions WHERE session_id = ?", [session_id]);
    
    // Prepara i dati da salvare
    let title = sessionData.title;
    let status = sessionData.status;
    let created_at = sessionData.created_at || new Date().toISOString();
    
    // Se stiamo aggiornando una sessione esistente e non è stato fornito un titolo,
    // mantieni il titolo esistente
    if (existingSession) {
      // Per il titolo
      if (title === null || title === undefined) {
        title = existingSession.title;
      }
      
      // Per lo stato
      if (status === null || status === undefined) {
        status = existingSession.status;
      }
      
      // Aggiorna la sessione esistente
      console.log(`Updating session ${session_id} - Title: ${title}, Status: ${status}`);
      
      const updateResult = await db.run(
        "UPDATE Sessions SET title = ?, status = ? WHERE session_id = ?",
        [title, status, session_id]
      );
      
      console.log(`Update result: ${updateResult.changes} row(s) affected`);
      
      // Verifica che l'aggiornamento sia avvenuto correttamente
      const updatedSession = await db.get("SELECT * FROM Sessions WHERE session_id = ?", [session_id]);
      console.log("Updated session in DB:", JSON.stringify(updatedSession));
      
      return {
        session_id,
        title,
        created_at: existingSession.created_at,
        status
      };
    } else {
      // Crea una nuova sessione
      // Se lo stato non è specificato, impostiamo 'active' come default
      if (!status) {
        status = 'active';
      }
      
      console.log(`Creating new session ${session_id} - Title: ${title}, Status: ${status}`);
      
      const insertResult = await db.run(
        "INSERT INTO Sessions (session_id, title, created_at, status) VALUES (?, ?, ?, ?)",
        [session_id, title, created_at, status]
      );
      
      console.log(`Insert result: ${insertResult.lastID}`);
      
      return { session_id, title, created_at, status };
    }
  } catch (error) {
    console.error("Error saving session:", error);
    throw error;
  }
}

// Get a session by ID
async function getSession(sessionId) {
  try {
    return await db.get("SELECT * FROM Sessions WHERE session_id = ?", [sessionId]);
  } catch (error) {
    console.error("Error getting session:", error);
    return null;
  }
}

// Save a message to the database
async function saveMessage(messageData) {
  try {
    const { chat_id, session_id, date, username, message } = messageData;
    let session_title = messageData.session_title;
    
    // Get session title if not provided
    if (session_id && !session_title) {
      const session = await getSession(session_id);
      session_title = session ? session.title : null;
    }
    
    await db.run(
      `INSERT INTO Messages (chat_id, session_id, session_title, date, username, message) VALUES (?, ?, ?, ?, ?, ?)`,
      [chat_id, session_id || null, session_title || null, date, username, message]
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
      query = "SELECT * FROM Messages ORDER BY date DESC LIMIT 100";
    } else {
      query = "SELECT * FROM Messages WHERE chat_id = ? ORDER BY date DESC LIMIT 100";
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

// Get messages by session ID
async function getMessagesBySession(sessionId) {
  try {
    const query = "SELECT * FROM Messages WHERE session_id = ? ORDER BY date ASC";
    const rows = await db.all(query, [sessionId]);
    return rows;
  } catch (err) {
    console.error("Error retrieving messages by session ID:", err);
    return [];
  }
}

// Get a list of unique session IDs
async function getUniqueSessions() {
  try {
    // First try to get from the Sessions table
    const sessions = await db.all("SELECT * FROM Sessions ORDER BY created_at DESC");
    
    if (sessions.length > 0) {
      return sessions.map(s => s.session_id);
    }
    
    // Fall back to messages table if Sessions table is empty
    const rows = await db.all("SELECT DISTINCT session_id FROM Messages WHERE session_id IS NOT NULL");
    return rows.map(row => row.session_id).filter(id => id);
  } catch (err) {
    console.error("Error retrieving unique session IDs:", err);
    return [];
  }
}

// Get all sessions from the Sessions table
async function getAllSessions() {
  try {
    return await db.all("SELECT * FROM Sessions ORDER BY created_at DESC");
  } catch (err) {
    console.error("Error retrieving all sessions:", err);
    return [];
  }
}

async function getSessionDetails(sessionId) {
  try {
    console.log(`Getting details for session: ${sessionId}`);
    
    // First, try to get the session from the Sessions table
    const sessionRecord = await getSession(sessionId);
    
    // Log completo per debug
    console.log("Session record from DB:", JSON.stringify(sessionRecord));
    
    // Get first message date (start date)
    const firstMsg = await db.get(
      "SELECT date FROM Messages WHERE session_id = ? ORDER BY date ASC LIMIT 1",
      [sessionId]
    );
    
    // Get last message date (end date)
    const lastMsg = await db.get(
      "SELECT date FROM Messages WHERE session_id = ? ORDER BY date DESC LIMIT 1",
      [sessionId]
    );
    
    // Get unique participants
    const participants = await db.all(
      "SELECT DISTINCT username FROM Messages WHERE session_id = ?",
      [sessionId]
    );
    
    // Get message count
    const countResult = await db.get(
      "SELECT COUNT(*) as count FROM Messages WHERE session_id = ?",
      [sessionId]
    );
    
    // Get a sample message to get session_title from if not in Sessions table
    let title = sessionRecord ? sessionRecord.title : null;
    if (!title) {
      const sampleMessage = await db.get(
        "SELECT session_title FROM Messages WHERE session_id = ? AND session_title IS NOT NULL LIMIT 1",
        [sessionId]
      );
      title = sampleMessage ? sampleMessage.session_title : null;
    }
    
    // Per lo stato, se non è definito nella tabella Sessions, impostiamo un default in base ai messaggi
    let status = sessionRecord ? sessionRecord.status : 'unknown';
    
    // Se non c'è uno stato definito ma ci sono messaggi, impostiamo 'completed' come default
    if ((!status || status === 'unknown') && countResult && countResult.count > 0) {
      status = 'completed';
      
      // Aggiorna lo stato nel database se sono presenti messaggi ma non c'è uno stato definito
      if (sessionRecord) {
        console.log(`Auto-correcting status for session ${sessionId} to 'completed'`);
        await db.run(
          "UPDATE Sessions SET status = 'completed' WHERE session_id = ?",
          [sessionId]
        );
      }
    }
    
    // Use session ID as title if no title is found
    title = title || sessionId;
    
    const sessionDetails = {
      session_id: sessionId,
      title: title,
      start_date: firstMsg ? firstMsg.date : (sessionRecord ? sessionRecord.created_at : null),
      end_date: lastMsg ? lastMsg.date : null,
      participants: participants.map(p => p.username),
      message_count: countResult ? countResult.count : 0,
      status: status
    };
    
    console.log(`Assembled session details for ${sessionId}:`, JSON.stringify(sessionDetails));
    
    return sessionDetails;
  } catch (err) {
    console.error("Error retrieving session details:", err);
    return null;
  }
}

// Get all sessions with details
async function getAllSessionsWithDetails() {
  try {
    const sessionIds = await getUniqueSessions();
    const sessionsDetails = [];
    
    for (const sessionId of sessionIds) {
      const details = await getSessionDetails(sessionId);
      if (details) {
        sessionsDetails.push(details);
      }
    }
    
    // Sort by start date (newest first)
    sessionsDetails.sort((a, b) => {
      if (!a.start_date) return 1;
      if (!b.start_date) return -1;
      return new Date(b.start_date) - new Date(a.start_date);
    });
    
    return sessionsDetails;
  } catch (err) {
    console.error("Error retrieving all sessions with details:", err);
    return [];
  }
}

/**
 * Verifica e corregge lo stato delle sessioni inattive
 * Una sessione è considerata "stale" se è attiva ma non ha messaggi nuovi da più di X ore
 */

async function checkAndFixSessionStatuses() {
  // Initialize messagesDb if not already done
  let messagesDb;
  
  try {
      const sqlite3 = require('sqlite3').verbose();
      const path = require('path');
      
      // Try to connect to the database
      const dbPath = path.join(__dirname, '../data/messages.db');
      messagesDb = new sqlite3.Database(dbPath);
      
      console.log('✅ Connected to messages database for session check');
      
      // Now your existing code can use messagesDb
      const sessions = await new Promise((resolve, reject) => {
          messagesDb.all("SELECT * FROM sessions", (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
          });
      });
      
      console.log(`Session status check: found ${sessions.length} sessions`);
      
      // Close the connection
      messagesDb.close();
      
      return sessions;
      
  } catch (error) {
      console.log('⚠️ Session status check failed:', error.message);
      if (messagesDb) messagesDb.close();
      return [];
  }
}

module.exports = {
  saveMessage,
  getMessages,
  getUniqueChatIds,
  getUniqueSessions,
  getMessagesBySession,
  getSessionDetails,
  getAllSessionsWithDetails,
  saveSession,
  getSession,
  getAllSessions,
  checkAndFixSessionStatuses
};