import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';

// Final export settings
const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;
const EXPORT_QUALITY = 92;

const LOGO_WIDTH_PERCENT = 0.10;
const TARGET_WIDTH_PCT = 0.82;  // Target car width: 82% of frame (was 68%)
const MIN_WIDTH_PCT = 0.72;     // Minimum: 72% (was 58%)
const MAX_WIDTH_PCT = 0.90;     // Maximum: 90% (was 78%)
const FLOOR_Y_PCT = 0.84;

// Background templates (complete room images)
const BACKGROUND_TEMPLATES = ['showroom-grey'];
const DEFAULT_BACKGROUND = 'showroom-grey';
const USER_BACKGROUND_PREFIX = 'user:';
const USER_BACKGROUNDS_BUCKET = 'user-backgrounds';

// Padding info for remove.bg pre-processing
interface PaddingInfo {
  top: number;
  bottom: number;
  left: number;
  right: number;
  originalWidth: number;
  originalHeight: number;
}

// Add padding to image before remove.bg to give shadow more room
async function padImageForRemoveBg(imageBuffer: Buffer): Promise<{ buffer: Buffer; padding: PaddingInfo }> {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width || 1000;
  const height = meta.height || 1000;
  
  // Minimal padding - just enough to prevent shadow clipping at edges
  const padTop = Math.round(height * 0.02);
  const padBottom = Math.round(height * 0.08); // Extra bottom padding for shadow
  const padLeft = Math.round(width * 0.02);
  const padRight = Math.round(width * 0.02);
  
  const padding: PaddingInfo = {
    top: padTop,
    bottom: padBottom,
    left: padLeft,
    right: padRight,
    originalWidth: width,
    originalHeight: height,
  };
  
  // Extend with neutral gray (remove.bg needs background context)
  const buffer = await sharp(imageBuffer)
    .extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: { r: 128, g: 128, b: 128, alpha: 1 },
    })
    .jpeg({ quality: 95 })
    .toBuffer();
  
  return { buffer, padding };
}

// Crop remove.bg output to remove excess padding, keeping shadow room
async function cropRemoveBgOutput(cutoutBuffer: Buffer, padding: PaddingInfo): Promise<Buffer> {
  const meta = await sharp(cutoutBuffer).metadata();
  const width = meta.width || 1000;
  const height = meta.height || 1000;
  
  // Remove almost all padding, keeping just a bit for shadow bleed
  // Keep minimal top/side padding, keep some bottom for shadow
  const keepTop = Math.round(padding.top * 0.1);    // Keep 10% of top
  const keepBottom = Math.round(padding.bottom * 0.5); // Keep 50% of bottom for shadow
  const keepLeft = Math.round(padding.left * 0.1);  // Keep 10% of left
  const keepRight = Math.round(padding.right * 0.1); // Keep 10% of right
  
  const cropLeft = padding.left - keepLeft;
  const cropTop = padding.top - keepTop;
  const cropWidth = width - (padding.left - keepLeft) - (padding.right - keepRight);
  const cropHeight = height - (padding.top - keepTop) - (padding.bottom - keepBottom);
  
  console.log('[REMOVE_BG] Cropping:', { cropLeft, cropTop, cropWidth, cropHeight, keepBottom });
  
  return sharp(cutoutBuffer)
    .extract({
      left: Math.max(0, cropLeft),
      top: Math.max(0, cropTop),
      width: Math.min(cropWidth, width - cropLeft),
      height: Math.min(cropHeight, height - cropTop),
    })
    .png()
    .toBuffer();
}

// Remove background - preserve FULL original resolution
async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    throw new Error('REMOVE_BG_API_KEY not configured');
  }

  // Add padding to give remove.bg more room for shadows
  const { buffer: paddedBuffer, padding } = await padImageForRemoveBg(imageBuffer);
  console.log('[REMOVE_BG] Padded image size:', paddedBuffer.length);

  const formData = new FormData();
  // Specify MIME type explicitly to ensure remove.bg accepts the file
  const blob = new Blob([new Uint8Array(paddedBuffer)], { type: 'image/jpeg' });
  formData.append('image_file', blob, 'image.jpg');
  formData.append('size', 'full'); // FULL resolution - no downscaling
  formData.append('add_shadow', 'true');
  formData.append('format', 'png'); // PNG for lossless alpha

  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[REMOVE_BG] Error response:', {
      status: response.status,
      error: errorText,
      bufferSize: imageBuffer.length,
    });
    // Check for invalid file type error
    if (errorText.includes('invalid_file_type')) {
      throw new Error('Invalid file type. Please upload a JPG, PNG, WebP, AVIF, or HEIC image.');
    }
    throw new Error(`Remove.bg API error: ${response.status} - ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const rawCutout = Buffer.from(arrayBuffer);
  
  // Crop out the excess padding we added, keeping shadow room
  const croppedCutout = await cropRemoveBgOutput(rawCutout, padding);
  console.log('[REMOVE_BG] Cropped cutout size:', croppedCutout.length);
  
  return croppedCutout;
}

// Analyze car bounding box for simple centering
type PhotoMode = 'exterior' | 'interior';

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  valid: boolean;
}

interface SubjectAnalysis {
  bufferWidth: number;
  bufferHeight: number;
  hasAlpha: boolean;
  soft: Bounds;
  solid: Bounds;
  softCoverage: number;
  solidCoverage: number;
  softWidthPct: number;
  softHeightPct: number;
  bottomTouchRatio: number;
  opaqueRatio: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function finalizeBounds(bounds: Bounds, width: number, height: number) {
  if (!bounds.valid) {
    return { minX: 0, maxX: width - 1, minY: 0, maxY: height - 1, valid: false };
  }
  return bounds;
}

async function analyzeSubjectBounds(imageBuffer: Buffer): Promise<SubjectAnalysis> {
  const meta = await sharp(imageBuffer).metadata();
  const bufferWidth = meta.width || 2000;
  const bufferHeight = meta.height || 1500;
  const hasAlpha = Boolean(meta.hasAlpha);

  try {
    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const totalPixels = width * height;
    let soft: Bounds = { minX: width, maxX: 0, minY: height, maxY: 0, valid: false };
    let solid: Bounds = { minX: width, maxX: 0, minY: height, maxY: 0, valid: false };
    let softPixels = 0;
    let solidPixels = 0;
    let opaquePixels = 0;

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
        if (alpha > 250) {
          opaquePixels++;
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
      bufferWidth: width,
      bufferHeight: height,
      hasAlpha,
      soft,
      solid,
      softCoverage,
      solidCoverage,
      softWidthPct,
      softHeightPct,
      bottomTouchRatio,
      opaqueRatio: opaquePixels / totalPixels,
    };
  } catch {
    return {
      bufferWidth,
      bufferHeight,
      hasAlpha,
      soft: { minX: 0, maxX: bufferWidth - 1, minY: 0, maxY: bufferHeight - 1, valid: false },
      solid: { minX: 0, maxX: bufferWidth - 1, minY: 0, maxY: bufferHeight - 1, valid: false },
      softCoverage: 1,
      solidCoverage: 1,
      softWidthPct: 1,
      softHeightPct: 1,
      bottomTouchRatio: 1,
      opaqueRatio: 1,
    };
  }
}

interface ClassificationResult {
  mode: PhotoMode;
  interiorHint: boolean;
}

/**
 * Classify photo based on PRIMARY SUBJECT, not just presence of interior elements.
 * 
 * EXTERIOR: Exterior body panels visible AND car occupies majority of frame.
 * INTERIOR: Dashboard, steering wheel, seats, or cabin dominate >50% of the image
 *           AND exterior body panels are minimal or not visible.
 * 
 * Studio background is applied by default for exterior images, even if interior
 * is visible through windows. Interior detection is advisory, not blocking.
 */
function classifyPhotoMode(analysis: SubjectAnalysis): ClassificationResult {
  // Advisory hint: detect if some interior-like characteristics are present
  // (high opacity + high coverage could indicate interior elements visible)
  const hasInteriorCharacteristics = analysis.opaqueRatio > 0.85 && analysis.softCoverage > 0.85;
  
  // Only classify as INTERIOR for very clear interior shots:
  // - No alpha channel at all (background removal couldn't separate subject)
  // - Invalid bounds (couldn't detect a distinct subject at all)
  // - Nearly fully opaque (>99.5%) AND fills almost entire frame (>96%)
  //   This catches true interior shots where the cabin fills the entire view
  const fullyOpaque = analysis.opaqueRatio > 0.995;
  const almostFullFrame = analysis.softWidthPct > 0.96 && analysis.softHeightPct > 0.96;
  const extremelyCovered = analysis.softCoverage > 0.99;
  
  // Clear interior: no usable alpha channel
  if (!analysis.hasAlpha) {
    return { mode: 'interior', interiorHint: true };
  }
  
  // Clear interior: couldn't detect any distinct subject bounds
  if (!analysis.soft.valid || !analysis.solid.valid) {
    return { mode: 'interior', interiorHint: true };
  }
  
  // Clear interior: image is almost entirely opaque AND fills nearly the entire frame
  // This is the strict threshold for true interior shots (cabin view)
  if (fullyOpaque && almostFullFrame && extremelyCovered) {
    return { mode: 'interior', interiorHint: true };
  }
  
  // Default to EXTERIOR - studio background will be applied
  // Even if some interior elements are visible (through windows), treat as exterior
  // if the car body is the primary subject
  return { mode: 'exterior', interiorHint: hasInteriorCharacteristics };
}

// Load background template image
async function loadBackgroundImage(templateId: string): Promise<Buffer | null> {
  try {
    const bgPath = path.join(process.cwd(), 'public', 'templates', 'backgrounds', `${templateId}.jpg`);
    return await fs.readFile(bgPath);
  } catch {
    return null;
  }
}

// Create room background from template image
async function createRoomBackground(
  backgroundTemplate: string,
  backgroundBuffer: Buffer | null,
  canvasWidth: number,
  canvasHeight: number
): Promise<Buffer> {
  const bgBuffer = backgroundBuffer ?? await loadBackgroundImage(backgroundTemplate);
  
  if (bgBuffer) {
    // Resize to fit canvas, maintaining aspect ratio with center crop
    return sharp(bgBuffer)
      .resize(canvasWidth, canvasHeight, { 
        fit: 'cover', 
        position: 'center',
        kernel: 'lanczos3' 
      })
      .toBuffer();
  }
  
  // Fallback: plain gray background
  const fallbackSvg = `
    <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${canvasWidth}" height="${canvasHeight}" fill="#e0e0e0"/>
      <rect y="${Math.round(canvasHeight * 0.55)}" width="${canvasWidth}" height="${Math.round(canvasHeight * 0.45)}" fill="#a0a0a0"/>
    </svg>
  `;
  return sharp(Buffer.from(fallbackSvg)).toBuffer();
}

// Debug overlays (dev-only)
const DEBUG_OVERLAY = process.env.NODE_ENV !== 'production' && process.env.PROCESS_DEBUG_OVERLAY === '1';
const DEBUG_MODE = process.env.NODE_ENV !== 'production' && process.env.PROCESS_DEBUG === '1';

// Adjust shadow intensity by modifying alpha values of semi-transparent pixels
async function adjustShadowIntensity(imageBuffer: Buffer, intensity: number): Promise<Buffer> {
  if (intensity >= 100) return imageBuffer; // No adjustment needed
  
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width, height, channels } = info;
  const intensityFactor = intensity / 100;
  
  // Modify alpha values: shadow pixels (low alpha) get reduced more
  for (let i = 0; i < data.length; i += channels) {
    const alpha = data[i + 3];
    // Only adjust semi-transparent pixels (shadows), not fully opaque (car body)
    if (alpha > 0 && alpha < 240) {
      // Scale shadow alpha by intensity factor
      data[i + 3] = Math.round(alpha * intensityFactor);
    }
  }
  
  return sharp(data, { raw: { width, height, channels } })
    .png()
    .toBuffer();
}

// Soften shadow edges by extending shadows with a natural gradient fade
// This fixes hard cut lines from remove.bg
async function softenShadowEdges(buffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width, height, channels } = info;
  const resultData = Buffer.from(data);
  
  const SHADOW_THRESHOLD = 200; // Alpha below this = shadow
  const CAR_THRESHOLD = 230;    // Alpha above this = car body
  const FADE_DISTANCE = 20;     // How far to extend the shadow fade
  
  // Step 1: Find the shadow boundary for each column
  // The "shadow edge" is where shadow pixels suddenly become transparent
  const shadowBottomRow = new Int32Array(width).fill(-1);
  const shadowAlphaAtBottom = new Uint8Array(width);
  
  for (let x = 0; x < width; x++) {
    // Scan from bottom up to find where shadow ends
    for (let y = height - 1; y >= 0; y--) {
      const idx = (y * width + x) * channels;
      const alpha = data[idx + 3];
      
      // Found a shadow pixel
      if (alpha > 5 && alpha < SHADOW_THRESHOLD) {
        shadowBottomRow[x] = y;
        shadowAlphaAtBottom[x] = alpha;
        break;
      }
      // Found car body - stop searching this column
      if (alpha >= CAR_THRESHOLD) {
        break;
      }
    }
  }
  
  // Step 2: Extend shadows downward with gradient fade
  for (let x = 0; x < width; x++) {
    const bottomY = shadowBottomRow[x];
    if (bottomY < 0 || bottomY >= height - 2) continue;
    
    const baseAlpha = shadowAlphaAtBottom[x];
    if (baseAlpha < 10) continue;
    
    // Get the color at the shadow edge
    const baseIdx = (bottomY * width + x) * channels;
    const r = data[baseIdx];
    const g = data[baseIdx + 1];
    const b = data[baseIdx + 2];
    
    // Extend shadow downward with fade
    for (let dy = 1; dy <= FADE_DISTANCE && bottomY + dy < height; dy++) {
      const fadeProgress = dy / FADE_DISTANCE;
      // Smooth ease-out curve for natural fade
      const fadeFactor = 1 - (fadeProgress * fadeProgress);
      const newAlpha = Math.round(baseAlpha * fadeFactor * 0.7);
      
      if (newAlpha < 2) break;
      
      const targetIdx = ((bottomY + dy) * width + x) * channels;
      const existingAlpha = resultData[targetIdx + 3];
      
      // Only extend into transparent areas
      if (existingAlpha < newAlpha) {
        resultData[targetIdx] = r;
        resultData[targetIdx + 1] = g;
        resultData[targetIdx + 2] = b;
        resultData[targetIdx + 3] = newAlpha;
      }
    }
    
    // Also fade the original edge pixel for smoother transition
    const edgeFade = 0.6;
    resultData[baseIdx + 3] = Math.round(baseAlpha * edgeFade);
  }
  
  // Step 3: Apply horizontal blur to smooth the extended shadow
  const BLUR_RADIUS = 8;
  const blurredData = Buffer.from(resultData);
  
  for (let y = 0; y < height; y++) {
    for (let x = BLUR_RADIUS; x < width - BLUR_RADIUS; x++) {
      const idx = (y * width + x) * channels;
      const alpha = resultData[idx + 3];
      
      // Only blur shadow pixels
      if (alpha === 0 || alpha >= SHADOW_THRESHOLD) continue;
      
      let alphaSum = 0;
      let rSum = 0, gSum = 0, bSum = 0;
      let count = 0;
      
      for (let dx = -BLUR_RADIUS; dx <= BLUR_RADIUS; dx++) {
        const ni = (y * width + x + dx) * channels;
        const na = resultData[ni + 3];
        if (na > 0 && na < SHADOW_THRESHOLD) {
          alphaSum += na;
          rSum += resultData[ni];
          gSum += resultData[ni + 1];
          bSum += resultData[ni + 2];
          count++;
        }
      }
      
      if (count > 0) {
        blurredData[idx + 3] = Math.round(alphaSum / count);
        blurredData[idx] = Math.round(rSum / count);
        blurredData[idx + 1] = Math.round(gSum / count);
        blurredData[idx + 2] = Math.round(bSum / count);
      }
    }
  }
  
  // Step 4: Edge feathering for cutout borders
  const featherPx = 8;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const alpha = blurredData[idx + 3];
      
      if (alpha === 0) continue;
      
      const distFromEdge = Math.min(x, width - 1 - x, y, height - 1 - y);
      
      if (distFromEdge < featherPx) {
        const falloff = distFromEdge / featherPx;
        blurredData[idx + 3] = Math.round(alpha * falloff);
      }
    }
  }
  
  return sharp(blurredData, { raw: { width, height, channels } })
    .png()
    .toBuffer();
}

// Pad the cutout buffer to preserve shadows at edges (especially bottom)
async function padCutoutForShadows(cutoutBuffer: Buffer): Promise<{ paddedBuffer: Buffer; padding: { top: number; bottom: number; left: number; right: number } }> {
  const meta = await sharp(cutoutBuffer).metadata();
  const width = meta.width || 1000;
  const height = meta.height || 1000;
  
  // Minimal padding to preserve shadow bleed without making car too small
  // Bottom padding is most important for ground shadows
  const padding = {
    top: Math.round(height * 0.03),      // 3% top
    bottom: Math.round(height * 0.10),   // 10% bottom for ground shadow
    left: Math.round(width * 0.03),      // 3% left
    right: Math.round(width * 0.03),     // 3% right
  };
  
  const newWidth = width + padding.left + padding.right;
  const newHeight = height + padding.top + padding.bottom;
  
  // Soften shadow edges to remove hard cut lines from remove.bg
  const softenedCutout = await softenShadowEdges(cutoutBuffer);
  
  // Create padded canvas with transparent background
  const paddedBuffer = await sharp({
    create: {
      width: newWidth,
      height: newHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: softenedCutout,
      left: padding.left,
      top: padding.top,
    }])
    .png()
    .toBuffer();
  
  return { paddedBuffer, padding };
}

async function compositeImage(
  cutoutBuffer: Buffer,
  backgroundTemplate: string,
  logoBuffer: Buffer | null,
  backgroundBuffer: Buffer | null,
  logoScale: number = LOGO_WIDTH_PERCENT,
  carScale: number = TARGET_WIDTH_PCT,
  shadowIntensity: number = 100,
  isReprocessed: boolean = false
): Promise<{ buffer: Buffer; mode: PhotoMode; interiorHint: boolean }> {
  const analysis = await analyzeSubjectBounds(cutoutBuffer);
  const { mode, interiorHint } = classifyPhotoMode(analysis);

  // Step 0: Adjust shadow intensity if needed
  const shadowAdjustedCutout = await adjustShadowIntensity(cutoutBuffer, shadowIntensity);

  // Step 1: Pad the cutout to ensure shadows aren't clipped
  const { paddedBuffer, padding } = await padCutoutForShadows(shadowAdjustedCutout);
  const paddedMeta = await sharp(paddedBuffer).metadata();
  const paddedWidth = paddedMeta.width || analysis.bufferWidth;
  const paddedHeight = paddedMeta.height || analysis.bufferHeight;

  const soft = {
    minX: analysis.soft.minX + padding.left,
    maxX: analysis.soft.maxX + padding.left,
    minY: analysis.soft.minY + padding.top,
    maxY: analysis.soft.maxY + padding.top,
  };
  const solid = {
    minX: analysis.solid.minX + padding.left,
    maxX: analysis.solid.maxX + padding.left,
    minY: analysis.solid.minY + padding.top,
    maxY: analysis.solid.maxY + padding.top,
  };

  const solidWidth = Math.max(1, solid.maxX - solid.minX + 1);
  const solidHeight = Math.max(1, solid.maxY - solid.minY + 1);
  const solidCenterX = solid.minX + solidWidth / 2;
  const solidBottom = solid.maxY;

  const softWidth = Math.max(1, soft.maxX - soft.minX + 1);
  const softHeight = Math.max(1, soft.maxY - soft.minY + 1);
  const softCenterX = soft.minX + softWidth / 2;
  const softCenterY = soft.minY + softHeight / 2;

  // Use carScale as the target width percentage
  const targetPct = carScale;
  const minPct = Math.max(0.50, targetPct - 0.12); // Allow 12% smaller than target
  const maxPct = isReprocessed ? 0.98 : Math.min(0.95, targetPct + 0.08); // Allow larger for reprocessed

  // For reprocessed images, don't force minimum canvas size - calculate based purely on car
  const baseCanvasWidth = isReprocessed 
    ? Math.round(solidWidth / targetPct)
    : Math.max(EXPORT_WIDTH, Math.round(solidWidth / targetPct));
  const baseCanvasHeight = Math.round(baseCanvasWidth * (9 / 16));
  const canvasWidth = baseCanvasWidth;
  const canvasHeight = baseCanvasHeight;

  let scale = 1;
  let widthPct = solidWidth / canvasWidth;

  if (mode === 'exterior') {
    if (widthPct < minPct) {
      scale = minPct / widthPct;
    } else if (widthPct > maxPct) {
      scale = maxPct / widthPct;
    }

    const floorY = Math.round(canvasHeight * FLOOR_Y_PCT);
    const maxScaleToFit = Math.min(
      canvasWidth / paddedWidth,
      canvasHeight / paddedHeight,
      floorY / solidBottom
    );
    scale = Math.min(scale, maxScaleToFit);
    widthPct = (solidWidth * scale) / canvasWidth;

    if (DEBUG_OVERLAY) {
      console.log('PROCESS DEBUG:', {
        mode,
        widthPct: Number(widthPct.toFixed(3)),
        scale: Number(scale.toFixed(3)),
        hasAlpha: analysis.hasAlpha,
        opaqueRatio: Number(analysis.opaqueRatio.toFixed(3)),
        bboxWidthPct: Number(analysis.softWidthPct.toFixed(3)),
        bboxHeightPct: Number(analysis.softHeightPct.toFixed(3)),
      });
    }

    const scaledWidth = Math.round(paddedWidth * scale);
    const scaledHeight = Math.round(paddedHeight * scale);
    const scaledSolidBottom = solidBottom * scale;
    const scaledSolidCenterX = solidCenterX * scale;

    const floorYClamped = Math.round(canvasHeight * FLOOR_Y_PCT);
    const canvasCenterX = canvasWidth / 2;
    const carLeft = Math.round(canvasCenterX - scaledSolidCenterX);
    const carTop = Math.round(floorYClamped - scaledSolidBottom);

    // Minimum edge margins (5% of canvas width) to prevent cars from appearing to hit walls
    const minEdgeMargin = Math.round(canvasWidth * 0.05);
    
    // Calculate the car's visible edges after positioning
    const scaledSolidLeft = carLeft + (solid.minX * scale);
    const scaledSolidRight = carLeft + (solid.maxX * scale);
    
    // Adjust if car is too close to left or right edges
    let adjustedCarLeft = carLeft;
    if (scaledSolidLeft < minEdgeMargin) {
      adjustedCarLeft = carLeft + (minEdgeMargin - scaledSolidLeft);
    } else if (scaledSolidRight > canvasWidth - minEdgeMargin) {
      adjustedCarLeft = carLeft - (scaledSolidRight - (canvasWidth - minEdgeMargin));
    }

    const clampedLeft = Math.max(0, Math.min(adjustedCarLeft, canvasWidth - scaledWidth));
    const clampedTop = Math.max(0, Math.min(carTop, canvasHeight - scaledHeight));

    const background = await createRoomBackground(backgroundTemplate, backgroundBuffer, canvasWidth, canvasHeight);
    const scaledCutout = scale === 1
      ? paddedBuffer
      : await sharp(paddedBuffer)
          .resize(scaledWidth, scaledHeight, { kernel: 'lanczos3' })
          .toBuffer();

    const composites: sharp.OverlayOptions[] = [
      { input: scaledCutout, left: clampedLeft, top: clampedTop },
    ];

    if (logoBuffer) {
      try {
        const logoTargetWidth = Math.round(canvasWidth * logoScale);
        const logoPadding = Math.round(canvasWidth * 0.012);
        const logoMeta = await sharp(logoBuffer).metadata();
        const logoScaleRatio = logoTargetWidth / (logoMeta.width || 500);
        const logoHeight = Math.round((logoMeta.height || 200) * logoScaleRatio);

        composites.push({
          input: await sharp(logoBuffer)
            .resize(logoTargetWidth, logoHeight, { kernel: 'lanczos3' })
            .toBuffer(),
          left: canvasWidth - logoTargetWidth - logoPadding,
          top: logoPadding, // Top right corner
        });
      } catch (e) {
        console.error('Logo error:', e);
      }
    }

    let composited = await sharp(background).composite(composites).toBuffer();

    if (DEBUG_OVERLAY) {
      const softBox = {
        x: clampedLeft + soft.minX * scale,
        y: clampedTop + soft.minY * scale,
        w: softWidth * scale,
        h: softHeight * scale,
      };
      const solidBox = {
        x: clampedLeft + solid.minX * scale,
        y: clampedTop + solid.minY * scale,
        w: solidWidth * scale,
        h: solidHeight * scale,
      };
      const overlaySvg = `
        <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="${floorYClamped}" x2="${canvasWidth}" y2="${floorYClamped}" stroke="#22c55e" stroke-width="2" stroke-dasharray="6 4"/>
          <rect x="${softBox.x}" y="${softBox.y}" width="${softBox.w}" height="${softBox.h}" fill="none" stroke="#38bdf8" stroke-width="2"/>
          <rect x="${solidBox.x}" y="${solidBox.y}" width="${solidBox.w}" height="${solidBox.h}" fill="none" stroke="#f59e0b" stroke-width="2"/>
        </svg>
      `;
      composited = await sharp(composited)
        .composite([{ input: Buffer.from(overlaySvg), left: 0, top: 0 }])
        .toBuffer();
    }
  
    const finalExport = await sharp(composited)
      .resize(EXPORT_WIDTH, EXPORT_HEIGHT, {
        fit: 'cover',
        position: 'center',
        kernel: 'lanczos3',
      })
      .jpeg({
        quality: EXPORT_QUALITY,
        chromaSubsampling: '4:4:4',
      })
      .toBuffer();

    return { buffer: finalExport, mode, interiorHint };
  }

  // Interior mode: no showroom floor/wall, minimal cropping
  const interiorBackgroundSvg = `
    <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${canvasWidth}" height="${canvasHeight}" fill="#0f172a"/>
    </svg>
  `;
  const interiorBackground = await sharp(Buffer.from(interiorBackgroundSvg)).toBuffer();

  const availableWidth = canvasWidth * 0.9;
  const availableHeight = canvasHeight * 0.9;
  const scaleToFit = Math.min(availableWidth / softWidth, availableHeight / softHeight);
  const maxScaleToFit = Math.min(canvasWidth / paddedWidth, canvasHeight / paddedHeight);
  scale = Math.min(scaleToFit, maxScaleToFit);
  scale = clamp(scale, 0.1, 2);
  widthPct = (softWidth * scale) / canvasWidth;

  if (DEBUG_OVERLAY) {
    console.log('PROCESS DEBUG:', {
      mode,
      widthPct: Number(widthPct.toFixed(3)),
      scale: Number(scale.toFixed(3)),
      hasAlpha: analysis.hasAlpha,
      opaqueRatio: Number(analysis.opaqueRatio.toFixed(3)),
      bboxWidthPct: Number(analysis.softWidthPct.toFixed(3)),
      bboxHeightPct: Number(analysis.softHeightPct.toFixed(3)),
    });
  }

  const scaledWidth = Math.round(paddedWidth * scale);
  const scaledHeight = Math.round(paddedHeight * scale);
  const scaledSoftCenterX = softCenterX * scale;
  const scaledSoftCenterY = softCenterY * scale;
  const canvasCenterX = canvasWidth / 2;
  const canvasCenterY = canvasHeight / 2;
  const carLeft = Math.round(canvasCenterX - scaledSoftCenterX);
  const carTop = Math.round(canvasCenterY - scaledSoftCenterY);
  const clampedLeft = Math.max(0, Math.min(carLeft, canvasWidth - scaledWidth));
  const clampedTop = Math.max(0, Math.min(carTop, canvasHeight - scaledHeight));

  const scaledCutout = scale === 1
    ? paddedBuffer
    : await sharp(paddedBuffer)
        .resize(scaledWidth, scaledHeight, { kernel: 'lanczos3' })
        .toBuffer();

  const composites: sharp.OverlayOptions[] = [
    { input: scaledCutout, left: clampedLeft, top: clampedTop },
  ];

  if (logoBuffer) {
    try {
      const logoTargetWidth = Math.round(canvasWidth * logoScale);
      const logoPadding = Math.round(canvasWidth * 0.012);
      const logoMeta = await sharp(logoBuffer).metadata();
      const logoScaleRatio = logoTargetWidth / (logoMeta.width || 500);
      const logoHeight = Math.round((logoMeta.height || 200) * logoScaleRatio);

      composites.push({
        input: await sharp(logoBuffer)
          .resize(logoTargetWidth, logoHeight, { kernel: 'lanczos3' })
          .toBuffer(),
        left: canvasWidth - logoTargetWidth - logoPadding,
        top: logoPadding, // Top right corner
      });
    } catch (e) {
      console.error('Logo error:', e);
    }
  }

  let composited = await sharp(interiorBackground).composite(composites).toBuffer();

  if (DEBUG_OVERLAY) {
    const softBox = {
      x: clampedLeft + soft.minX * scale,
      y: clampedTop + soft.minY * scale,
      w: softWidth * scale,
      h: softHeight * scale,
    };
    const overlaySvg = `
      <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${softBox.x}" y="${softBox.y}" width="${softBox.w}" height="${softBox.h}" fill="none" stroke="#38bdf8" stroke-width="2"/>
      </svg>
    `;
    composited = await sharp(composited)
      .composite([{ input: Buffer.from(overlaySvg), left: 0, top: 0 }])
      .toBuffer();
  }

  const finalExport = await sharp(composited)
    .resize(EXPORT_WIDTH, EXPORT_HEIGHT, {
      fit: 'cover',
      position: 'center',
      kernel: 'lanczos3',
    })
    .jpeg({
      quality: EXPORT_QUALITY,
      chromaSubsampling: '4:4:4',
    })
    .toBuffer();

  return { buffer: finalExport, mode, interiorHint };
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse form data
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;
    const backgroundTemplate = (formData.get('background') as string) || DEFAULT_BACKGROUND;

    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Validate file type - allow by MIME type OR extension
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.heic', '.heif'];
    const fileExtension = imageFile.name.toLowerCase().slice(imageFile.name.lastIndexOf('.'));
    const isValidType = allowedTypes.includes(imageFile.type) || allowedExtensions.includes(fileExtension);
    
    if (!isValidType) {
      return NextResponse.json({ 
        error: 'Invalid file type. Please upload a JPG, PNG, WebP, AVIF, or HEIC image.' 
      }, { status: 400 });
    }

    // Validate background template or load user background
    let validBackground = DEFAULT_BACKGROUND;
    let userBackgroundBuffer: Buffer | null = null;
    let logoScalePercent = LOGO_WIDTH_PERCENT; // Default 10%
    let carScalePercent = TARGET_WIDTH_PCT; // Default 82%
    let shadowIntensity = 100; // Default 100%
    const adminClient = createAdminClient();

    // Load user's preferences from profile
    try {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('logo_scale, car_scale, shadow_intensity')
        .eq('id', user.id)
        .maybeSingle();
      
      if (profile?.logo_scale) {
        // Convert from percentage (5-20) to decimal (0.05-0.20)
        logoScalePercent = profile.logo_scale / 100;
      }
      if (profile?.car_scale) {
        // Convert from percentage (60-95) to decimal (0.60-0.95)
        carScalePercent = profile.car_scale / 100;
      }
      if (profile?.shadow_intensity !== null && profile?.shadow_intensity !== undefined) {
        shadowIntensity = profile.shadow_intensity;
      }
    } catch {
      // Use default scales
    }

    if (backgroundTemplate.startsWith(USER_BACKGROUND_PREFIX)) {
      const storagePath = backgroundTemplate.replace(USER_BACKGROUND_PREFIX, '');
      if (storagePath.startsWith(`${user.id}/`)) {
        try {
          const { data: bgData, error: bgError } = await adminClient.storage
            .from(USER_BACKGROUNDS_BUCKET)
            .download(storagePath);
          if (!bgError && bgData) {
            const bgArrayBuffer = await bgData.arrayBuffer();
            userBackgroundBuffer = Buffer.from(bgArrayBuffer);
          }
        } catch {
          userBackgroundBuffer = null;
        }
      }
    } else if (BACKGROUND_TEMPLATES.includes(backgroundTemplate)) {
      validBackground = backgroundTemplate;
    }

    const uuid = randomUUID();
    const timestamp = Date.now();
    // Use uuid + timestamp to ensure unique filenames (cache busting)
    const outputId = DEBUG_MODE ? `${uuid}-${timestamp}` : uuid;
    // adminClient already created above
    
    if (DEBUG_MODE) {
      console.log('======= NEW PROCESSING REQUEST =======');
      console.log('UUID:', uuid);
      console.log('Timestamp:', timestamp);
      console.log('Output ID:', outputId);
    }

    // Convert file to buffer
    const arrayBuffer = await imageFile.arrayBuffer();
    let originalBuffer: Buffer = Buffer.from(arrayBuffer);

    // Detect actual file type from magic bytes (don't trust MIME type or extension)
    const detectFileType = (buffer: Buffer): string => {
      if (buffer.length < 12) return 'unknown';
      
      // JPEG: starts with FF D8 FF
      if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'jpeg';
      }
      // PNG: starts with 89 50 4E 47
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'png';
      }
      // WebP: starts with RIFF....WEBP
      if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
          buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return 'webp';
      }
      // AVIF/HEIC/MP4: ftyp container (starts with ....ftyp)
      if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
        return 'avif'; // Treat as AVIF (needs conversion)
      }
      return 'unknown';
    };

    const actualType = detectFileType(originalBuffer);
    console.log('[PROCESS] Detected file type:', actualType, 'from magic bytes');

    // Convert non-standard formats to JPEG for remove.bg compatibility
    const needsConversion = actualType === 'avif' || actualType === 'unknown';
    
    if (needsConversion) {
      try {
        console.log('[PROCESS] Converting to JPEG...');
        originalBuffer = (await sharp(originalBuffer)
          .jpeg({ quality: 95 })
          .toBuffer()) as Buffer;
        console.log('[PROCESS] Conversion successful, new size:', originalBuffer.length);
      } catch (conversionError) {
        console.error('Image conversion error:', conversionError);
        return NextResponse.json({ 
          error: 'Could not process image. The file may be corrupted or in an unsupported format.' 
        }, { status: 400 });
      }
    }

    // Check if image is already processed (exact 1920x1080 dimensions only)
    const originalMeta = await sharp(originalBuffer).metadata();
    const originalWidth = originalMeta.width || 1920;
    const originalHeight = originalMeta.height || 1080;
    // Only detect as reprocessed if EXACTLY our output dimensions
    const is16by9 = originalWidth === 1920 && originalHeight === 1080;
    
    if (is16by9 && DEBUG_MODE) {
      console.log('Detected already-processed image (exactly 1920x1080), preserving car size');
    }

    // Step 1: Upload original to Supabase Storage (use outputId to match output filename)
    const { error: originalUploadError } = await adminClient.storage
      .from('originals')
      .upload(`${outputId}.jpg`, originalBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (originalUploadError) {
      throw new Error(`Failed to upload original: ${originalUploadError.message}`);
    }

    // Step 2: Remove background
    console.log('[PROCESS] Sending to remove.bg:', {
      bufferSize: originalBuffer.length,
      fileType: imageFile.type,
      fileName: imageFile.name,
      firstBytes: originalBuffer.slice(0, 10).toString('hex'),
    });
    const cutoutBuffer = await removeBackground(originalBuffer);

    // Step 3: Get user's logo (if exists)
    let logoBuffer: Buffer | null = null;
    try {
      const { data: logoData, error: logoError } = await adminClient.storage
        .from('logos')
        .download(`${user.id}.png`);

      if (!logoError && logoData) {
        const logoArrayBuffer = await logoData.arrayBuffer();
        logoBuffer = Buffer.from(logoArrayBuffer);
      }
    } catch {
      // No logo - that's fine
    }

    // Step 4: Composite final image
    let effectiveCarScale = carScalePercent;
    console.log('[PROCESS] Car scale from settings:', carScalePercent, 'is16by9:', is16by9);
    
    // If image is already 16:9 (already processed), calculate and preserve car's current scale
    if (is16by9) {
      // Analyze the cutout to get the car's solid width
      const cutoutAnalysis = await analyzeSubjectBounds(cutoutBuffer);
      const carSolidWidth = Math.max(1, cutoutAnalysis.solid.maxX - cutoutAnalysis.solid.minX + 1);
      // Calculate what percentage of the original image the car occupied
      const carPctOfOriginal = carSolidWidth / originalWidth;
      // Use this as the target, ensuring it's within reasonable bounds
      effectiveCarScale = Math.min(0.95, Math.max(0.60, carPctOfOriginal));
      if (DEBUG_MODE) {
        console.log('Reprocessed image:', { carSolidWidth, originalWidth, carPctOfOriginal, effectiveCarScale });
      }
    }
    
    const { buffer: finalBuffer, mode, interiorHint } = await compositeImage(
      cutoutBuffer,
      validBackground,
      logoBuffer,
      userBackgroundBuffer,
      logoScalePercent,
      effectiveCarScale,
      shadowIntensity,
      is16by9
    );

    // Step 5: Upload final to outputs (use outputId for unique filename)
    const { error: outputUploadError } = await adminClient.storage
      .from('outputs')
      .upload(`${outputId}.jpg`, finalBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (outputUploadError) {
      throw new Error(`Failed to upload output: ${outputUploadError.message}`);
    }

    if (DEBUG_MODE) {
      console.log('======= OUTPUT SAVED =======');
      console.log('Filename:', `${outputId}.jpg`);
    }

    return NextResponse.json({ id: outputId, success: true, mode, interiorHint });
  } catch (error) {
    console.error('Processing error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}
