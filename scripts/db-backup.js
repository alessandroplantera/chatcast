// scripts/db-backup.js - Simple backup for current codebase
const fs = require('fs');
const path = require('path');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = process.env.DATABASE_BACKUP_DIR || '/app/.data/backups';

// Ensure backup directory exists (create if missing)
if (!fs.existsSync(backupDir)) {
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`✓ Created backups directory at ${backupDir}`);
  } catch (err) {
    console.error(`❌ Failed to create backup directory ${backupDir}:`, err.message);
    process.exit(1);
  }
}

// Your current database file (from your existing messagesDb.js)
const dbFile = './.data/messages.db';

console.log(`🔄 Starting backup at ${new Date().toLocaleString()}`);

if (fs.existsSync(dbFile)) {
  const backupPath = path.join(backupDir, `messages.db.${timestamp}.backup`);
  
  try {
    fs.copyFileSync(dbFile, backupPath);
    const stats = fs.statSync(backupPath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    
    console.log(`✓ Backed up: ${dbFile} → ${backupPath}`);
    console.log(`📊 Backup size: ${sizeKB} KB`);
    console.log(`🎉 Backup complete!`);
  } catch (error) {
    console.error(`❌ Failed to backup ${dbFile}:`, error.message);
    process.exit(1);
  }
} else {
  console.log('ℹ️  No database file found at ./.data/messages.db');
  console.log('💡 Make sure you have run the app at least once to create the database');
}