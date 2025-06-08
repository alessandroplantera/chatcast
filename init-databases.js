const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('Starting database initialization...');

// Ensure directories exist
const directories = ['data', '.data', 'src'];
directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✓ Created ${dir} directory`);
    } else {
        console.log(`✓ ${dir} directory already exists`);
    }
});

// Initialize messages database
const messagesDbPath = path.join(__dirname, 'data', 'messages.db');
const messagesDb = new sqlite3.Database(messagesDbPath, (err) => {
    if (err) {
        console.error('❌ Error creating messages database:', err);
        return;
    }
    
    console.log('✓ Messages database created');
    
    messagesDb.serialize(() => {
        messagesDb.run(`CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        messagesDb.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            message_text TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    });
});

// Initialize choices database
const choicesDbPath = path.join(__dirname, 'data', 'choices.db');
const choicesDb = new sqlite3.Database(choicesDbPath, (err) => {
    if (err) {
        console.error('❌ Error creating choices database:', err);
        return;
    }
    
    console.log('✓ Choices database created');
    
    choicesDb.run(`CREATE TABLE IF NOT EXISTS choices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        choice TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

setTimeout(() => {
    messagesDb.close();
    choicesDb.close();
    console.log('🎉 Database initialization complete!');
}, 1000);
