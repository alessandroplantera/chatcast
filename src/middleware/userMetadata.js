// src/middleware/userMetadata.js - Middleware to attach user metadata to requests

const notionCms = require('../notionCms');

/**
 * Middleware to fetch and attach user metadata to request
 * Makes user metadata available as request.userMetadata
 */
async function attachUserMetadata(request, reply) {
  try {
    const userMetadata = await notionCms.getUserMetadata();
    request.userMetadata = userMetadata;
  } catch (err) {
    console.error('Error fetching user metadata in middleware:', err);
    request.userMetadata = new Map();
  }
}

/**
 * Middleware to fetch and attach about page to request
 * Makes about page data available as request.aboutData
 */
async function attachAboutPage(request, reply) {
  try {
    const aboutPage = await notionCms.getPageByTitle('about');
    request.aboutData = aboutPage || null;
  } catch (err) {
    console.error('Error fetching about page in middleware:', err);
    request.aboutData = null;
  }
}

module.exports = {
  attachUserMetadata,
  attachAboutPage
};
