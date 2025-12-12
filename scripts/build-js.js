#!/usr/bin/env node
/**
 * Build script to minify JavaScript files for production
 * Uses esbuild for fast, efficient minification
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const JS_DIR = path.join(__dirname, '../public/js');
const DIST_DIR = path.join(__dirname, '../public/dist');

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Get all JS files in the public/js directory
const jsFiles = fs.readdirSync(JS_DIR)
  .filter(file => file.endsWith('.js'))
  .map(file => path.join(JS_DIR, file));

async function build() {
  console.log('🔨 Building JavaScript files for production...\n');

  for (const file of jsFiles) {
    const filename = path.basename(file);
    const outfile = path.join(DIST_DIR, filename.replace('.js', '.min.js'));

    try {
      const result = await esbuild.build({
        entryPoints: [file],
        outfile,
        minify: true,
        bundle: false, // Don't bundle, just minify each file
        target: ['es2020'],
        sourcemap: false,
        metafile: true,
      });

      // Calculate size reduction
      const originalSize = fs.statSync(file).size;
      const minifiedSize = fs.statSync(outfile).size;
      const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(1);

      console.log(`✅ ${filename}`);
      console.log(`   ${formatSize(originalSize)} → ${formatSize(minifiedSize)} (${reduction}% smaller)`);
    } catch (error) {
      console.error(`❌ Failed to minify ${filename}:`, error.message);
      process.exit(1);
    }
  }

  console.log('\n✨ Build complete! Minified files in public/dist/');
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

build();
