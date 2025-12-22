// src/routes/admin.js - Admin API routes

const { requireAdmin } = require('../middleware/auth');

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
}

module.exports = { registerAdminRoutes };
