const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directories exist
const dataDir = path.join(__dirname, 'data');
const dotDataDir = path.join(__dirname, '.data');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Created data directory');
}

if (!fs.existsSync(dotDataDir)) {
    fs.mkdirSync(dotDataDir, { recursive: true });
    console.log('Created .data directory');
}

// Initialize main database
const dbPath = path.join(dataDir, 'chatcast.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error creating main database:', err);
    } else {
        console.log('Main database initialized:', dbPath);
        
        // Create basic tables if they don't exist
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS choices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                choice TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            console.log('Basic tables created');
        });
    }
});

// Initialize messages database
const messagesDbPath = path.join(dataDir, 'messages.db');
const messagesDb = new sqlite3.Database(messagesDbPath, (err) => {
    if (err) {
        console.error('Error creating messages database:', err);
    } else {
        console.log('Messages database initialized:', messagesDbPath);
        
        messagesDb.serialize(() => {
            messagesDb.run(`CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                message_text TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            console.log('Messages table created');
        });
    }
});

// Close databases
setTimeout(() => {
    db.close();
    messagesDb.close();
    console.log('Database initialization complete');
}, 1000);
