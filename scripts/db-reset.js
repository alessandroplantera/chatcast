// scripts/db-reset.js - Simple reset for current codebase
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

console.log('🔄 Resetting database to blank state...');

// Your current database file path
const dbFile = './.data/messages.db';

if (!fs.existsSync(dbFile)) {
  console.log('ℹ️  No database file found. Nothing to reset.');
  console.log('💡 Run the app first to create the database, then try again.');
  process.exit(0);
}

const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }

  console.log('🗑️  Clearing all data...');

  db.serialize(() => {
    // Clear all messages
    db.run("DELETE FROM Messages", (err) => {
      if (err) {
        console.error('❌ Error clearing Messages:', err.message);
      } else {
        console.log('✓ Messages table cleared');
      }
    });

    // Clear all sessions
    db.run("DELETE FROM Sessions", (err) => {
      if (err) {
        console.error('❌ Error clearing Sessions:', err.message);
      } else {
        console.log('✓ Sessions table cleared');
      }
    });

    // Reset auto-increment counters
    db.run("DELETE FROM sqlite_sequence WHERE name='Messages'", (err) => {
      if (err && !err.message.includes('no such table')) {
        console.error('⚠️  Warning: Could not reset Messages counter:', err.message);
      } else {
        console.log('✓ Messages counter reset');
      }
    });

    db.run("DELETE FROM sqlite_sequence WHERE name='Sessions'", (err) => {
      if (err && !err.message.includes('no such table')) {
        console.error('⚠️  Warning: Could not reset Sessions counter:', err.message);
      } else {
        console.log('✓ Sessions counter reset');
      }
    });
  });

  db.close((err) => {
    if (err) {
      console.error('❌ Error closing database:', err.message);
      process.exit(1);
    } else {
      console.log('🎉 Database reset complete! All data cleared.');
      console.log('💡 Tip: Use "npm run db:backup" before resetting to save current data');
    }
  });
});