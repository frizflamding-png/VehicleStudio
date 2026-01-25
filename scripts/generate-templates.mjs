import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WIDTH = 1920;
const HEIGHT = 1080;

async function generateStudioWhite() {
  // Create a clean white studio background with subtle gradient and floor reflection
  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#ffffff"/>
          <stop offset="40%" style="stop-color:#fafafa"/>
          <stop offset="100%" style="stop-color:#e8e8e8"/>
        </linearGradient>
        <linearGradient id="floor" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#e0e0e0"/>
          <stop offset="100%" style="stop-color:#d0d0d0"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
      <ellipse cx="${WIDTH/2}" cy="${HEIGHT}" rx="${WIDTH * 0.6}" ry="${HEIGHT * 0.15}" fill="url(#floor)" opacity="0.5"/>
    </svg>
  `;
  
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 95 })
    .toFile(path.join(__dirname, '..', 'public', 'templates', 'studio-white.jpg'));
  
  console.log('Generated studio-white.jpg');
}

async function generateStudioGray() {
  // Create a dramatic gray studio background with spotlight effect
  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="spotlight" cx="50%" cy="30%" r="70%">
          <stop offset="0%" style="stop-color:#5a5a5a"/>
          <stop offset="50%" style="stop-color:#3a3a3a"/>
          <stop offset="100%" style="stop-color:#1a1a1a"/>
        </radialGradient>
        <linearGradient id="floor2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#2a2a2a"/>
          <stop offset="100%" style="stop-color:#1a1a1a"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#spotlight)"/>
      <ellipse cx="${WIDTH/2}" cy="${HEIGHT}" rx="${WIDTH * 0.7}" ry="${HEIGHT * 0.2}" fill="url(#floor2)" opacity="0.7"/>
    </svg>
  `;
  
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 95 })
    .toFile(path.join(__dirname, '..', 'public', 'templates', 'studio-gray.jpg'));
  
  console.log('Generated studio-gray.jpg');
}

async function generateBrandedGradient() {
  // Create a premium gradient background with subtle noise texture feel
  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0f172a"/>
          <stop offset="30%" style="stop-color:#1e3a5f"/>
          <stop offset="70%" style="stop-color:#0c4a6e"/>
          <stop offset="100%" style="stop-color:#0f172a"/>
        </linearGradient>
        <radialGradient id="glow1" cx="20%" cy="30%" r="40%">
          <stop offset="0%" style="stop-color:#06b6d4;stop-opacity:0.15"/>
          <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:0"/>
        </radialGradient>
        <radialGradient id="glow2" cx="80%" cy="70%" r="50%">
          <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0.1"/>
          <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:0"/>
        </radialGradient>
        <linearGradient id="floor3" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#0a2540"/>
          <stop offset="100%" style="stop-color:#071a2e"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#gradient)"/>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow1)"/>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow2)"/>
      <ellipse cx="${WIDTH/2}" cy="${HEIGHT}" rx="${WIDTH * 0.6}" ry="${HEIGHT * 0.18}" fill="url(#floor3)" opacity="0.6"/>
    </svg>
  `;
  
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 95 })
    .toFile(path.join(__dirname, '..', 'public', 'templates', 'branded-gradient.jpg'));
  
  console.log('Generated branded-gradient.jpg');
}

async function main() {
  console.log('Generating template backgrounds...\n');
  
  await generateStudioWhite();
  await generateStudioGray();
  await generateBrandedGradient();
  
  console.log('\nAll templates generated successfully!');
}

main().catch(console.error);
