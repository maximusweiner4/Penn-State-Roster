const puppeteer = require('puppeteer');
const path = require('path');

async function generateIcon(size) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: size, height: size });

    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#041E42"/>
            <stop offset="100%" style="stop-color:#1E407C"/>
          </linearGradient>
        </defs>
        <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="url(#bg)"/>
        <text x="50%" y="58%" font-family="Arial Black, sans-serif" font-size="${size * 0.35}" fill="white" text-anchor="middle" font-weight="bold">PSU</text>
        <text x="50%" y="82%" font-family="Arial, sans-serif" font-size="${size * 0.12}" fill="white" text-anchor="middle" opacity="0.8">DEPTH CHART</text>
      </svg>
    `;

    const html = `
      <!DOCTYPE html>
      <html>
      <head><style>* { margin: 0; padding: 0; } body { width: ${size}px; height: ${size}px; }</style></head>
      <body>${svg}</body>
      </html>
    `;

    await page.setContent(html);
    await page.screenshot({
      path: path.join(__dirname, '..', `icon-${size}.png`),
      type: 'png',
      clip: { x: 0, y: 0, width: size, height: size }
    });

    console.log(`Created icon-${size}.png`);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('Generating PWA icons...');
  await generateIcon(192);
  await generateIcon(512);
  console.log('Done!');
}

main();
