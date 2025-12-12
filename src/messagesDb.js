const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");

const dbFile = "./.data/messages.db";
const exists = require("fs").existsSync(dbFile);

let db; // To store the database connection

// Initialize the database
async function initializeDb() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbFile, (err) => {
      if (err) {
        console.error("Error opening database:", err);
        reject(err);
        return;
      }
      
      console.log("Database connection established");
      
      if (!exists) {
        // Create the database from scratch (if it doesn't exist)
        db.serialize(() => {
          db.run(`
            CREATE TABLE Messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              chat_id TEXT,
              session_id TEXT,
              session_title TEXT,
              date TEXT,
              username TEXT,
              message TEXT
            )
          `, (err) => {
            if (err) console.error("Error creating Messages table:", err);
            else console.log("Messages table created");
          });
          
          // Create a separate Sessions table to store session metadata
          db.run(`
            CREATE TABLE Sessions (
              session_id TEXT PRIMARY KEY,
              title TEXT,
              created_at TEXT,
              status TEXT
            )
          `, (err) => {
            if (err) console.error("Error creating Sessions table:", err);
            else console.log("Sessions table created");
          });
        });
        
        console.log("Database tables created with session title support.");
        resolve();
      } else {
        // Check if the session_id column exists in Messages, if not add it
        db.all("PRAGMA table_info(Messages)", (err, messagesInfo) => {
          if (err) {
            reject(err);
            return;
          }
          
          const hasSessionId = messagesInfo.some(column => column.name === 'session_id');
          const hasSessionTitle = messagesInfo.some(column => column.name === 'session_title');
          
          if (!hasSessionId) {
            console.log("Adding session_id column to Messages table...");
            db.run("ALTER TABLE Messages ADD COLUMN session_id TEXT", (err) => {
              if (err) console.error("Error adding session_id column:", err);
              else console.log("session_id column added successfully.");
            });
          }
          
          if (!hasSessionTitle) {
            console.log("Adding session_title column to Messages table...");
            db.run("ALTER TABLE Messages ADD COLUMN session_title TEXT", (err) => {
              if (err) console.error("Error adding session_title column:", err);
              else console.log("session_title column added successfully.");
            });
          }
          
          // Check if Sessions table exists, if not create it
          db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='Sessions'", (err, tablesQuery) => {
            if (err) {
              reject(err);
              return;
            }
            
            if (tablesQuery.length === 0) {
              console.log("Creating Sessions table...");
              db.run(`
                CREATE TABLE Sessions (
                  session_id TEXT PRIMARY KEY,
                  title TEXT,
                  created_at TEXT,
                  status TEXT,
                  author TEXT
                )
              `, (err) => {
                if (err) console.error("Error creating Sessions table:", err);
                else console.log("Sessions table created successfully.");
                resolve();
              });
            } else {
              // Check if author column exists in Sessions table
              db.all("PRAGMA table_info(Sessions)", (err, sessionsInfo) => {
                if (err) {
                  resolve();
                  return;
                }
                
                const hasAuthor = sessionsInfo.some(column => column.name === 'author');
                const hasAuthorDisplay = sessionsInfo.some(column => column.name === 'author_display');
                const hasAuthorIsGuest = sessionsInfo.some(column => column.name === 'author_is_guest');
                const hasAuthorIsHost = sessionsInfo.some(column => column.name === 'author_is_host');
                
                const migrations = [];
                
                if (!hasAuthor) {
                  migrations.push(new Promise((res, rej) => {
                    console.log("Adding author column to Sessions table...");
                    db.run("ALTER TABLE Sessions ADD COLUMN author TEXT", (err) => {
                      if (err) {
                        console.error("Error adding author column:", err);
                        rej(err);
                      } else {
                        console.log("author column added successfully.");
                        res();
                      }
                    });
                  }));
                }
                
                if (!hasAuthorDisplay) {
                  migrations.push(new Promise((res, rej) => {
                    console.log("Adding author_display column to Sessions table...");
                    db.run("ALTER TABLE Sessions ADD COLUMN author_display TEXT", (err) => {
                      if (err) {
                        console.error("Error adding author_display column:", err);
                        rej(err);
                      } else {
                        console.log("author_display column added successfully.");
                        res();
                      }
                    });
                  }));
                }
                
                if (!hasAuthorIsGuest) {
                  migrations.push(new Promise((res, rej) => {
                    console.log("Adding author_is_guest column to Sessions table...");
                    db.run("ALTER TABLE Sessions ADD COLUMN author_is_guest INTEGER DEFAULT 0", (err) => {
                      if (err) {
                        console.error("Error adding author_is_guest column:", err);
                        rej(err);
                      } else {
                        console.log("author_is_guest column added successfully.");
                        res();
                      }
                    });
                  }));
                }
                
                if (!hasAuthorIsHost) {
                  migrations.push(new Promise((res, rej) => {
                    console.log("Adding author_is_host column to Sessions table...");
                    db.run("ALTER TABLE Sessions ADD COLUMN author_is_host INTEGER DEFAULT 0", (err) => {
                      if (err) {
                        console.error("Error adding author_is_host column:", err);
                        rej(err);
                      } else {
                        console.log("author_is_host column added successfully.");
                        res();
                      }
                    });
                  }));
                }
                
                if (migrations.length > 0) {
                  Promise.all(migrations).then(() => resolve()).catch(() => resolve());
                } else {
                  resolve();
                }
              });
            }
          });
        });
      }
    });
  });
}

// Create useful indexes if not present
function createIndexes() {
  try {
    db.run("CREATE INDEX IF NOT EXISTS idx_messages_username ON Messages(username)");
    db.run("CREATE INDEX IF NOT EXISTS idx_messages_session_id ON Messages(session_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_sessions_author ON Sessions(author)");
    db.run("CREATE INDEX IF NOT EXISTS idx_sessions_status ON Sessions(status)");
    console.log('Database indexes ensured');
  } catch (err) {
    console.error('Error creating indexes:', err);
  }
}

// Ensure indexes after DB init
setTimeout(() => {
  try {
    if (db) createIndexes();
  } catch (e) { /* ignore */ }
}, 1000);

// Initialize database on module load
initializeDb().catch((err) => {
  console.error("Error initializing database:", err);
});

// Create or update a session
async function saveSession(sessionData) {
  return new Promise((resolve, reject) => {
    try {
      const { session_id } = sessionData;
      
      if (!session_id) {
        reject(new Error("Session ID is required"));
        return;
      }
      
      console.log("saveSession input data:", JSON.stringify(sessionData));
      
      // Get existing session first
      db.get("SELECT * FROM Sessions WHERE session_id = ?", [session_id], (err, existingSession) => {
        if (err) {
          reject(err);
          return;
        }
        
        let title = sessionData.title;
        let status = sessionData.status;
        let author = sessionData.author;
        let created_at = sessionData.created_at || new Date().toISOString();
        
        if (existingSession) {
          // Update existing session
          if (title === null || title === undefined) {
            title = existingSession.title;
          }
          
          if (status === null || status === undefined) {
            status = existingSession.status;
          }
          
          if (author === null || author === undefined) {
            author = existingSession.author;
          }
          
          console.log(`Updating session ${session_id} - Title: ${title}, Status: ${status}, Author: ${author}`);
          
          db.run(
            "UPDATE Sessions SET title = ?, status = ?, author = ? WHERE session_id = ?",
            [title, status, author, session_id],
            function(err) {
              if (err) {
                reject(err);
                return;
              }
              
              console.log(`Update result: ${this.changes} row(s) affected`);
              resolve({
                session_id,
                title,
                created_at: existingSession.created_at,
                status,
                author
              });
            }
          );
        } else {
          // Create new session
          if (!status) {
            status = 'active';
          }
          
          console.log(`Creating new session ${session_id} - Title: ${title}, Status: ${status}, Author: ${author}`);
          
          db.run(
            "INSERT INTO Sessions (session_id, title, created_at, status, author) VALUES (?, ?, ?, ?, ?)",
            [session_id, title, created_at, status, author],
            function(err) {
              if (err) {
                reject(err);
                return;
              }
              
              console.log(`Insert result: ${this.lastID}`);
              resolve({ session_id, title, created_at, status, author });
            }
          );
        }
      });
    } catch (error) {
      console.error("Error saving session:", error);
      reject(error);
    }
  });
}

// Get a session by ID
async function getSession(sessionId) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM Sessions WHERE session_id = ?", [sessionId], (err, row) => {
      if (err) {
        console.error("Error getting session:", err);
        resolve(null);
      } else {
        resolve(row);
      }
    });
  });
}

// Save a message to the database
async function saveMessage(messageData) {
  return new Promise((resolve, reject) => {
    try {
      const { chat_id, session_id, date, username, message } = messageData;
      let session_title = messageData.session_title;
      
      // Get session title if not provided
      if (session_id && !session_title) {
        getSession(session_id).then(session => {
          session_title = session ? session.title : null;
          
          db.run(
            `INSERT INTO Messages (chat_id, session_id, session_title, date, username, message) VALUES (?, ?, ?, ?, ?, ?)`,
            [chat_id, session_id || null, session_title || null, date, username, message],
            function(err) {
              if (err) {
                console.error("Error saving message:", err);
                reject(err);
              } else {
                resolve(this.lastID);
              }
            }
          );
        });
      } else {
        db.run(
          `INSERT INTO Messages (chat_id, session_id, session_title, date, username, message) VALUES (?, ?, ?, ?, ?, ?)`,
          [chat_id, session_id || null, session_title || null, date, username, message],
          function(err) {
            if (err) {
              console.error("Error saving message:", err);
              reject(err);
            } else {
              resolve(this.lastID);
            }
          }
        );
      }
    } catch (error) {
      console.error("Error saving message:", error);
      reject(error);
    }
  });
}

// Retrieve messages based on chat ID
async function getMessages(chatId = "all") {
  return new Promise((resolve, reject) => {
    try {
      let query;
      let params = [];

      if (chatId === "all") {
        query = "SELECT * FROM Messages ORDER BY date DESC LIMIT 100";
      } else {
        query = "SELECT * FROM Messages WHERE chat_id = ? ORDER BY date DESC LIMIT 100";
        params.push(chatId);
      }

      db.all(query, params, (err, rows) => {
        if (err) {
          console.error("Error retrieving messages:", err);
          resolve([]);
        } else {
          resolve(rows);
        }
      });
    } catch (err) {
      console.error("Error retrieving messages:", err);
      resolve([]);
    }
  });
}

// Get a list of unique chat IDs
async function getUniqueChatIds() {
  return new Promise((resolve, reject) => {
    db.all("SELECT DISTINCT chat_id FROM Messages", (err, rows) => {
      if (err) {
        console.error("Error retrieving unique chat IDs:", err);
        resolve([]);
      } else {
        resolve(rows.map(row => row.chat_id));
      }
    });
  });
}

// Get messages by session ID
async function getMessagesBySession(sessionId) {
  return new Promise((resolve, reject) => {
    const query = "SELECT * FROM Messages WHERE session_id = ? ORDER BY date ASC";
    db.all(query, [sessionId], (err, rows) => {
      if (err) {
        console.error("Error retrieving messages by session ID:", err);
        resolve([]);
      } else {
        resolve(rows);
      }
    });
  });
}

// Get a list of unique session IDs
async function getUniqueSessions() {
  return new Promise((resolve, reject) => {
    // First try to get from the Sessions table
    db.all("SELECT * FROM Sessions ORDER BY created_at DESC", (err, sessions) => {
      if (err) {
        console.error("Error retrieving unique session IDs:", err);
        resolve([]);
        return;
      }
      
      if (sessions.length > 0) {
        resolve(sessions.map(s => s.session_id));
      } else {
        // Fall back to messages table if Sessions table is empty
        db.all("SELECT DISTINCT session_id FROM Messages WHERE session_id IS NOT NULL", (err, rows) => {
          if (err) {
            console.error("Error retrieving unique session IDs from Messages:", err);
            resolve([]);
          } else {
            resolve(rows.map(row => row.session_id).filter(id => id));
          }
        });
      }
    });
  });
}

// Get all sessions from the Sessions table
async function getAllSessions() {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM Sessions ORDER BY created_at DESC", (err, rows) => {
      if (err) {
        console.error("Error retrieving all sessions:", err);
        resolve([]);
      } else {
        resolve(rows);
      }
    });
  });
}

async function getSessionDetails(sessionId) {
  try {
    console.log(`Getting details for session: ${sessionId}`);
    
    // Get the session from the Sessions table
    const sessionRecord = await getSession(sessionId);
    console.log("Session record from DB:", JSON.stringify(sessionRecord));
    
    // Get first and last message dates
    const firstMsg = await new Promise((resolve) => {
      db.get(
        "SELECT date FROM Messages WHERE session_id = ? ORDER BY date ASC LIMIT 1",
        [sessionId],
        (err, row) => resolve(err ? null : row)
      );
    });
    
    const lastMsg = await new Promise((resolve) => {
      db.get(
        "SELECT date FROM Messages WHERE session_id = ? ORDER BY date DESC LIMIT 1",
        [sessionId],
        (err, row) => resolve(err ? null : row)
      );
    });
    
    // Get unique participants
    const participants = await new Promise((resolve) => {
      db.all(
        "SELECT DISTINCT username FROM Messages WHERE session_id = ?",
        [sessionId],
        (err, rows) => resolve(err ? [] : rows)
      );
    });
    
    // Get message count
    const countResult = await new Promise((resolve) => {
      db.get(
        "SELECT COUNT(*) as count FROM Messages WHERE session_id = ?",
        [sessionId],
        (err, row) => resolve(err ? { count: 0 } : row)
      );
    });
    
    // Get title
    let title = sessionRecord ? sessionRecord.title : null;
    if (!title) {
      const sampleMessage = await new Promise((resolve) => {
        db.get(
          "SELECT session_title FROM Messages WHERE session_id = ? AND session_title IS NOT NULL LIMIT 1",
          [sessionId],
          (err, row) => resolve(err ? null : row)
        );
      });
      title = sampleMessage ? sampleMessage.session_title : null;
    }
    
    // Get status
    let status = sessionRecord ? sessionRecord.status : 'unknown';
    
    if ((!status || status === 'unknown') && countResult && countResult.count > 0) {
      status = 'completed';
      
      if (sessionRecord) {
        console.log(`Auto-correcting status for session ${sessionId} to 'completed'`);
        db.run(
          "UPDATE Sessions SET status = 'completed' WHERE session_id = ?",
          [sessionId]
        );
      }
    }
    
    title = title || sessionId;
    
    const sessionDetails = {
      session_id: sessionId,
      title: title,
      start_date: firstMsg ? firstMsg.date : (sessionRecord ? sessionRecord.created_at : null),
      end_date: lastMsg ? lastMsg.date : null,
      participants: participants.map(p => p.username),
      message_count: countResult ? countResult.count : 0,
      status: status,
      author: sessionRecord ? sessionRecord.author : null
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

async function checkAndFixSessionStatuses() {
  return new Promise((resolve, reject) => {
    if (!db) {
      console.log('⚠️ Database not initialized, skipping session check');
      resolve({ checked: 0, updated: 0 });
      return;
    }
    
    db.all("SELECT * FROM Sessions", (err, sessions) => {
      if (err) {
        console.error('⚠️ Session status check failed:', err.message);
        resolve({ checked: 0, updated: 0 });
        return;
      }
      
      console.log(`Session status check: found ${sessions.length} sessions`);
      resolve({ checked: sessions.length, updated: 0 });
    });
  });
}

// Update author metadata from Notion sync
async function updateSessionAuthorMetadata(sessionId, metadata) {
  return new Promise((resolve, reject) => {
    const { displayName, isGuest, isHost } = metadata;
    
    db.run(
      `UPDATE Sessions 
       SET author_display = ?, author_is_guest = ?, author_is_host = ? 
       WHERE session_id = ?`,
      [displayName || null, isGuest ? 1 : 0, isHost ? 1 : 0, sessionId],
      function(err) {
        if (err) {
          console.error(`Error updating author metadata for session ${sessionId}:`, err);
          reject(err);
          return;
        }
        resolve({ updated: this.changes });
      }
    );
  });
}

// Bulk update all sessions with Notion metadata
async function syncAllSessionsWithNotion(userMetadataMap) {
  return new Promise((resolve, reject) => {
    db.all("SELECT session_id, author FROM Sessions", [], async (err, sessions) => {
      if (err) {
        reject(err);
        return;
      }
      
      let updated = 0;
      let skipped = 0;
      
      for (const session of sessions) {
        if (!session.author) {
          skipped++;
          continue;
        }
        
        const metadata = userMetadataMap.get(session.author.toLowerCase());
        if (metadata) {
          try {
            await updateSessionAuthorMetadata(session.session_id, {
              displayName: metadata.override || metadata.originalName,
              isGuest: metadata.isGuest,
              isHost: metadata.isHost
            });
            updated++;
          } catch (err) {
            console.error(`Failed to update session ${session.session_id}:`, err);
          }
        } else {
          skipped++;
        }
      }
      
      console.log(`Notion sync complete: ${updated} sessions updated, ${skipped} skipped`);
      resolve({ updated, skipped, total: sessions.length });
    });
  });
}

// Reset database - clear all messages and sessions
function resetDatabase() {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }

    db.serialize(() => {
      const errors = [];
      const cleared = { messages: 0, sessions: 0 };

      // Clear all messages
      db.run("DELETE FROM Messages", function(err) {
        if (err) {
          errors.push(`Messages: ${err.message}`);
        } else {
          cleared.messages = this.changes;
          console.log(`✓ Cleared ${cleared.messages} messages`);
        }
      });

      // Clear all sessions
      db.run("DELETE FROM Sessions", function(err) {
        if (err) {
          errors.push(`Sessions: ${err.message}`);
        } else {
          cleared.sessions = this.changes;
          console.log(`✓ Cleared ${cleared.sessions} sessions`);
        }
      });

      // Reset auto-increment counters
      db.run("DELETE FROM sqlite_sequence WHERE name='Messages'", (err) => {
        if (err && !err.message.includes('no such table')) {
          errors.push(`Messages counter: ${err.message}`);
        } else {
          console.log('✓ Messages counter reset');
        }
      });

      db.run("DELETE FROM sqlite_sequence WHERE name='Sessions'", (err) => {
        if (err && !err.message.includes('no such table')) {
          errors.push(`Sessions counter: ${err.message}`);
        } else {
          console.log('✓ Sessions counter reset');
        }

        // This is the last operation, resolve here
        if (errors.length > 0) {
          reject({ errors, cleared, partial: true });
        } else {
          resolve(cleared);
        }
      });
    });
  });
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
  checkAndFixSessionStatuses,
  updateSessionAuthorMetadata,
  syncAllSessionsWithNotion,
  resetDatabase
};