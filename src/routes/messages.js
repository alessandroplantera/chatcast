// src/routes/messages.js - Message-related API routes

const { sanitizeMessage, sanitizeSession, buildSafeUserMetadata } = require('../helpers/userSanitizer');

/**
 * Register message routes
 */
async function registerMessageRoutes(fastify, { db }) {

  // Get messages with filtering options
  fastify.get('/messages', async (request, reply) => {
    try {
      const sessionId = request.query.session_id;
      const chatId = request.query.chat_id || 'all';
      const userMetadata = request.userMetadata || new Map();

      // Filter by session if provided
      if (sessionId) {
        let messages = await db.getMessagesBySession(sessionId);
        const sessionDetails = await db.getSessionDetails(sessionId);

        // Sanitize messages
        messages = messages.map(msg => sanitizeMessage(msg, userMetadata));

        // Build safe user metadata
        const safeUserMetadata = buildSafeUserMetadata(userMetadata);

        return reply.send({
          session: sanitizeSession(sessionDetails, userMetadata),
          messages: messages,
          userMetadata: safeUserMetadata
        });
      } else {
        // Filter by chat_id
        let messages = await db.getMessages(chatId);

        // Sanitize messages
        messages = messages.map(msg => sanitizeMessage(msg, userMetadata));

        const safeUserMetadata = buildSafeUserMetadata(userMetadata);

        return reply.send({
          session: null,
          messages: messages,
          userMetadata: safeUserMetadata
        });
      }
    } catch (err) {
      console.error(err);
      return reply.status(500).send('Error retrieving messages.');
    }
  });

  // Legacy endpoint: Get unique chat IDs
  fastify.get('/chat_ids', async (request, reply) => {
    try {
      const chatIds = await db.getUniqueChatIds();
      return reply.send(chatIds);
    } catch (err) {
      console.error(err);
      return reply.status(500).send('Error retrieving chat IDs.');
    }
  });
}

module.exports = { registerMessageRoutes };
