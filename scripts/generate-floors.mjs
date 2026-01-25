import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, '..', 'public', 'templates', 'floors');

const FLOOR_WIDTH = 1920;
const FLOOR_HEIGHT = 500; // Just the floor portion

// Floor templates - these are placeholders
// Replace with real photographs for production
const floors = [
  {
    name: 'ceramic-light',
    color: '#c8c8c8',
    label: 'Light Ceramic'
  },
  {
    name: 'ceramic-gray',
    color: '#a0a0a0',
    label: 'Gray Ceramic'
  },
  {
    name: 'concrete',
    color: '#909090',
    label: 'Polished Concrete'
  },
  {
    name: 'epoxy-dark',
    color: '#505050',
    label: 'Dark Epoxy'
  },
];

async function generateFloors() {
  await mkdir(outputDir, { recursive: true });

  for (const floor of floors) {
    // Create a simple solid color placeholder
    // USER SHOULD REPLACE THESE WITH REAL FLOOR PHOTOS
    const svg = `
      <svg width="${FLOOR_WIDTH}" height="${FLOOR_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${FLOOR_WIDTH}" height="${FLOOR_HEIGHT}" fill="${floor.color}"/>
        <text x="50%" y="50%" text-anchor="middle" fill="rgba(0,0,0,0.1)" font-size="24" font-family="sans-serif">
          Replace with real ${floor.label} photo
        </text>
      </svg>
    `;

    const buffer = await sharp(Buffer.from(svg))
      .jpeg({ quality: 95 })
      .toBuffer();

    const filePath = join(outputDir, `${floor.name}.jpg`);
    await writeFile(filePath, buffer);
    console.log(`Created: ${floor.name}.jpg`);
  }

  console.log('\n✅ Floor placeholders created!');
  console.log('📁 Location:', outputDir);
  console.log('\n⚠️  Replace these with real dealership floor photographs for production.');
}

generateFloors().catch(console.error);
