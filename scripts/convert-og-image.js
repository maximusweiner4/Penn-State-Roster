const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function convertSvgToPng() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Set viewport to OG image dimensions
    await page.setViewport({ width: 1200, height: 630 });

    // Read the SVG file
    const svgPath = path.join(__dirname, '..', 'og-image.svg');
    const svgContent = fs.readFileSync(svgPath, 'utf8');

    // Create an HTML page with the SVG
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; }
          body { width: 1200px; height: 630px; }
        </style>
      </head>
      <body>${svgContent}</body>
      </html>
    `;

    await page.setContent(html);

    // Take screenshot
    const outputPath = path.join(__dirname, '..', 'og-image.png');
    await page.screenshot({
      path: outputPath,
      type: 'png',
      clip: { x: 0, y: 0, width: 1200, height: 630 }
    });

    console.log(`PNG saved to ${outputPath}`);
    console.log('Done!');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

convertSvgToPng();
