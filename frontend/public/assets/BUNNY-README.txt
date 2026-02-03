This folder is where static assets are served from.

To enable the site-wide bunny background, place your original image file here with one of the following names (the optimizer will detect them):

  original-bunny.jpg
  original-bunny.png
  original-bunny.webp
  bunny-source.jpg
  bunny-source.png

Then run from the `frontend/` folder:

  npm install --no-audit --no-fund
  npm run optimize-images

This creates optimized `bunny.webp` (primary) and `bunny.jpg` (fallback) at `frontend/public/assets/`.

Notes:
- The script uses `sharp` and produces images resized to max width 1920 with reasonable quality. Adjust `frontend/scripts/optimize-images.js` if you want different settings.
- If you'd like, I can add the image for you now (if you upload it here) and run optimization locally.