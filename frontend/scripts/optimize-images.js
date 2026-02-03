#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const assetsDir = path.join(__dirname, '..', 'public', 'assets');
const inputNames = ['original-bunny.jpg', 'original-bunny.png', 'original-bunny.webp', 'bunny-source.jpg', 'bunny-source.png'];

(async () => {
  try {
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

    const found = inputNames.map(n => path.join(assetsDir, n)).find(fp => fs.existsSync(fp));
    if (!found) {
      console.error('No source image found. Place the original image at:', inputNames.map(n => path.join('frontend/public/assets', n)).join(' or '));
      process.exit(1);
    }

    const outWebp = path.join(assetsDir, 'bunny.webp');
    const outJpg = path.join(assetsDir, 'bunny.jpg');

    console.log('Optimizing', found);

    // Create responsive, constrained size (max width 1920) and optimized quality
    await sharp(found)
      .resize({ width: 1920, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(outWebp);

    await sharp(found)
      .resize({ width: 1920, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(outJpg);

    console.log('Created', outWebp, 'and', outJpg);
  } catch (err) {
    console.error('Image optimization failed:', err);
    process.exit(1);
  }
})();