// src/routes/admin.js - Admin API routes

const { requireAdmin } = require('../middleware/auth');
const CONFIG = require('../config/constants');
const fs = require('fs');
const path = require('path');

/**
 * Register admin routes
 */
async function registerAdminRoutes(fastify, { db, syncNotion, getSyncStatus, bot, io }) {

  // Manual sync endpoint
  fastify.post('/admin/sync', { preHandler: requireAdmin }, async (request, reply) => {
    try {
      console.log('[Admin] Manual sync triggered');
      const result = await syncNotion();
      return reply.send({ success: true, result });
    } catch (err) {
      console.error('Error in manual sync:', err);
      return reply.status(500).send({ error: 'Error syncing with Notion' });
    }
  });

  // Get sync status
  fastify.get('/admin/sync-status', { preHandler: requireAdmin }, async (request, reply) => {
    try {
      const status = getSyncStatus();
      return reply.send(status);
    } catch (err) {
      return reply.status(500).send({ error: 'Error getting sync status' });
    }
  });

  // Reset database
  fastify.post('/admin/reset-db', { preHandler: requireAdmin }, async (request, reply) => {
    try {
      console.log('[Admin] Database reset triggered');

      const cleared = await db.resetDatabase();

      return reply.send({
        success: true,
        message: 'Database reset complete',
        cleared
      });
    } catch (err) {
      console.error('Error resetting database:', err);

      if (err.partial) {
        return reply.status(500).send({
          success: false,
          error: 'Database reset completed with errors',
          errors: err.errors,
          cleared: err.cleared
        });
      }

      return reply.status(500).send({
        error: 'Error resetting database',
        details: err.message
      });
    }
  });

  // Health check
  fastify.get('/health', async (request, reply) => {
    try {
      const dbHealthy = await db.getAllSessions().then(() => true).catch(() => false);

      const status = {
        status: dbHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {
          database: dbHealthy ? 'ok' : 'error',
          telegram: bot ? 'ok' : 'disabled',
          socketio: io ? 'ok' : 'disabled'
        }
      };

      return reply.status(dbHealthy ? 200 : 503).send(status);
    } catch (err) {
      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: err.message
      });
    }
  });

  // List all backups
  fastify.get('/admin/backups', { preHandler: requireAdmin }, async (request, reply) => {
    try {
      const backupDir = CONFIG.DATABASE_BACKUP_DIR;

      if (!fs.existsSync(backupDir)) {
        return reply.send({
          backups: [],
          backupDir,
          message: 'No backup directory found'
        });
      }

      const files = fs.readdirSync(backupDir);
      const backupFiles = files
        .filter(f => f.endsWith('.backup'))
        .map(filename => {
          const filePath = path.join(backupDir, filename);
          const stats = fs.statSync(filePath);

          return {
            filename,
            size: stats.size,
            sizeKB: (stats.size / 1024).toFixed(2),
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
        .sort((a, b) => b.modified - a.modified); // Most recent first

      return reply.send({
        backups: backupFiles,
        backupDir,
        count: backupFiles.length
      });
    } catch (err) {
      console.error('Error listing backups:', err);
      return reply.status(500).send({
        error: 'Error listing backups',
        details: err.message
      });
    }
  });

  // Download a specific backup
  fastify.get('/admin/backups/:filename', { preHandler: requireAdmin }, async (request, reply) => {
    try {
      const { filename } = request.params;
      const backupDir = CONFIG.DATABASE_BACKUP_DIR;
      const filePath = path.join(backupDir, filename);

      // Security: ensure the file is within the backup directory
      const resolvedPath = path.resolve(filePath);
      const resolvedBackupDir = path.resolve(backupDir);

      if (!resolvedPath.startsWith(resolvedBackupDir)) {
        return reply.status(403).send({
          error: 'Access denied'
        });
      }

      // Check if file exists and is a backup file
      if (!fs.existsSync(filePath) || !filename.endsWith('.backup')) {
        return reply.status(404).send({
          error: 'Backup file not found'
        });
      }

      // Send file
      return reply
        .type('application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(fs.createReadStream(filePath));
    } catch (err) {
      console.error('Error downloading backup:', err);
      return reply.status(500).send({
        error: 'Error downloading backup',
        details: err.message
      });
    }
  });

  // Delete a specific backup
  fastify.delete('/admin/backups/:filename', { preHandler: requireAdmin }, async (request, reply) => {
    try {
      const { filename } = request.params;
      const backupDir = CONFIG.DATABASE_BACKUP_DIR;
      const filePath = path.join(backupDir, filename);

      // Security: ensure the file is within the backup directory
      const resolvedPath = path.resolve(filePath);
      const resolvedBackupDir = path.resolve(backupDir);

      if (!resolvedPath.startsWith(resolvedBackupDir)) {
        return reply.status(403).send({
          error: 'Access denied'
        });
      }

      // Check if file exists and is a backup file
      if (!fs.existsSync(filePath) || !filename.endsWith('.backup')) {
        return reply.status(404).send({
          error: 'Backup file not found'
        });
      }

      // Delete the file
      fs.unlinkSync(filePath);

      return reply.send({
        success: true,
        message: 'Backup deleted successfully',
        filename
      });
    } catch (err) {
      console.error('Error deleting backup:', err);
      return reply.status(500).send({
        error: 'Error deleting backup',
        details: err.message
      });
    }
  });
}

module.exports = { registerAdminRoutes };
