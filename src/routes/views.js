// src/routes/views.js - View rendering routes

const { enrichSession } = require('../helpers/userSanitizer');
const CONFIG = require('../config/constants');

/**
 * Register view rendering routes
 */
async function registerViewRoutes(fastify, { db }) {

  // Homepage
  fastify.get('/', async (request, reply) => {
    try {
      const sessions = await db.getAllSessionsWithDetails();
      const userMetadata = request.userMetadata || new Map();

      const enrichedSessions = sessions.map(session => enrichSession(session, userMetadata));

      return reply.safeView('homepage.hbs', { sessions: enrichedSessions });
    } catch (err) {
      console.error(err);
      return reply.safeView('homepage.hbs', { sessions: [] });
    }
  });

  // About page
  fastify.get('/about', async (request, reply) => {
    return reply.safeView('about.hbs');
  });

  // Sessions view
  fastify.get('/sessions-view', async (request, reply) => {
    try {
      const sessions = await db.getAllSessionsWithDetails();
      const userMetadata = request.userMetadata || new Map();

      const sanitizedSessions = sessions.map(session => enrichSession(session, userMetadata));

      return reply.safeView('index.hbs', { sessions: sanitizedSessions });
    } catch (err) {
      console.error(err);
      return reply.status(500).send('Error rendering sessions view.');
    }
  });

  // Messages view (redirects to clean URL)
  fastify.get('/messages-view', async (request, reply) => {
    try {
      const sessionId = request.query.session_id;

      if (!sessionId) {
        return reply.redirect('/sessions-view');
      }

      // Redirect to clean permalink
      return reply.redirect(301, `/sessions/${encodeURIComponent(sessionId)}`);
    } catch (err) {
      console.error(err);
      return reply.status(500).send('Error rendering messages view.');
    }
  });

  // Clean permalink route for a session
  fastify.get('/sessions/:id', async (request, reply) => {
    try {
      const sessionId = request.params.id;
      if (!sessionId) return reply.redirect('/sessions-view');

      return reply.safeView('layouts/main-wrapper.hbs', {
        pageTitle: `Session - ${sessionId} - ${CONFIG.SEO.DEFAULT_TITLE}`,
        canonicalUrl: `${CONFIG.APP_URL}${request.raw.url}`
      });
    } catch (err) {
      console.error('Error rendering session permalink:', err);
      return reply.status(500).send('Error rendering session');
    }
  });
}

module.exports = { registerViewRoutes };
