// server.js - Refactored ChatCast server
// Main orchestration file that wires together all modules

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const fastify = require('fastify')({ logger: false });
const handlebars = require('handlebars');
const { Server: SocketIOServer } = require('socket.io');

// Import configuration and modules
const CONFIG = require('./src/config/constants');
const db = require('./src/messagesDb');
const notionCms = require('./src/notionCms');
const { startPeriodicSync, syncNotion, getSyncStatus } = require('./scripts/sync-notion');
const { initializeTelegramBot } = require('./src/bot');
const { attachUserMetadata, attachAboutPage } = require('./src/middleware/userMetadata');

// Import route modules
const { registerSessionRoutes } = require('./src/routes/sessions');
const { registerMessageRoutes } = require('./src/routes/messages');
const { registerNotionRoutes } = require('./src/routes/notion');
const { registerViewRoutes } = require('./src/routes/views');
const { registerAdminRoutes } = require('./src/routes/admin');

// ============================================================================
// ENVIRONMENT VALIDATION
// ============================================================================

function validateEnvironment() {
  const warnings = [];

  if (!CONFIG.NOTION_TOKEN) {
    warnings.push('NOTION_TOKEN not set - Notion features will be disabled');
  }
  if (!CONFIG.NOTION_DATABASE_ID) {
    warnings.push('NOTION_DATABASE_ID not set - Notion features will be disabled');
  }
  if (!CONFIG.TELEGRAM_BOT_TOKEN) {
    warnings.push('TELEGRAM_BOT_TOKEN not set - Telegram bot will be disabled');
  }
  if (!CONFIG.ADMIN_API_KEY) {
    warnings.push('ADMIN_API_KEY not set - Admin endpoints will be inaccessible');
  }

  warnings.forEach(w => console.warn(`⚠️  ${w}`));

  return { warnings };
}

validateEnvironment();

// ============================================================================
// GLOBAL ERROR HANDLERS
// ============================================================================

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  setTimeout(() => process.exit(1), 1000);
});

// ============================================================================
// SOCKET.IO EMITTER HELPERS
// ============================================================================

let io = null;
let bot = null;

async function emitSessionUpdate(sessionId) {
  if (!sessionId || !io) return;

  try {
    const session = await db.getSession(sessionId);
    if (!session) return;

    const userMetadata = await notionCms.getUserMetadata();
    const authorMeta = userMetadata.get(session.author?.toLowerCase());

    const sanitizedSession = {
      ...session,
      author: authorMeta?.override || authorMeta?.originalName || session.author,
      author_display: authorMeta?.override || authorMeta?.originalName || session.author_display || session.author
    };

    io.to(`session:${sessionId}`).emit('session:update', sanitizedSession);
    io.to('sessions').emit('session:update', sanitizedSession);

    console.log('[emitSessionUpdate] emitted session:update for', sessionId);
  } catch (err) {
    console.error('Error emitting session update:', err);
  }
}

async function emitSessionNew(sessionId) {
  if (!sessionId || !io) return;

  try {
    const session = await db.getSession(sessionId);
    if (!session) return;

    const userMetadata = await notionCms.getUserMetadata();
    const authorMeta = userMetadata.get(session.author?.toLowerCase());

    const sanitizedSession = {
      ...session,
      author: authorMeta?.override || authorMeta?.originalName || session.author,
      author_display: authorMeta?.override || authorMeta?.originalName || session.author_display || session.author
    };

    io.to('sessions').emit('session:new', sanitizedSession);
    console.log('[emitSessionNew] emitted session:new for', sessionId);
  } catch (err) {
    console.error('Error emitting new session:', err);
  }
}

// ============================================================================
// HANDLEBARS SETUP
// ============================================================================

// Register helpers
handlebars.registerHelper('formatDate', function (dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString();
});

handlebars.registerHelper('jsPath', function (filename) {
  if (CONFIG.isProduction()) {
    return `/dist/${filename.replace('.js', '.min.js')}`;
  }
  return `/js/${filename}`;
});

handlebars.registerHelper('toLowerCase', function (str) {
  return str ? str.toLowerCase() : '';
});

handlebars.registerHelper('truncateText', function (text, length) {
  if (!text) return '';
  length = parseInt(length) || 30;
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
});

handlebars.registerHelper('eq', (a, b) => a === b);
handlebars.registerHelper('ne', (a, b) => a !== b);
handlebars.registerHelper('lte', (a, b) => a <= b);

handlebars.registerHelper('statusIcon', function (status) {
  if (!status) return 'fa-circle-question';

  switch (status.toLowerCase()) {
    case 'active': return 'fa-circle-play';
    case 'paused': return 'fa-circle-pause';
    case 'completed': return 'fa-circle-check';
    default: return 'fa-circle-question';
  }
});

handlebars.registerHelper('groupByUser', function (messages, options) {
  if (!messages || !messages.length) return options.inverse(this);

  messages.sort((a, b) => new Date(a.date) - new Date(b.date));

  const groups = [];
  let currentGroup = [];
  let currentUser = null;

  messages.forEach((message) => {
    if (currentUser !== message.username) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [message];
      currentUser = message.username;
    } else {
      currentGroup.push(message);
    }
  });

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  let result = '';
  groups.forEach((group) => {
    result += options.fn(group);
  });

  return result;
});

// Auto-register Handlebars partials
try {
  const partialsDir = path.join(__dirname, 'src', 'views', 'partials');
  const layoutsDir = path.join(__dirname, 'src', 'views', 'layouts');

  function registerPartials(dir, base = '') {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    entries.forEach((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nextBase = base ? path.join(base, entry.name) : entry.name;
        registerPartials(fullPath, nextBase);
      } else if (entry.isFile() && entry.name.endsWith('.hbs')) {
        const name = path.basename(entry.name, '.hbs');
        const partialName = base ? path.join(base, name).replace(/\\/g, '/') : name;
        const content = fs.readFileSync(fullPath, 'utf8');
        handlebars.registerPartial(partialName, content);
      }
    });
  }

  registerPartials(partialsDir);
  registerPartials(layoutsDir, 'layouts');
  console.log('✅ Handlebars partials registered');
} catch (err) {
  console.warn('⚠️ Could not auto-register Handlebars partials:', err.message);
}

// ============================================================================
// FASTIFY SETUP
// ============================================================================

// Register plugins
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

fastify.register(require('@fastify/formbody'));

fastify.register(require('@fastify/view'), {
  engine: { handlebars: handlebars },
  templates: path.join(__dirname, 'src/views'),
});

// CORS configuration
fastify.register(require('@fastify/cors'), {
  origin: CONFIG.isProduction() && CONFIG.ALLOWED_ORIGINS
    ? CONFIG.ALLOWED_ORIGINS
    : true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
});

// Rate limiting
fastify.register(require('@fastify/rate-limit'), {
  max: CONFIG.RATE_LIMIT.MAX_REQUESTS,
  timeWindow: CONFIG.RATE_LIMIT.TIME_WINDOW,
  keyGenerator: (request) => request.ip,
  errorResponseBuilder: (request, context) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Try again in ${context.after}`
  })
});

// Custom reply decorator for safe views with SEO defaults
fastify.decorateReply('safeView', function (view, data) {
  data = data || {};

  const about = this.request?.aboutData ? this.request.aboutData : null;
  if (about) data.about = about;

  data.pageTitle = data.pageTitle || (data.title ? `${data.title} - ${CONFIG.SEO.DEFAULT_TITLE}` : CONFIG.SEO.DEFAULT_TITLE);
  data.pageDescription = data.pageDescription || data.description || CONFIG.SEO.DEFAULT_DESCRIPTION;
  data.canonicalUrl = data.canonicalUrl || `${CONFIG.APP_URL}${this.request.raw.url}`;
  data.pageImage = data.pageImage || CONFIG.SEO.DEFAULT_IMAGE;

  return this.view(view, data);
});

// Global hooks
fastify.addHook('preHandler', attachUserMetadata);
fastify.addHook('preHandler', attachAboutPage);

// ============================================================================
// REGISTER ROUTES
// ============================================================================

// Prepare dependencies for routes
// Note: bot and io are module-level variables that will be set in start()
// but we pass getter functions so routes can access current values
const routeDeps = {
  db,
  notionCms,
  syncNotion,
  getSyncStatus,
  get bot() { return bot; },
  get io() { return io; }
};

registerViewRoutes(fastify, routeDeps);
registerSessionRoutes(fastify, routeDeps);
registerMessageRoutes(fastify, routeDeps);
registerNotionRoutes(fastify, routeDeps);
registerAdminRoutes(fastify, routeDeps);

// ============================================================================
// SERVER STARTUP
// ============================================================================

const start = async () => {
  try {
    // Verify and repair database
    if (typeof db.verifyAndRepairDatabase === 'function') {
      await db.verifyAndRepairDatabase();
    }

    // Initial session status check
    if (typeof db.checkAndFixSessionStatuses === 'function') {
      console.log('Running initial session status check...');
      const result = await db.checkAndFixSessionStatuses();
      console.log(`Initial session status check: checked ${result.checked}, updated ${result.updated}`);
    }

    // Start Fastify server
    await fastify.listen({ port: CONFIG.PORT, host: CONFIG.HOST });
    console.log(`Server listening on ${fastify.server.address().port}`);

    // Initialize Socket.IO
    const allowedOrigins = CONFIG.ALLOWED_ORIGINS ||
      (CONFIG.isDevelopment() ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : []);

    io = new SocketIOServer(fastify.server, {
      cors: {
        origin: CONFIG.isProduction() && allowedOrigins.length > 0 ? allowedOrigins : '*',
        methods: ['GET', 'POST']
      }
    });

    io.on('connection', (socket) => {
      if (CONFIG.isDevelopment()) {
        console.log('Socket connected:', socket.id);
      }

      socket.on('join', (room) => {
        socket.join(room);
        if (CONFIG.isDevelopment()) {
          console.log(`Socket ${socket.id} joined room ${room}`);
        }
      });

      socket.on('leave', (room) => {
        socket.leave(room);
      });

      socket.on('disconnect', () => {
        // Silent in production
      });
    });

    console.log('✅ Socket.IO initialized');

    // Start Notion sync
    const notionSyncIntervalId = startPeriodicSync();

    // Initialize Telegram bot and assign to module-level variable
    bot = initializeTelegramBot({
      db,
      notionCms,
      io,
      emitSessionUpdate,
      emitSessionNew
    });

    // Periodic session check
    const sessionCheckInterval = setInterval(async () => {
      try {
        if (typeof db.checkAndFixSessionStatuses === 'function') {
          const result = await db.checkAndFixSessionStatuses();
          if (result.updated > 0) {
            console.log(`Periodic session check: checked ${result.checked}, updated ${result.updated}`);
          }
        }
      } catch (err) {
        console.error('Error in periodic session status check:', err);
      }
    }, CONFIG.TIMEOUTS.SESSION_CHECK_INTERVAL);

    // Graceful shutdown
    const shutdown = (signal) => {
      console.log(`Received ${signal}, stopping server...`);
      clearInterval(sessionCheckInterval);
      if (notionSyncIntervalId) clearInterval(notionSyncIntervalId);
      fastify.close();
      if (bot) bot.stop(signal);
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));

  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
};

start();
