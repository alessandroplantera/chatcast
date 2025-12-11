/**
 * Notion Sync Script
 * Synchronizes user metadata (override names, guest/host status) from Notion to the database
 * Runs periodically to keep the database cache up to date without exposing real names to frontend
 */

const { getUserMetadata } = require('../src/notionCms');
const { syncAllSessionsWithNotion } = require('../src/messagesDb');

let syncInProgress = false;
let lastSyncTime = null;
let lastSyncResult = null;

/**
 * Perform a single sync operation
 */
async function syncNotion() {
  if (syncInProgress) {
    console.log('[Notion Sync] Sync already in progress, skipping...');
    return { skipped: true, reason: 'sync_in_progress' };
  }

  try {
    syncInProgress = true;
    const startTime = Date.now();
    
    console.log('[Notion Sync] Starting sync from Notion to database...');
    
    // Fetch user metadata from Notion
    const userMetadataMap = await getUserMetadata();
    
    if (!userMetadataMap || userMetadataMap.size === 0) {
      console.log('[Notion Sync] No user metadata found in Notion');
      return { success: false, error: 'no_metadata' };
    }
    
    console.log(`[Notion Sync] Found ${userMetadataMap.size} users in Notion`);
    
    // Update all sessions in database with Notion metadata
    const result = await syncAllSessionsWithNotion(userMetadataMap);
    
    const duration = Date.now() - startTime;
    lastSyncTime = new Date();
    lastSyncResult = { ...result, duration, timestamp: lastSyncTime };
    
    console.log(`[Notion Sync] Completed in ${duration}ms:`, result);
    
    return {
      success: true,
      ...result,
      duration,
      timestamp: lastSyncTime
    };
    
  } catch (error) {
    console.error('[Notion Sync] Error during sync:', error);
    lastSyncResult = { success: false, error: error.message, timestamp: new Date() };
    return { success: false, error: error.message };
  } finally {
    syncInProgress = false;
  }
}

/**
 * Start periodic sync (every 30 minutes)
 */
function startPeriodicSync() {
  const defaultInterval = 30 * 60 * 1000; // 30 minutes in milliseconds
  const SYNC_INTERVAL = process.env.NOTION_SYNC_INTERVAL_MS ? parseInt(process.env.NOTION_SYNC_INTERVAL_MS, 10) : defaultInterval;

  console.log(`[Notion Sync] Starting periodic sync (interval ${SYNC_INTERVAL}ms)...`);

  // Run initial sync
  syncNotion().then(result => {
    console.log('[Notion Sync] Initial sync completed:', result);
  });

  // Schedule periodic syncs
  const intervalId = setInterval(() => {
    console.log('[Notion Sync] Running scheduled sync...');
    syncNotion().then(result => {
      console.log('[Notion Sync] Scheduled sync completed:', result);
    });
  }, SYNC_INTERVAL);

  // Return the interval id so the caller can clear it if needed
  return intervalId;
}

/**
 * Get last sync status (for monitoring/debugging)
 */
function getSyncStatus() {
  return {
    inProgress: syncInProgress,
    lastSyncTime,
    lastSyncResult
  };
}

module.exports = {
  syncNotion,
  startPeriodicSync,
  getSyncStatus
};
