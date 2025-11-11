const tabulaService = require('./tabulaService');
const config = require('../config/tabula');

class SyncScheduler {
  constructor() {
    this.syncInterval = 10 * 60 * 1000; // 10 minutes in milliseconds
    this.intervalId = null;
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.lastSyncStatus = null;
    this.lastSyncError = null;
    this.syncCount = 0;
  }

  /**
   * Start the automatic sync scheduler
   */
  start() {
    if (this.intervalId) {
      console.log('⚠️  Sync scheduler is already running');
      return;
    }

    console.log('🔄 Starting automatic sync scheduler (every 10 minutes)');
    
    // Run initial sync
    this.sync().catch(err => {
      console.error('Initial sync failed:', err.message);
    });

    // Set up recurring sync
    this.intervalId = setInterval(() => {
      this.sync().catch(err => {
        console.error('Scheduled sync failed:', err.message);
      });
    }, this.syncInterval);

    console.log('✅ Sync scheduler started successfully');
  }

  /**
   * Stop the automatic sync scheduler
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Sync scheduler stopped');
    }
  }

  /**
   * Perform a sync with Tabula
   * This can be called manually or automatically by the scheduler
   */
  async sync() {
    if (this.isSyncing) {
      console.log('⏳ Sync already in progress, skipping...');
      return {
        success: false,
        message: 'Sync already in progress',
        skipped: true
      };
    }

    this.isSyncing = true;
    const syncStartTime = Date.now();
    
    try {
      console.log('🔄 Starting Tabula sync...');
      
      // Trigger sync by fetching field maps (this will update the cache)
      const accountId = config.accountId;
      const fieldMaps = await tabulaService.getFieldMaps(accountId);
      
      const syncDuration = Date.now() - syncStartTime;
      this.lastSyncTime = new Date();
      this.lastSyncStatus = 'success';
      this.lastSyncError = null;
      this.syncCount++;

      console.log(`✅ Sync completed successfully in ${syncDuration}ms - ${fieldMaps.length} field maps`);

      return {
        success: true,
        message: 'Sync completed successfully',
        fieldMapCount: fieldMaps.length,
        duration: syncDuration,
        timestamp: this.lastSyncTime.toISOString()
      };
    } catch (error) {
      const syncDuration = Date.now() - syncStartTime;
      this.lastSyncTime = new Date();
      this.lastSyncStatus = 'failed';
      this.lastSyncError = error.message;

      console.error(`❌ Sync failed after ${syncDuration}ms:`, error.message);

      return {
        success: false,
        message: 'Sync failed',
        error: error.message,
        duration: syncDuration,
        timestamp: this.lastSyncTime.toISOString()
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Get sync scheduler status
   */
  getStatus() {
    const nextSyncIn = this.lastSyncTime 
      ? Math.max(0, this.syncInterval - (Date.now() - this.lastSyncTime.getTime()))
      : 0;

    return {
      running: this.intervalId !== null,
      syncing: this.isSyncing,
      syncInterval: this.syncInterval,
      syncIntervalMinutes: this.syncInterval / (60 * 1000),
      lastSyncTime: this.lastSyncTime ? this.lastSyncTime.toISOString() : null,
      lastSyncStatus: this.lastSyncStatus,
      lastSyncError: this.lastSyncError,
      syncCount: this.syncCount,
      nextSyncIn: Math.floor(nextSyncIn / 1000), // seconds
      nextSyncInMinutes: Math.floor(nextSyncIn / (60 * 1000))
    };
  }

  /**
   * Check if a sync is currently in progress
   */
  isSyncInProgress() {
    return this.isSyncing;
  }
}

module.exports = new SyncScheduler();
