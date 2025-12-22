// src/notionCms.js - Notion CMS integration for guest info and upcoming chat banner
const { Client } = require('@notionhq/client');

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const CONFIG = {
  CACHE_TTL: 15 * 60 * 1000, // 15 minutes
  MAX_BLOCKS_PER_PAGE: 100,
  UPCOMING_CHAT_PAGE_NAME: 'upcoming-chat',
  TITLE_PROPERTIES: ['Name', 'title', 'Title'],
  MEDIA_PROPERTIES: ['Media', 'Files & media'],
  USER_STATUS: {
    GUEST: 'Guest',
    HOST: 'Host'
  },
  PERSON_ROLE: 'person'
};

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_TOKEN
});

const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

class CacheManager {
  constructor(ttl = CONFIG.CACHE_TTL) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.ttl) {
      return entry.data;
    }
    this.cache.delete(key);
    return null;
  }

  set(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  has(key) {
    const entry = this.cache.get(key);
    return entry && Date.now() - entry.timestamp < this.ttl;
  }
}

const cacheManager = new CacheManager();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validates that required input parameters are present
 */
function validateInput(value, paramName) {
  if (!value || (typeof value === 'string' && value.trim().length === 0)) {
    throw new Error(`Invalid ${paramName}: must be a non-empty string`);
  }
}

/**
 * Sanitize URL to prevent injection attacks
 */
function sanitizeUrl(url) {
  if (!url) return null;
  const urlStr = String(url).trim();

  // Allow only http(s) and data: URLs
  if (!urlStr.match(/^(https?:\/\/|data:image\/)/i)) {
    return null;
  }

  // Basic XSS prevention: encode dangerous characters
  return urlStr
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Extract media URL from page with fallback chain
 */
function extractMediaUrl(page, properties) {
  const mediaProperty = properties?.[CONFIG.MEDIA_PROPERTIES[0]];
  const filesProperty = properties?.[CONFIG.MEDIA_PROPERTIES[1]];
  const coverUrl = page.cover?.external?.url || page.cover?.file?.url;

  return (
    (Array.isArray(mediaProperty) ? mediaProperty[0] : null) ||
    coverUrl ||
    (Array.isArray(filesProperty) ? filesProperty[0] : null)
  );
}

// ============================================================================
// PAGE RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Search for a page by title in the Notion database
 * @param {string} title - The page title to search for
 * @returns {Promise<Object|null>} - Page data or null if not found
 */
async function getPageByTitle(title) {
  try {
    validateInput(title, 'title');
  } catch (error) {
    console.error('Validation error:', error.message);
    return null;
  }

  const cacheKey = `page:${title.toLowerCase()}`;
  const cached = cacheManager.get(cacheKey);
  if (cached) return cached;

  try {
    const allPagesResults = await getAllPagesRaw();

    const match = allPagesResults.find(page => {
      const pageTitle = getPageTitle(page);
      return pageTitle && pageTitle.toLowerCase() === title.toLowerCase();
    });

    if (!match) {
      console.log(`Notion: No match found for "${title}"`);
      return null;
    }

    console.log(`Notion: Found match for "${title}"`);
    const pageData = await getPageContent(match.id);
    cacheManager.set(cacheKey, pageData);
    return pageData;
  } catch (error) {
    console.error('Notion API error (getPageByTitle):', error.message);
    return null;
  }
}

/**
 * Get all pages raw data (internal helper with caching)
 */
async function getAllPagesRaw() {
  const cached = cacheManager.get('all-pages-raw');
  if (cached) {
    console.log('Notion: Using cached pages list');
    return cached;
  }

  const allPages = await notion.databases.query({
    database_id: DATABASE_ID,
    page_size: CONFIG.MAX_BLOCKS_PER_PAGE
  });

  const results = allPages.results;
  cacheManager.set('all-pages-raw', results);
  console.log(`Notion: Fetched ${results.length} pages from database`);

  return results;
}

/**
 * Get the title property value from a Notion page
 */
function getPageTitle(page) {
  if (!page?.properties) return null;

  for (const propName of CONFIG.TITLE_PROPERTIES) {
    const titleProp = page.properties[propName];
    if (titleProp?.title?.length > 0) {
      return titleProp.title.map(t => t.plain_text).join('');
    }
  }

  return null;
}

/**
 * Get page content (blocks) and properties
 * @param {string} pageId - Notion page ID
 */
async function getPageContent(pageId) {
  try {
    validateInput(pageId, 'pageId');
  } catch (error) {
    console.error('Validation error:', error.message);
    return null;
  }

  try {
    const [page, blocks] = await Promise.all([
      notion.pages.retrieve({ page_id: pageId }),
      notion.blocks.children.list({
        block_id: pageId,
        page_size: CONFIG.MAX_BLOCKS_PER_PAGE
      })
    ]);

    const props = extractProperties(page.properties);

    return {
      id: pageId,
      title: getPageTitle(page),
      properties: props,
      content: blocksToHtml(blocks.results),
      cover: page.cover?.external?.url || page.cover?.file?.url || null,
      icon: page.icon?.emoji || page.icon?.external?.url || null,
      media: extractMediaUrl(page, props),
      lastEdited: page.last_edited_time
    };
  } catch (error) {
    console.error('Notion API error (getPageContent):', error.message);
    return null;
  }
}

/**
 * Extract useful properties from Notion page
 */
function extractProperties(properties) {
  const result = {};
  
  for (const [key, value] of Object.entries(properties)) {
    switch (value.type) {
      case 'title':
        result[key] = value.title.map(t => t.plain_text).join('');
        break;
      case 'rich_text':
        result[key] = value.rich_text.map(t => t.plain_text).join('');
        break;
      case 'number':
        result[key] = value.number;
        break;
      case 'select':
        result[key] = value.select?.name || null;
        break;
      case 'multi_select':
        result[key] = value.multi_select.map(s => s.name);
        break;
      case 'date':
        result[key] = value.date?.start || null;
        break;
      case 'checkbox':
        result[key] = value.checkbox;
        break;
      case 'url':
        result[key] = value.url;
        break;
      case 'email':
        result[key] = value.email;
        break;
      case 'phone_number':
        result[key] = value.phone_number;
        break;
      case 'files':
        result[key] = value.files.map(f => f.external?.url || f.file?.url).filter(Boolean);
        break;
      default:
        // Skip unsupported types
        break;
    }
  }
  
  return result;
}

// ============================================================================
// HTML CONVERSION FUNCTIONS
// ============================================================================

/**
 * Convert a single Notion block to HTML
 */
function blockToHtmlElement(block) {
  const type = block.type;
  const content = block[type];

  switch (type) {
    case 'paragraph': {
      const pText = richTextToHtml(content.rich_text);
      return pText ? { type: 'paragraph', html: `<p>${pText}</p>` } : null;
    }

    case 'heading_1':
      return { type: 'heading', html: `<h1>${richTextToHtml(content.rich_text)}</h1>` };

    case 'heading_2':
      return { type: 'heading', html: `<h2>${richTextToHtml(content.rich_text)}</h2>` };

    case 'heading_3':
      return { type: 'heading', html: `<h3>${richTextToHtml(content.rich_text)}</h3>` };

    case 'bulleted_list_item':
      return { type: 'bulleted_list', html: `<li>${richTextToHtml(content.rich_text)}</li>` };

    case 'numbered_list_item':
      return { type: 'numbered_list', html: `<li>${richTextToHtml(content.rich_text)}</li>` };

    case 'quote':
      return { type: 'quote', html: `<blockquote>${richTextToHtml(content.rich_text)}</blockquote>` };

    case 'code': {
      const language = content.language || 'text';
      const code = richTextToHtml(content.rich_text);
      return { type: 'code', html: `<pre><code class="language-${language}">${code}</code></pre>` };
    }

    case 'divider':
      return { type: 'divider', html: '<hr />' };

    case 'image': {
      const imgUrl = sanitizeUrl(content.external?.url || content.file?.url);
      if (!imgUrl) return null;

      const caption = content.caption?.length > 0 ? richTextToHtml(content.caption) : '';
      const altText = caption || 'Image';
      const captionHtml = caption ? `<figcaption>${caption}</figcaption>` : '';

      return { type: 'image', html: `<figure><img src="${imgUrl}" alt="${altText}" />${captionHtml}</figure>` };
    }

    case 'callout': {
      const icon = content.icon?.emoji || '';
      const iconHtml = icon ? `<span class="callout-icon">${icon}</span>` : '';
      const text = richTextToHtml(content.rich_text);

      return { type: 'callout', html: `<aside class="callout">${iconHtml}<div>${text}</div></aside>` };
    }

    default:
      return null;
  }
}

/**
 * Group consecutive list items and wrap them in ul/ol tags
 */
function groupListItems(elements) {
  const result = [];
  let currentList = null;
  let currentListType = null;

  for (const element of elements) {
    if (element.type === 'bulleted_list' || element.type === 'numbered_list') {
      if (element.type !== currentListType) {
        // Close previous list if switching types
        if (currentList) {
          const tag = currentListType === 'bulleted_list' ? 'ul' : 'ol';
          result.push(`<${tag}>\n${currentList.join('\n')}\n</${tag}>`);
        }
        // Start new list
        currentList = [element.html];
        currentListType = element.type;
      } else {
        // Continue current list
        currentList.push(element.html);
      }
    } else {
      // Close any open list
      if (currentList) {
        const tag = currentListType === 'bulleted_list' ? 'ul' : 'ol';
        result.push(`<${tag}>\n${currentList.join('\n')}\n</${tag}>`);
        currentList = null;
        currentListType = null;
      }
      // Add non-list element
      result.push(element.html);
    }
  }

  // Close any remaining open list
  if (currentList) {
    const tag = currentListType === 'bulleted_list' ? 'ul' : 'ol';
    result.push(`<${tag}>\n${currentList.join('\n')}\n</${tag}>`);
  }

  return result;
}

/**
 * Convert Notion blocks to HTML
 */
function blocksToHtml(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';

  const elements = blocks
    .map(blockToHtmlElement)
    .filter(Boolean);

  const grouped = groupListItems(elements);

  return grouped.join('\n');
}

/**
 * Convert Notion rich text to HTML
 */
function richTextToHtml(richText) {
  if (!richText || richText.length === 0) return '';
  
  return richText.map(item => {
    let text = escapeHtml(item.plain_text);
    
    // Apply annotations
    if (item.annotations.bold) text = `<strong>${text}</strong>`;
    if (item.annotations.italic) text = `<em>${text}</em>`;
    if (item.annotations.strikethrough) text = `<del>${text}</del>`;
    if (item.annotations.underline) text = `<u>${text}</u>`;
    if (item.annotations.code) text = `<code>${text}</code>`;
    
    // Handle links
    if (item.href) {
      text = `<a href="${item.href}" target="_blank" rel="noopener">${text}</a>`;
    }
    
    return text;
  }).join('');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// HIGH-LEVEL API FUNCTIONS
// ============================================================================

/**
 * Get upcoming chat info (page titled "upcoming-chat" or similar)
 */
async function getUpcomingChat() {
  const cacheKey = 'upcoming-chat';
  const cached = cacheManager.get(cacheKey);
  if (cached) return cached;

  try {
    const page = await getPageByTitle(CONFIG.UPCOMING_CHAT_PAGE_NAME);
    if (page) {
      cacheManager.set(cacheKey, page);
      return page;
    }
    return null;
  } catch (error) {
    console.error('Notion API error (getUpcomingChat):', error.message);
    return null;
  }
}

/**
 * Get all pages from the database (for listing guests, etc.)
 */
async function getAllPages() {
  const cacheKey = 'all-pages';
  const cached = cacheManager.get(cacheKey);
  if (cached) return cached;

  try {
    console.log('Notion: Querying database (paginated):', DATABASE_ID);
    let allResults = [];
    let cursor = undefined;

    do {
      const response = await notion.databases.query({
        database_id: DATABASE_ID,
        page_size: CONFIG.MAX_BLOCKS_PER_PAGE,
        start_cursor: cursor
      });

      if (response?.results && Array.isArray(response.results)) {
        allResults = allResults.concat(response.results);
      }

      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);

    // Cache raw results for reuse in getPageByTitle
    cacheManager.set('all-pages-raw', allResults);
    console.log('Notion: Raw response results count:', allResults.length);

    const pages = allResults.map(page => ({
      id: page.id,
      title: getPageTitle(page),
      properties: extractProperties(page.properties),
      cover: page.cover?.external?.url || page.cover?.file?.url || null,
      icon: page.icon?.emoji || page.icon?.external?.url || null
    }));

    cacheManager.set(cacheKey, pages);
    return pages;
  } catch (error) {
    console.error('Notion API error (getAllPages):', error.message, error);
    return [];
  }
}

/**
 * Get all pages with FULL content (for preloading)
 * This fetches blocks for each page - use sparingly!
 */
async function getAllPagesWithContent() {
  const cacheKey = 'all-pages-full';
  const cached = cacheManager.get(cacheKey);
  if (cached) return cached;

  try {
    console.log('Notion: Fetching all pages with full content...');
    const basicPages = await getAllPages();

    // Fetch full content for each page (excluding upcoming-chat)
    const fullPages = await Promise.all(
      basicPages
        .filter(p => p.title && p.title.toLowerCase() !== CONFIG.UPCOMING_CHAT_PAGE_NAME)
        .map(async (page) => {
          const fullData = await getPageContent(page.id);
          // Also cache individually for faster subsequent access
          if (fullData?.title) {
            cacheManager.set(`page:${fullData.title.toLowerCase()}`, fullData);
          }
          return fullData;
        })
    );

    const validPages = fullPages.filter(Boolean);
    cacheManager.set(cacheKey, validPages);
    console.log(`Notion: Preloaded ${validPages.length} pages with full content`);
    return validPages;
  } catch (error) {
    console.error('Notion API error (getAllPagesWithContent):', error.message);
    return [];
  }
}

/**
 * Get user metadata from Notion (Status, Override)
 * Returns a Map with username (lowercase) as key
 */
async function getUserMetadata() {
  try {
    const pages = await getAllPages();
    const userMap = new Map();

    for (const page of pages) {
      const name = page.title;
      if (!name || name.toLowerCase() === CONFIG.UPCOMING_CHAT_PAGE_NAME) {
        continue;
      }

      const props = page.properties || {};
      const status = props.Status; // Array: ['Guest'] or ['Host'] or []
      const override = props.Override; // String
      const role = props.Role || props.Type || null;

      // Heuristic: only treat a page as a "user/person" if it has an explicit Status
      // containing Guest/Host, or if it has a Role/Type explicitly set to 'Person'.
      const isGuest = Array.isArray(status) && status.includes(CONFIG.USER_STATUS.GUEST);
      const isHost = Array.isArray(status) && status.includes(CONFIG.USER_STATUS.HOST);
      const isPersonRole = role && String(role).toLowerCase() === CONFIG.PERSON_ROLE;

      if (!isGuest && !isHost && !isPersonRole) {
        // Skip pages that do not look like people to avoid accidental replacements
        continue;
      }

      userMap.set(name.toLowerCase(), {
        originalName: name,
        status: Array.isArray(status) && status.length > 0 ? status : [],
        override: override || null,
        isGuest: Boolean(isGuest),
        isHost: Boolean(isHost),
        type: isPersonRole ? CONFIG.PERSON_ROLE : null
      });
    }

    return userMap;
  } catch (err) {
    console.error('Error fetching Notion user metadata:', err);
    return new Map();
  }
}

/**
 * Clear the cache (useful for forcing refresh)
 * @param {string} [key] - Optional specific cache key to clear. If not provided, clears all cache.
 */
function clearCache(key) {
  if (key) {
    return cacheManager.delete(key);
  }
  cacheManager.clear();
  return true;
}

module.exports = {
  getPageByTitle,
  getPageContent,
  getUpcomingChat,
  getAllPages,
  getAllPagesWithContent,
  getUserMetadata,
  clearCache
};
