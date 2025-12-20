const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const outFile = path.join(publicDir, 'sitemap.xml');
const APP_URL = process.env.APP_URL || 'https://www.example.com';

function formatDate(d) {
  return d.toISOString();
}

function walkHtml(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  entries.forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkHtml(full));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(full);
    }
  });
  return files;
}

function buildUrls() {
  const files = walkHtml(publicDir);
  const urls = new Map();

  // Always include root
  urls.set('/', { loc: `${APP_URL}/`, lastmod: formatDate(new Date()) });

  files.forEach(file => {
    const rel = path.relative(publicDir, file).replace(/\\\\/g, '/');
    let urlPath = '/' + rel;
    if (urlPath.endsWith('index.html')) {
      urlPath = urlPath.replace(/index\.html$/, '');
    }
    // Normalize double slashes
    urlPath = urlPath.replace(/\/+/g, '/');
    const stats = fs.statSync(file);
    urls.set(urlPath, { loc: `${APP_URL}${urlPath}`, lastmod: formatDate(stats.mtime) });
  });

  return Array.from(urls.values());
}

function generateXml(urls) {
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  const footer = '</urlset>\n';
  const body = urls.map(u => {
    return `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
  }).join('\n');

  return header + body + '\n' + footer;
}

(function main() {
  try {
    if (!fs.existsSync(publicDir)) {
      console.error('public directory not found:', publicDir);
      process.exit(1);
    }

    const urls = buildUrls();
    const xml = generateXml(urls);

    fs.writeFileSync(outFile, xml, 'utf8');
    console.log('Sitemap written to', outFile);
    // Update robots.txt with sitemap URL (replace existing Sitemap line or append)
    try {
      const robotsPath = path.join(publicDir, 'robots.txt');
      const sitemapLine = `Sitemap: ${APP_URL.replace(/\/$/, '')}/sitemap.xml`;
      let robots = '';
      if (fs.existsSync(robotsPath)) robots = fs.readFileSync(robotsPath, 'utf8');

      if (/^\s*#?\s*Sitemap:/gmi.test(robots)) {
        robots = robots.replace(/^\s*#?\s*Sitemap:.*$/gmi, sitemapLine);
      } else {
        if (robots.length && !robots.endsWith('\n')) robots += '\n';
        robots += sitemapLine + '\n';
      }

      fs.writeFileSync(robotsPath, robots, 'utf8');
      console.log('robots.txt updated with sitemap entry at', robotsPath);
    } catch (err) {
      console.warn('Failed to update robots.txt with sitemap:', err.message || err);
    }
  } catch (err) {
    console.error('Failed to generate sitemap:', err);
    process.exit(1);
  }
})();
