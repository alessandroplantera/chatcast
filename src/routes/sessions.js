// src/routes/sessions.js - Session-related API routes

const { enrichSession, sanitizeSession } = require('../helpers/userSanitizer');
const CONFIG = require('../config/constants');

/**
 * Register session routes
 */
async function registerSessionRoutes(fastify, { db }) {

  // Get unique session IDs
  fastify.get('/sessions', async (request, reply) => {
    try {
      const sessions = await db.getUniqueSessions();
      return reply.send(sessions);
    } catch (err) {
      console.error(err);
      return reply.status(500).send('Error retrieving session IDs.');
    }
  });

  // Get all sessions with metadata
  fastify.get('/sessions-list', async (request, reply) => {
    try {
      const sessions = await db.getAllSessions();
      const userMetadata = request.userMetadata || new Map();

      const sanitized = sessions.map(session => {
        const authorMeta = userMetadata.get(session.author?.toLowerCase());
        const sanitizedAuthor = authorMeta?.override || authorMeta?.originalName || session.author;

        return {
          ...session,
          author: sanitizedAuthor
        };
      });

      return reply.send(sanitized);
    } catch (err) {
      console.error(err);
      return reply.status(500).send('Error retrieving sessions list.');
    }
  });

  // Get sessions with details
  fastify.get('/sessions-details', async (request, reply) => {
    try {
      const sessionsWithDetails = await db.getAllSessionsWithDetails();
      const userMetadata = request.userMetadata || new Map();

      const sanitized = sessionsWithDetails.map(session =>
        enrichSession(session, userMetadata)
      );

      return reply.send(sanitized);
    } catch (err) {
      console.error(err);
      return reply.status(500).send('Error retrieving sessions details.');
    }
  });

  // Get details for a specific session
  fastify.get('/session/:id', async (request, reply) => {
    try {
      const sessionId = request.params.id;
      const sessionDetails = await db.getSessionDetails(sessionId);

      if (!sessionDetails) {
        return reply.status(404).send('Session not found');
      }

      const userMetadata = request.userMetadata || new Map();
      const sanitized = sanitizeSession(sessionDetails, userMetadata);

      return reply.send(sanitized);
    } catch (err) {
      console.error(err);
      return reply.status(500).send('Error retrieving session details.');
    }
  });

  // Update session status
  fastify.put('/session/:id/status', async (request, reply) => {
    try {
      const sessionId = request.params.id;
      const { status } = request.body;

      const validStatuses = Object.values(CONFIG.SESSION_STATUS);
      if (!status || !validStatuses.includes(status)) {
        return reply.status(400).send({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }

      const session = await db.getSession(sessionId);
      if (!session) {
        return reply.status(404).send({ success: false, error: 'Session not found' });
      }

      await db.saveSession({ ...session, status: status });

      return reply.send({
        success: true,
        message: `Session ${sessionId} status updated to ${status}`,
        session_id: sessionId,
        status: status
      });
    } catch (err) {
      console.error('Error updating session status:', err);
      return reply.status(500).send({
        success: false,
        error: 'Error updating session status',
        details: err.message
      });
    }
  });

  // Check and fix session statuses
  fastify.get('/check-sessions', async (request, reply) => {
    try {
      const result = await db.checkAndFixSessionStatuses();
      return reply.send({
        success: true,
        message: `Checked ${result.checked} sessions, updated ${result.updated} to completed status`,
        ...result
      });
    } catch (err) {
      console.error('Error while checking sessions:', err);
      return reply.status(500).send({
        success: false,
        error: 'Error while checking sessions',
        details: err.message
      });
    }
  });

  // Fix specific session
  fastify.post('/api/fix-session/:id', async (request, reply) => {
    try {
      const sessionId = request.params.id;
      const { status } = request.body;

      if (!sessionId) {
        return reply.status(400).send({ success: false, error: 'Session ID is required' });
      }

      const validStatuses = Object.values(CONFIG.SESSION_STATUS);
      if (!status || !validStatuses.includes(status)) {
        return reply.status(400).send({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }

      const result = await db.forceUpdateSessionStatus(sessionId, status);

      if (result) {
        return reply.send({
          success: true,
          message: `Session ${sessionId} status successfully updated to ${status}`,
          session_id: sessionId,
          status: status
        });
      } else {
        return reply.status(500).send({
          success: false,
          error: `Failed to update session ${sessionId} status`
        });
      }
    } catch (err) {
      console.error('Error handling manual fix request:', err);
      return reply.status(500).send({
        success: false,
        error: 'Error updating session status',
        details: err.message
      });
    }
  });

  // Fix all sessions
  fastify.post('/api/fix-all-sessions', async (request, reply) => {
    try {
      const sessions = await db.getAllSessions();

      if (!sessions || sessions.length === 0) {
        return reply.status(404).send({ success: false, error: 'No sessions found' });
      }

      let updatedCount = 0;

      for (const session of sessions) {
        if (!session.status) {
          const result = await db.forceUpdateSessionStatus(session.session_id, CONFIG.SESSION_STATUS.COMPLETED);
          if (result) updatedCount++;
        } else if (session.status === CONFIG.SESSION_STATUS.ACTIVE) {
          const lastMsg = await db.get(
            'SELECT date FROM Messages WHERE session_id = ? ORDER BY date DESC LIMIT 1',
            [session.session_id]
          );

          const lastMsgTime = lastMsg ? new Date(lastMsg.date).getTime() : 0;
          const creationTime = new Date(session.created_at).getTime();
          const oneHourAgo = Date.now() - CONFIG.TIMEOUTS.ONE_HOUR;

          if ((lastMsgTime && lastMsgTime < oneHourAgo) || (!lastMsgTime && creationTime < oneHourAgo)) {
            const result = await db.forceUpdateSessionStatus(session.session_id, CONFIG.SESSION_STATUS.COMPLETED);
            if (result) updatedCount++;
          }
        }
      }

      return reply.send({
        success: true,
        message: `Checked ${sessions.length} sessions, updated ${updatedCount} to completed status`,
        total: sessions.length,
        updated: updatedCount
      });
    } catch (err) {
      console.error('Error handling fix-all-sessions request:', err);
      return reply.status(500).send({
        success: false,
        error: 'Error updating sessions',
        details: err.message
      });
    }
  });
}

module.exports = { registerSessionRoutes };
