// scripts/db-status.js - Check database status for current codebase
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

console.log('📊 ChatCast Database Status');
console.log('=' .repeat(40));

// Your current database file
const dbFile = './.data/messages.db';

if (!fs.existsSync(dbFile)) {
  console.log('❌ Database not found: ./.data/messages.db');
  console.log('💡 Run the app first to create the database');
  console.log('');
  checkBackups();
  return;
}

const stats = fs.statSync(dbFile);
const sizeKB = (stats.size / 1024).toFixed(2);

console.log(`✅ Database: ${sizeKB} KB`);
console.log(`📍 Location: ${dbFile}`);
console.log(`🕐 Last modified: ${stats.mtime.toLocaleString()}`);
console.log('');

const db = new sqlite3.Database(dbFile, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.log(`❌ Error opening database: ${err.message}`);
    return;
  }

  // Get message count
  db.get("SELECT COUNT(*) as count FROM Messages", (err, result) => {
    if (err) {
      console.log('❌ Error counting messages:', err.message);
    } else {
      console.log(`📝 Total Messages: ${result.count}`);
    }

    // Get session count
    db.get("SELECT COUNT(*) as count FROM Sessions", (err, result) => {
      if (err) {
        console.log('❌ Error counting sessions:', err.message);
      } else {
        console.log(`📁 Total Sessions: ${result.count}`);
      }

      // Get latest session info
      db.get(`
        SELECT session_id, title, status, created_at 
        FROM Sessions 
        ORDER BY created_at DESC 
        LIMIT 1
      `, (err, session) => {
        if (err) {
          console.log('❌ Error getting latest session:', err.message);
        } else if (session) {
          console.log(`🕐 Latest Session: ${session.title || session.session_id}`);
          console.log(`   Status: ${session.status || 'unknown'}`);
          console.log(`   Created: ${session.created_at ? new Date(session.created_at).toLocaleString() : 'unknown'}`);
        } else {
          console.log('📭 No sessions found');
        }

        // Get most recent message
        db.get(`
          SELECT username, message, date 
          FROM Messages 
          ORDER BY date DESC 
          LIMIT 1
        `, (err, message) => {
          if (err) {
            console.log('❌ Error getting latest message:', err.message);
          } else if (message) {
            const truncatedMessage = message.message.length > 50 
              ? message.message.substring(0, 50) + '...' 
              : message.message;
            console.log(`💬 Latest Message: "${truncatedMessage}"`);
            console.log(`   From: ${message.username}`);
            console.log(`   Date: ${message.date ? new Date(message.date).toLocaleString() : 'unknown'}`);
          } else {
            console.log('📭 No messages found');
          }

          console.log('');
          db.close();
          checkBackups();
        });
      });
    });
  });
});

function checkBackups() {
  const backupDir = process.env.DATABASE_BACKUP_DIR || '/app/.data/backups';
  if (fs.existsSync(backupDir)) {
    const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.backup'));
    console.log(`💾 Backups available: ${backups.length}`);
    
    if (backups.length > 0) {
      const latest = backups.sort().pop();
      const backupStats = fs.statSync(path.join(backupDir, latest));
      const backupSizeKB = (backupStats.size / 1024).toFixed(2);
      console.log(`   Latest: ${latest}`);
      console.log(`   Size: ${backupSizeKB} KB`);
      console.log(`   Date: ${backupStats.mtime.toLocaleString()}`);
    }
  } else {
    console.log(`💾 Backups: No backup directory found at ${backupDir}`);
  }
  
  console.log('');
  console.log('🔧 Available commands:');
  console.log('   npm run db:backup  - Create backup');
  console.log('   npm run db:reset   - Clear all data');
  console.log('   npm run db:status  - Show this status');
}