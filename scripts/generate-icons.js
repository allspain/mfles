// scripts/generate-icons.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

fs.mkdirSync(path.join(__dirname, '..', 'icons'), { recursive: true });

const sizes = [16, 48, 128];

for (const size of sizes) {
  const fontSize = Math.round(size * 0.38);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="#111827"/>
  <text x="50%" y="54%" font-family="Arial Black, Arial, sans-serif"
        font-size="${fontSize}" font-weight="900" fill="#a3e635"
        text-anchor="middle" dominant-baseline="middle">MFL</text>
</svg>`;

  sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(__dirname, '..', 'icons', `${size}.png`))
    .then(() => console.log(`icons/${size}.png ✓`));
}
