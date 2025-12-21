// src/notionCms.js - Notion CMS integration for guest info and upcoming chat banner
const { Client } = require('@notionhq/client');

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_TOKEN
});

const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// Simple in-memory cache (15 minutes TTL)
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getCached(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Search for a page by title in the Notion database
 * @param {string} title - The page title to search for
 * @returns {Promise<Object|null>} - Page data or null if not found
 */
async function getPageByTitle(title) {
  const cacheKey = `page:${title.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    // First check if we have all-pages cached to avoid extra API call
    let allPagesResults = getCached('all-pages-raw');
    
    if (!allPagesResults) {
      const allPages = await notion.databases.query({
        database_id: DATABASE_ID
      });
      allPagesResults = allPages.results;
      setCache('all-pages-raw', allPagesResults);
      console.log(`Notion: Fetched ${allPagesResults.length} pages from database`);
    } else {
      console.log(`Notion: Using cached pages list`);
    }
    
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
    setCache(cacheKey, pageData);
    return pageData;
  } catch (error) {
    console.error('Notion API error (getPageByTitle):', error.message);
    return null;
  }
}

/**
 * Get the title property value from a Notion page
 */
function getPageTitle(page) {
  const titleProp = page.properties.Name || page.properties.title || page.properties.Title;
  if (!titleProp) return null;
  
  if (titleProp.title && titleProp.title.length > 0) {
    return titleProp.title.map(t => t.plain_text).join('');
  }
  return null;
}

/**
 * Get page content (blocks) and properties
 * @param {string} pageId - Notion page ID
 */
async function getPageContent(pageId) {
  try {
    // Get page properties
    const page = await notion.pages.retrieve({ page_id: pageId });
    
    // Get page blocks (content)
    const blocks = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100
    });

    const props = extractProperties(page.properties);
    
    return {
      id: pageId,
      title: getPageTitle(page),
      properties: props,
      content: blocksToHtml(blocks.results),
      cover: page.cover?.external?.url || page.cover?.file?.url || null,
      icon: page.icon?.emoji || page.icon?.external?.url || null,
      // Media: first image from "Media" property, or cover, or first file
      media: props.Media?.[0] || page.cover?.external?.url || page.cover?.file?.url || props['Files & media']?.[0] || null,
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

/**
 * Convert Notion blocks to HTML
 */
function blocksToHtml(blocks) {
  return blocks.map(block => {
    const type = block.type;
    const content = block[type];
    
    switch (type) {
      case 'paragraph':
        const pText = richTextToHtml(content.rich_text);
        return pText ? `<p>${pText}</p>` : '';
        
      case 'heading_1':
        return `<h1>${richTextToHtml(content.rich_text)}</h1>`;
        
      case 'heading_2':
        return `<h2>${richTextToHtml(content.rich_text)}</h2>`;
        
      case 'heading_3':
        return `<h3>${richTextToHtml(content.rich_text)}</h3>`;
        
      case 'bulleted_list_item':
        return `<li>${richTextToHtml(content.rich_text)}</li>`;
        
      case 'numbered_list_item':
        return `<li>${richTextToHtml(content.rich_text)}</li>`;
        
      case 'quote':
        return `<blockquote>${richTextToHtml(content.rich_text)}</blockquote>`;
        
      case 'code':
        return `<pre><code class="language-${content.language || 'text'}">${richTextToHtml(content.rich_text)}</code></pre>`;
        
      case 'divider':
        return '<hr />';
        
      case 'image':
        const imgUrl = content.external?.url || content.file?.url;
        const caption = content.caption?.length > 0 ? richTextToHtml(content.caption) : '';
        return imgUrl ? `<figure><img src="${imgUrl}" alt="${caption}" />${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>` : '';
        
      case 'callout':
        const icon = content.icon?.emoji || '';
        return `<aside class="callout">${icon ? `<span class="callout-icon">${icon}</span>` : ''}<div>${richTextToHtml(content.rich_text)}</div></aside>`;
        
      default:
        return '';
    }
  }).filter(Boolean).join('\n');
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

/**
 * Get upcoming chat info (page titled "upcoming-chat" or similar)
 */
async function getUpcomingChat() {
  const cacheKey = 'upcoming-chat';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    // Search for upcoming chat page
    const page = await getPageByTitle('upcoming-chat');
    if (page) {
      setCache(cacheKey, page);
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
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    console.log('Notion: Querying database (paginated):', DATABASE_ID);
    let allResults = [];
    let cursor = undefined;
    do {
      const response = await notion.databases.query({
        database_id: DATABASE_ID,
        page_size: 100,
        start_cursor: cursor
      });
      if (response && Array.isArray(response.results)) {
        allResults = allResults.concat(response.results);
      }
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);

    // Cache raw results for getPageByTitle
    setCache('all-pages-raw', allResults);
    console.log('Notion: Raw response results count:', allResults.length);

    const pages = allResults.map(page => ({
      id: page.id,
      title: getPageTitle(page),
      properties: extractProperties(page.properties),
      cover: page.cover?.external?.url || page.cover?.file?.url || null,
      icon: page.icon?.emoji || page.icon?.external?.url || null
    }));

    setCache(cacheKey, pages);
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
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    console.log('Notion: Fetching all pages with full content...');
    const basicPages = await getAllPages();
    
    // Fetch full content for each page (excluding upcoming-chat)
    const fullPages = await Promise.all(
      basicPages
        .filter(p => p.title && p.title.toLowerCase() !== 'upcoming-chat')
        .map(async (page) => {
          const fullData = await getPageContent(page.id);
          // Also cache individually
          if (fullData && fullData.title) {
            setCache(`page:${fullData.title.toLowerCase()}`, fullData);
          }
          return fullData;
        })
    );
    
    const validPages = fullPages.filter(Boolean);
    setCache(cacheKey, validPages);
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
      if (!name || name.toLowerCase() === 'upcoming-chat') continue;

      const props = page.properties || {};
      const status = props.Status; // Array: ['Guest'] or ['Host'] or []
      const override = props.Override; // String
      const role = props.Role || props.Type || null;

      // Heuristic: only treat a page as a "user/person" if it has an explicit Status
      // containing Guest/Host, or if it has a Role/Type explicitly set to 'Person'.
      const isGuest = status && Array.isArray(status) && status.includes('Guest');
      const isHost = status && Array.isArray(status) && status.includes('Host');
      const isPersonRole = role && String(role).toLowerCase() === 'person';

      if (!isGuest && !isHost && !isPersonRole) {
        // Skip pages that do not look like people to avoid accidental replacements
        continue;
      }

      userMap.set(name.toLowerCase(), {
        originalName: name,
        status: status && status.length > 0 ? status : [],
        override: override || null,
        isGuest: Boolean(isGuest),
        isHost: Boolean(isHost),
        type: isPersonRole ? 'person' : null
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
 */
function clearCache() {
  cache.clear();
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
