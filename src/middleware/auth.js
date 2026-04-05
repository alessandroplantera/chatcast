// src/middleware/auth.js - Authentication middleware

const CONFIG = require('../config/constants');

/**
 * Check if a Telegram user ID is an admin
 */
function isAdminUser(userId) {
  return CONFIG.ADMIN_TELEGRAM_USERS.includes(userId);
}

/**
 * Check if an HTTP request has valid admin API key
 */
function isAdminRequest(request) {
  const adminKeyHeader = request.headers['x-admin-key'] || request.headers['x-admin-token'];
  const expected = CONFIG.ADMIN_API_KEY || null;

  if (!expected) return false;
  return adminKeyHeader && adminKeyHeader === expected;
}

/**
 * Fastify hook to require admin authentication
 * Use as preHandler hook on protected routes
 */
async function requireAdmin(request, reply) {
  if (!isAdminRequest(request)) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}

module.exports = {
  isAdminUser,
  isAdminRequest,
  requireAdmin
};
