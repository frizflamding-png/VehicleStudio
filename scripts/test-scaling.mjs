import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const EXPORT_WIDTH = 1920;
const TARGET_WIDTH_PCT = 0.68;
const MIN_WIDTH_PCT = 0.58;
const MAX_WIDTH_PCT = 0.78;
const FLOOR_Y_PCT = 0.84;

function finalizeBounds(bounds, width, height) {
  if (!bounds.valid) {
    return { minX: 0, maxX: width - 1, minY: 0, maxY: height - 1, valid: false };
  }
  return bounds;
}

async function analyzeSubjectBounds(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const bufferWidth = meta.width || 2000;
  const bufferHeight = meta.height || 1500;
  const hasAlpha = Boolean(meta.hasAlpha);

  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const totalPixels = width * height;
  let soft = { minX: width, maxX: 0, minY: height, maxY: 0, valid: false };
  let solid = { minX: width, maxX: 0, minY: height, maxY: 0, valid: false };
  let softPixels = 0;
  let solidPixels = 0;

  const bottomBandStart = Math.max(0, height - Math.round(height * 0.02));
  const bottomSoftColumns = new Uint8Array(width);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const alpha = data[idx + 3];
      if (alpha > 20) {
        softPixels++;
        soft.valid = true;
        if (x < soft.minX) soft.minX = x;
        if (x > soft.maxX) soft.maxX = x;
        if (y < soft.minY) soft.minY = y;
        if (y > soft.maxY) soft.maxY = y;
        if (y >= bottomBandStart) bottomSoftColumns[x] = 1;
      }
      if (alpha > 200) {
        solidPixels++;
        solid.valid = true;
        if (x < solid.minX) solid.minX = x;
        if (x > solid.maxX) solid.maxX = x;
        if (y < solid.minY) solid.minY = y;
        if (y > solid.maxY) solid.maxY = y;
      }
    }
  }

  soft = finalizeBounds(soft, width, height);
  solid = finalizeBounds(solid, width, height);
  const softWidth = soft.maxX - soft.minX + 1;
  const softHeight = soft.maxY - soft.minY + 1;
  const softCoverage = softPixels / totalPixels;
  const solidCoverage = solidPixels / totalPixels;
  const softWidthPct = softWidth / width;
  const softHeightPct = softHeight / height;
  const bottomTouchCount = bottomSoftColumns.reduce((sum, value) => sum + value, 0);
  const bottomTouchRatio = width > 0 ? bottomTouchCount / width : 0;

  return {
    bufferWidth,
    bufferHeight,
    hasAlpha,
    soft,
    solid,
    softCoverage,
    solidCoverage,
    softWidthPct,
    softHeightPct,
    bottomTouchRatio,
  };
}

function classifyPhotoMode(analysis) {
  const nearFullFrame = analysis.softWidthPct > 0.95 && analysis.softHeightPct > 0.95;
  const largeCoverage = analysis.softCoverage > 0.9 || analysis.solidCoverage > 0.85;
  const tallSubject = analysis.softHeightPct > 0.75;
  const wideSubject = analysis.softWidthPct > 0.9;
  const heavyBottomTouch = analysis.bottomTouchRatio > 0.6;

  if (!analysis.hasAlpha) return 'interior';
  if (!analysis.soft.valid || !analysis.solid.valid) return 'interior';
  if (nearFullFrame && largeCoverage) return 'interior';
  if (tallSubject || wideSubject || heavyBottomTouch) return 'interior';
  return 'exterior';
}

function computeExteriorWidthPct(analysis) {
  const solidWidth = Math.max(1, analysis.solid.maxX - analysis.solid.minX + 1);
  const solidBottom = Math.max(1, analysis.solid.maxY);
  const baseCanvasWidth = Math.max(EXPORT_WIDTH, Math.round(solidWidth / TARGET_WIDTH_PCT));
  const canvasHeight = Math.round(baseCanvasWidth * (9 / 16));
  let scale = 1;
  let widthPct = solidWidth / baseCanvasWidth;

  if (widthPct < MIN_WIDTH_PCT) {
    scale = MIN_WIDTH_PCT / widthPct;
  } else if (widthPct > MAX_WIDTH_PCT) {
    scale = MAX_WIDTH_PCT / widthPct;
  }

  const floorY = Math.round(canvasHeight * FLOOR_Y_PCT);
  const maxScaleToFit = Math.min(
    baseCanvasWidth / analysis.bufferWidth,
    canvasHeight / analysis.bufferHeight,
    floorY / solidBottom
  );
  scale = Math.min(scale, maxScaleToFit);
  widthPct = (solidWidth * scale) / baseCanvasWidth;

  return { widthPct, scale };
}

function computeInteriorWidthPct(analysis) {
  const softWidth = Math.max(1, analysis.soft.maxX - analysis.soft.minX + 1);
  const baseCanvasWidth = Math.max(EXPORT_WIDTH, Math.round(softWidth / TARGET_WIDTH_PCT));
  const canvasHeight = Math.round(baseCanvasWidth * (9 / 16));
  const availableWidth = baseCanvasWidth * 0.9;
  const availableHeight = canvasHeight * 0.9;
  const scaleToFit = Math.min(availableWidth / softWidth, availableHeight / Math.max(1, analysis.soft.maxY - analysis.soft.minY + 1));
  const maxScaleToFit = Math.min(baseCanvasWidth / analysis.bufferWidth, canvasHeight / analysis.bufferHeight);
  const scale = Math.min(scaleToFit, maxScaleToFit);
  const widthPct = (softWidth * scale) / baseCanvasWidth;
  return { widthPct, scale };
}

const args = process.argv.slice(2);
const defaultSamples = [
  'public/demo/sample-exterior-1.jpg',
  'public/demo/sample-exterior-2.jpg',
  'public/demo/sample-interior-1.jpg',
];

const samples = args.length ? args : defaultSamples;

for (const sample of samples) {
  const filePath = path.resolve(process.cwd(), sample);
  try {
    const buffer = await fs.readFile(filePath);
    const analysis = await analyzeSubjectBounds(buffer);
    const mode = classifyPhotoMode(analysis);
    const metrics = mode === 'exterior' ? computeExteriorWidthPct(analysis) : computeInteriorWidthPct(analysis);
    console.log(`${sample}: mode=${mode} widthPct=${metrics.widthPct.toFixed(3)} scale=${metrics.scale.toFixed(3)}`);
  } catch (err) {
    console.log(`${sample}: skipped (${err instanceof Error ? err.message : 'read error'})`);
  }
}
