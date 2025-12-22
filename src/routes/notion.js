// src/routes/notion.js - Notion CMS API routes

const { sanitizeNotionPage, replaceUsernamesInText } = require('../helpers/userSanitizer');
const { requireAdmin } = require('../middleware/auth');

/**
 * Register Notion routes
 */
async function registerNotionRoutes(fastify, { notionCms }) {

  // Get page content by title
  fastify.get('/api/notion/page/:title', async (request, reply) => {
    try {
      const { title } = request.params;
      if (!title) {
        return reply.status(400).send({ error: 'Title parameter is required' });
      }

      const decodedTitle = decodeURIComponent(title);
      const userMetadata = request.userMetadata || new Map();

      // Resolve display name to original name
      let lookupTitle = decodedTitle;

      for (const [originalNameKey, meta] of userMetadata) {
        if (meta.override && meta.override.toLowerCase() === decodedTitle.toLowerCase()) {
          lookupTitle = meta.originalName;
          console.log(`Resolved display name "${decodedTitle}" to original "${meta.originalName}"`);
          break;
        }
      }

      const pageData = await notionCms.getPageByTitle(lookupTitle);

      if (!pageData) {
        return reply.status(404).send({ error: 'Page not found', title: decodedTitle });
      }

      const sanitized = sanitizeNotionPage(pageData);
      return reply.send(sanitized);
    } catch (err) {
      console.error('Error fetching Notion page:', err);
      return reply.status(500).send({ error: 'Error fetching page from Notion' });
    }
  });

  // Get upcoming chat info
  fastify.get('/api/notion/upcoming-chat', async (request, reply) => {
    try {
      const upcomingChat = await notionCms.getUpcomingChat();

      if (!upcomingChat) {
        return reply.send({ found: false, message: 'No upcoming chat configured' });
      }

      const userMetadata = request.userMetadata || new Map();
      let sanitizedUpcoming = { ...upcomingChat };

      // Replace usernames in Description
      if (sanitizedUpcoming.properties?.Description) {
        sanitizedUpcoming.properties.Description = replaceUsernamesInText(
          sanitizedUpcoming.properties.Description,
          userMetadata
        );
      }

      return reply.send({ found: true, ...sanitizedUpcoming });
    } catch (err) {
      console.error('Error fetching upcoming chat:', err);
      return reply.status(500).send({ error: 'Error fetching upcoming chat' });
    }
  });

  // List all pages (admin only)
  fastify.get('/api/notion/pages', { preHandler: requireAdmin }, async (request, reply) => {
    try {
      const pages = await notionCms.getAllPages();
      return reply.send({ count: pages.length, pages });
    } catch (err) {
      console.error('Error fetching all Notion pages:', err);
      return reply.status(500).send({ error: 'Error fetching pages' });
    }
  });

  // Get user metadata (public - safe version)
  fastify.get('/api/user-metadata', async (request, reply) => {
    try {
      const userMetadata = request.userMetadata || new Map();

      const byOriginal = {};
      const byDisplay = {};

      userMetadata.forEach((val, key) => {
        const displayName = val.override || val.originalName || null;

        if (displayName) {
          const safeKey = displayName.toLowerCase();
          byOriginal[safeKey] = {
            displayName,
            isGuest: Boolean(val.isGuest),
            isHost: Boolean(val.isHost)
          };

          byDisplay[safeKey] = {
            displayName,
            isGuest: Boolean(val.isGuest),
            isHost: Boolean(val.isHost)
          };
        }
      });

      return reply.send({ byOriginal, byDisplay });
    } catch (err) {
      console.error('Error fetching user metadata:', err);
      return reply.status(500).send({ error: 'Error fetching metadata' });
    }
  });

  // Get user metadata (admin only - full version)
  fastify.get('/api/user-metadata/admin', { preHandler: requireAdmin }, async (request, reply) => {
    try {
      const userMetadata = request.userMetadata || new Map();

      const byOriginal = {};
      const byDisplay = {};

      userMetadata.forEach((val, key) => {
        const originalKey = key;
        const originalName = val.originalName || key;
        const displayName = val.override || null;

        byOriginal[originalKey] = {
          originalName,
          displayName,
          isGuest: Boolean(val.isGuest),
          isHost: Boolean(val.isHost)
        };

        if (displayName) {
          byDisplay[displayName.toLowerCase()] = {
            displayName,
            isGuest: Boolean(val.isGuest),
            isHost: Boolean(val.isHost),
            originalName
          };
        }
      });

      return reply.send({ byOriginal, byDisplay });
    } catch (err) {
      console.error('Error fetching admin user metadata:', err);
      return reply.status(500).send({ error: 'Error fetching metadata' });
    }
  });

  // Clear Notion cache (admin only)
  fastify.post('/api/notion/clear-cache', { preHandler: requireAdmin }, async (request, reply) => {
    try {
      notionCms.clearCache();
      return reply.send({ success: true, message: 'Notion cache cleared' });
    } catch (err) {
      return reply.status(500).send({ error: 'Error clearing cache' });
    }
  });
}

module.exports = { registerNotionRoutes };
