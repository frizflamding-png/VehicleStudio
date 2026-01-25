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
const CAR_WIDTH_PERCENT = 0.82; // Car occupies 82% of canvas width

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
interface CarAnalysis {
  // Bounding box of solid car pixels (alpha > 200)
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  // Buffer dimensions
  bufferWidth: number;
  bufferHeight: number;
}

async function analyzeCarPosition(imageBuffer: Buffer): Promise<CarAnalysis> {
  const meta = await sharp(imageBuffer).metadata();
  const bufferWidth = meta.width || 2000;
  const bufferHeight = meta.height || 1500;
  
  try {
    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    
    // Find bounding box of solid pixels (alpha > 200)
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        if (data[idx + 3] > 200) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    
    return { minX, maxX, minY, maxY, bufferWidth: width, bufferHeight: height };
  } catch {
    return { 
      minX: 0, 
      maxX: bufferWidth, 
      minY: 0, 
      maxY: bufferHeight,
      bufferWidth, 
      bufferHeight 
    };
  }
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

// ===== DEBUG MODE - SET TO FALSE FOR PRODUCTION =====
const DEBUG_MODE = false;
// ====================================================

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
): Promise<Buffer> {
  // Step 1: Pad the cutout to ensure shadows aren't clipped
  const { paddedBuffer, padding } = await padCutoutForShadows(cutoutBuffer);
  
  // Get car bounding box within the PADDED buffer
  const { minX, maxX, minY, maxY, bufferWidth, bufferHeight } = await analyzeCarPosition(paddedBuffer);
  
  // Car bounding box measurements (adjusted for padding)
  const carWidth = maxX - minX;
  const carCenterX = minX + carWidth / 2;  // Horizontal center of car in buffer
  const carBottom = maxY;                   // Bottom of car (tires) in buffer
  
  // Canvas MUST be exactly 16:9 to match export dimensions (no stretching)
  // Calculate canvas size based on car width, but ensure 16:9 aspect
  const canvasWidth = Math.round(bufferWidth / CAR_WIDTH_PERCENT);
  const canvasHeight = Math.round(canvasWidth * (9 / 16)); // EXACT 16:9 aspect
  
  // Shadow area below the solid car pixels (contains ground shadow from remove.bg)
  const shadowAreaBelow = bufferHeight - maxY;
  
  // Where tires should sit on canvas (82% down)
  const targetFloorPercent = 0.82;
  
  // Calculate required canvas height:
  // - Car bottom (tires) at 82% of canvas
  // - Need room below for shadow: floorY + shadowAreaBelow
  // - Need room above for car top: carBottom pixels above floorY
  const minHeightForShadow = Math.round((carBottom / targetFloorPercent) + shadowAreaBelow + 50);
  
  let finalCanvasWidth = canvasWidth;
  let finalCanvasHeight = Math.max(canvasHeight, minHeightForShadow);
  
  // Maintain 16:9 aspect ratio
  if (finalCanvasHeight > canvasHeight) {
    finalCanvasWidth = Math.round(finalCanvasHeight * (16 / 9));
  }
  
  // Final floor position
  const floorY = Math.round(finalCanvasHeight * targetFloorPercent);
  
  // HORIZONTAL: Center the car's bounding box center on the canvas center
  const canvasCenterX = finalCanvasWidth / 2;
  const carLeft = Math.round(canvasCenterX - carCenterX);
  
  // VERTICAL: Position so car bottom (tires) sits at floorY
  // Shadow extends below this point and will be fully visible
  const carTop = floorY - carBottom;
  
  // Clamp positions to valid ranges (must be >= 0 for sharp.composite)
  let clampedCarLeft = Math.max(0, Math.min(carLeft, finalCanvasWidth - bufferWidth));
  let clampedCarTop = Math.max(0, carTop); // Ensure non-negative
  
  // If carTop was clamped to 0, we need a taller canvas to fit everything
  if (carTop < 0) {
    // Recalculate with more height
    const extraHeightNeeded = Math.abs(carTop) + 50;
    finalCanvasHeight += extraHeightNeeded;
    finalCanvasWidth = Math.round(finalCanvasHeight * (16 / 9));
    // Recalculate floor position
    const newFloorY = Math.round(finalCanvasHeight * targetFloorPercent);
    clampedCarTop = newFloorY - carBottom;
    clampedCarTop = Math.max(0, clampedCarTop);
  }
  
  // ===== DEBUG MODE =====
  if (DEBUG_MODE) {
    console.log('======= DEBUG MODE ENABLED =======');
    console.log('Padding: top=%d bottom=%d left=%d right=%d', padding.top, padding.bottom, padding.left, padding.right);
    console.log('Padded buffer: %d x %d', bufferWidth, bufferHeight);
    console.log('Bounding box: minX=%d maxX=%d minY=%d maxY=%d', minX, maxX, minY, maxY);
    console.log('Shadow area below car: %d px', shadowAreaBelow);
    console.log('Car center in buffer: %d, Car bottom: %d', carCenterX, carBottom);
    console.log('Canvas: %d x %d (16:9), floorY: %d', finalCanvasWidth, finalCanvasHeight, floorY);
    console.log('Computed: carLeft=%d carTop=%d', carLeft, carTop);
    console.log('Clamped: left=%d top=%d', clampedCarLeft, clampedCarTop);
  }
  // ======================
  
  // Create background at canvas size (always 16:9)
  const background = await createRoomBackground(backgroundTemplate, backgroundBuffer, finalCanvasWidth, finalCanvasHeight);

  // Build composites array (use padded buffer to preserve shadows)
  const composites: sharp.OverlayOptions[] = [
    {
      input: paddedBuffer,
      left: clampedCarLeft,
      top: clampedCarTop,
    },
  ];

  // Add logo if available
  if (logoBuffer) {
    try {
      const logoTargetWidth = Math.round(finalCanvasWidth * LOGO_WIDTH_PERCENT);
      const logoPadding = Math.round(finalCanvasWidth * 0.012);
      const logoMeta = await sharp(logoBuffer).metadata();
      const logoScale = logoTargetWidth / (logoMeta.width || 500);
      const logoHeight = Math.round((logoMeta.height || 200) * logoScale);

      composites.push({
        input: await sharp(logoBuffer)
          .resize(logoTargetWidth, logoHeight, { kernel: 'lanczos3' })
          .toBuffer(),
        left: finalCanvasWidth - logoTargetWidth - logoPadding,
        top: finalCanvasHeight - logoHeight - logoPadding,
      });
    } catch (e) {
      console.error('Logo error:', e);
    }
  }

  // Composite car and logo
  let composited = await sharp(background)
    .composite(composites)
    .toBuffer();
  
  // ===== DEBUG: Add visible text overlay =====
  if (DEBUG_MODE) {
    const timestamp = new Date().toISOString();
    const debugId = Math.random().toString(36).substring(2, 8);
    const debugText = `DEBUG: left=${clampedCarLeft} top=${clampedCarTop} | ${debugId} | ${timestamp}`;
    
    const textSvg = `
      <svg width="${finalCanvasWidth}" height="${finalCanvasHeight}">
        <rect x="10" y="10" width="${finalCanvasWidth - 20}" height="80" fill="rgba(255,0,0,0.8)" rx="10"/>
        <text x="30" y="60" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="white">
          ${debugText}
        </text>
      </svg>
    `;
    
    composited = await sharp(composited)
      .composite([{ input: Buffer.from(debugText.length > 0 ? textSvg : textSvg), top: 0, left: 0 }])
      .toBuffer();
      
    console.log('DEBUG TEXT:', debugText);
  }
  // ==========================================
  
  // Final resize + export (use 'cover' to maintain aspect ratio, never stretch)
  const finalExport = await sharp(composited)
    .resize(EXPORT_WIDTH, EXPORT_HEIGHT, {
      fit: 'cover',      // Maintains aspect ratio, crops if needed
      position: 'center', // Center crop
      kernel: 'lanczos3'
    })
    .jpeg({ 
      quality: EXPORT_QUALITY,
      chromaSubsampling: '4:4:4'
    })
    .toBuffer();

  return finalExport;
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
    const finalBuffer = await compositeImage(cutoutBuffer, validBackground, logoBuffer, userBackgroundBuffer);

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

    return NextResponse.json({ id: outputId, success: true });
  } catch (error) {
    console.error('Processing error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}
