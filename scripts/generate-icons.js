// scripts/generate-icons.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

fs.mkdirSync(path.join(__dirname, '..', 'icons'), { recursive: true });

const sizes = [16, 48, 128];

for (const size of sizes) {
  const mflSize  = Math.round(size * 0.36);
  const esSize   = Math.round(size * 0.30);
  const rx       = Math.round(size * 0.2);
  const esX      = size - Math.round(size * 0.1);
  const esY      = size - Math.round(size * 0.1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="#0f1923"/>
  <text x="50%" y="50%" font-family="Arial Black, Arial, sans-serif"
        font-size="${mflSize}" font-weight="900" fill="#ffffff"
        text-anchor="middle" dominant-baseline="middle">MFL</text>
  <text x="${esX}" y="${esY}" font-family="Arial Black, Arial, sans-serif"
        font-size="${esSize}" font-weight="900" fill="#a3e635"
        text-anchor="end" dominant-baseline="auto">ES</text>
</svg>`;

  sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(__dirname, '..', 'icons', `${size}.png`))
    .then(() => console.log(`icons/${size}.png ✓`));
}
