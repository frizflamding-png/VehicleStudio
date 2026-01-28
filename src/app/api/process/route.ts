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
const TARGET_WIDTH_PCT = 0.68;
const MIN_WIDTH_PCT = 0.58;
const MAX_WIDTH_PCT = 0.78;
const FLOOR_Y_PCT = 0.84;

// Background templates (complete room images)
const BACKGROUND_TEMPLATES = ['showroom-grey'];
const DEFAULT_BACKGROUND = 'showroom-grey';
const USER_BACKGROUND_PREFIX = 'user:';
const USER_BACKGROUNDS_BUCKET = 'user-backgrounds';

// Remove background - preserve FULL original resolution
async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    throw new Error('REMOVE_BG_API_KEY not configured');
  }

  const formData = new FormData();
  formData.append('image_file', new Blob([new Uint8Array(imageBuffer)]), 'image.jpg');
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
    throw new Error(`Remove.bg API error: ${response.status} - ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
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
    };
  }
}

function classifyPhotoMode(analysis: SubjectAnalysis): PhotoMode {
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

// Pad the cutout buffer to preserve shadows at edges (especially bottom)
async function padCutoutForShadows(cutoutBuffer: Buffer): Promise<{ paddedBuffer: Buffer; padding: { top: number; bottom: number; left: number; right: number } }> {
  const meta = await sharp(cutoutBuffer).metadata();
  const width = meta.width || 1000;
  const height = meta.height || 1000;
  
  // Add generous padding to preserve any shadow bleed
  // Bottom padding is most important for ground shadows
  const padding = {
    top: Math.round(height * 0.05),      // 5% top
    bottom: Math.round(height * 0.15),   // 15% bottom (for ground shadow)
    left: Math.round(width * 0.05),      // 5% left
    right: Math.round(width * 0.05),     // 5% right
  };
  
  const newWidth = width + padding.left + padding.right;
  const newHeight = height + padding.top + padding.bottom;
  
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
      input: cutoutBuffer,
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
  backgroundBuffer: Buffer | null
): Promise<{ buffer: Buffer; mode: PhotoMode }> {
  const analysis = await analyzeSubjectBounds(cutoutBuffer);
  const mode = classifyPhotoMode(analysis);

  // Step 1: Pad the cutout to ensure shadows aren't clipped
  const { paddedBuffer, padding } = await padCutoutForShadows(cutoutBuffer);
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

  const baseCanvasWidth = Math.max(EXPORT_WIDTH, Math.round(solidWidth / TARGET_WIDTH_PCT));
  const baseCanvasHeight = Math.round(baseCanvasWidth * (9 / 16));
  const canvasWidth = baseCanvasWidth;
  const canvasHeight = baseCanvasHeight;

  let scale = 1;
  let widthPct = solidWidth / canvasWidth;

  if (mode === 'exterior') {
    if (widthPct < MIN_WIDTH_PCT) {
      scale = MIN_WIDTH_PCT / widthPct;
    } else if (widthPct > MAX_WIDTH_PCT) {
      scale = MAX_WIDTH_PCT / widthPct;
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

    const clampedLeft = Math.max(0, Math.min(carLeft, canvasWidth - scaledWidth));
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
        const logoTargetWidth = Math.round(canvasWidth * LOGO_WIDTH_PERCENT);
        const logoPadding = Math.round(canvasWidth * 0.012);
        const logoMeta = await sharp(logoBuffer).metadata();
        const logoScale = logoTargetWidth / (logoMeta.width || 500);
        const logoHeight = Math.round((logoMeta.height || 200) * logoScale);

        composites.push({
          input: await sharp(logoBuffer)
            .resize(logoTargetWidth, logoHeight, { kernel: 'lanczos3' })
            .toBuffer(),
          left: canvasWidth - logoTargetWidth - logoPadding,
          top: canvasHeight - logoHeight - logoPadding,
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

    return { buffer: finalExport, mode };
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
      const logoTargetWidth = Math.round(canvasWidth * LOGO_WIDTH_PERCENT);
      const logoPadding = Math.round(canvasWidth * 0.012);
      const logoMeta = await sharp(logoBuffer).metadata();
      const logoScale = logoTargetWidth / (logoMeta.width || 500);
      const logoHeight = Math.round((logoMeta.height || 200) * logoScale);

      composites.push({
        input: await sharp(logoBuffer)
          .resize(logoTargetWidth, logoHeight, { kernel: 'lanczos3' })
          .toBuffer(),
        left: canvasWidth - logoTargetWidth - logoPadding,
        top: canvasHeight - logoHeight - logoPadding,
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

  return { buffer: finalExport, mode };
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

    // Validate file type - only allow images
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif'];
    if (!allowedTypes.includes(imageFile.type)) {
      return NextResponse.json({ 
        error: 'Invalid file type. Please upload a JPG, PNG, WebP, or AVIF image.' 
      }, { status: 400 });
    }

    // Validate background template or load user background
    let validBackground = DEFAULT_BACKGROUND;
    let userBackgroundBuffer: Buffer | null = null;
    const adminClient = createAdminClient();

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

    // Convert AVIF/HEIC to JPEG for remove.bg compatibility
    const needsConversion = ['image/avif', 'image/heic', 'image/heif'].includes(imageFile.type);
    if (needsConversion) {
      originalBuffer = (await sharp(originalBuffer)
        .jpeg({ quality: 95 })
        .toBuffer()) as Buffer;
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
    const { buffer: finalBuffer, mode } = await compositeImage(
      cutoutBuffer,
      validBackground,
      logoBuffer,
      userBackgroundBuffer
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

    return NextResponse.json({ id: outputId, success: true, mode });
  } catch (error) {
    console.error('Processing error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}
