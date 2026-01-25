# VehicleStudio

Professional car photo processing with AI background removal and branded templates.

## Features

- 📸 **Mobile-First Camera Capture** - Take photos directly or select from gallery
- 🪄 **AI Background Removal** - Powered by remove.bg API
- 🎨 **Professional Templates** - Studio white, gray, and branded gradient backgrounds
- 🏷️ **Custom Branding** - Add your dealership logo to every photo
- 📥 **High-Quality Export** - 1920x1080 JPG at 88% quality

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env.local` file with:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Remove.bg API Key (get one at https://www.remove.bg/api)
REMOVE_BG_API_KEY=your_remove_bg_api_key
```

### 3. Supabase Setup

Create the following storage buckets in your Supabase project:

1. **`originals`** - Stores original uploaded photos
   - Public: No
   - File size limit: 10MB
   - Allowed mime types: image/jpeg, image/png, image/webp

2. **`outputs`** - Stores processed photos
   - Public: No
   - File size limit: 10MB
   - Allowed mime types: image/jpeg

3. **`logos`** - Stores dealership logos
   - Public: No
   - File size limit: 5MB
   - Allowed mime types: image/png

#### Storage Policies

For each bucket, create the following RLS policies:

**For authenticated users (originals, outputs, logos):**

```sql
-- Allow authenticated users to upload
CREATE POLICY "Allow authenticated uploads" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'bucket_name');

-- Allow authenticated users to read their own files
CREATE POLICY "Allow authenticated reads" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'bucket_name');
```

**For service role operations:**
The service role key bypasses RLS, so the API route can handle all operations.

### 4. Generate Template Backgrounds

```bash
node scripts/generate-templates.mjs
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Sign Up** - Create an account with email/password
2. **Upload Logo** (optional) - Go to Settings and upload your dealership logo (PNG with transparency)
3. **Take Photo** - Use camera or select from gallery
4. **Select Template** - Choose your background style
5. **Process** - Click "Process Photo" to apply AI background removal and compositing
6. **Download** - Get your branded, professional photo

## Tech Stack

- **Next.js 16** - App Router with Server Actions
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Supabase** - Auth & Storage
- **Sharp** - Image processing
- **Remove.bg** - AI background removal

## Project Structure

```
src/
├── app/
│   ├── (protected)/      # Auth-required pages
│   │   ├── upload/       # Photo upload & processing
│   │   ├── settings/     # Logo & template settings
│   │   └── results/[id]/ # Before/after view
│   ├── api/
│   │   └── process/      # Image processing API
│   ├── login/
│   ├── signup/
│   └── page.tsx          # Landing page
├── components/
│   └── BottomNav.tsx
└── lib/
    └── supabase/         # Supabase clients
public/
└── templates/            # Background images
scripts/
└── generate-templates.mjs
```

## License

MIT
