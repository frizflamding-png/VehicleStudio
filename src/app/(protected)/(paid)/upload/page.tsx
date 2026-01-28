 'use client';
 
 import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
 import type { FileObject } from '@supabase/storage-js';
 import { useRouter } from 'next/navigation';
 import Image from 'next/image';
 import Link from 'next/link';
 import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
 
 const BACKGROUNDS = [
   { id: 'showroom-grey', label: 'Showroom Grey', preview: '/templates/backgrounds/showroom-grey.jpg' },
 ];
 const USER_BACKGROUND_PREFIX = 'user:';
 const USER_BACKGROUNDS_BUCKET = 'user-backgrounds';
 
 // Safe localStorage wrapper for private browsing mode
 const safeLocalStorage = {
   getItem: (key: string): string | null => {
     try {
       return localStorage.getItem(key);
     } catch {
       return null;
     }
   },
   setItem: (key: string, value: string): void => {
     try {
       localStorage.setItem(key, value);
     } catch {
       // Ignore errors (e.g., private browsing mode)
     }
   },
 };
 
 type UserBackground = {
   id: string;
   label: string;
   preview: string;
   storagePath: string;
 };
 
 export default function UploadPage() {
   const [preview, setPreview] = useState<string | null>(null);
   const [file, setFile] = useState<File | null>(null);
   const [background, setBackground] = useState('showroom-grey');
   const [processing, setProcessing] = useState(false);
   const [error, setError] = useState('');
   const [dragOver, setDragOver] = useState(false);
   const [userBackgrounds, setUserBackgrounds] = useState<UserBackground[]>([]);
   const fileInputRef = useRef<HTMLInputElement>(null);
   const router = useRouter();
 
   const supabase = useMemo(() => {
     if (!isSupabaseConfigured()) return null;
     return createClient();
   }, []);
 
   const loadUserBackgrounds = useCallback(async () => {
     if (!supabase) return;
     const { data: { user } } = await supabase.auth.getUser();
     if (!user) return;
 
     const { data: profile } = await supabase
       .from('profiles')
       .select('background_id')
       .eq('id', user.id)
       .maybeSingle<{ background_id: string | null }>();
 
     if (profile?.background_id) {
       setBackground(profile.background_id);
       safeLocalStorage.setItem('background', profile.background_id);
     }
 
     const { data: backgroundFiles } = await supabase.storage
       .from(USER_BACKGROUNDS_BUCKET)
       .list(`${user.id}/`, { limit: 100, sortBy: { column: 'name', order: 'asc' } });
 
     if (backgroundFiles && backgroundFiles.length > 0) {
       const signedUrls = await Promise.all(
         backgroundFiles.map(async (file: FileObject) => {
           const path = `${user.id}/${file.name}`;
           const { data: signed } = await supabase.storage
             .from(USER_BACKGROUNDS_BUCKET)
             .createSignedUrl(path, 3600);
           if (!signed?.signedUrl) return null;
           return {
             id: `${USER_BACKGROUND_PREFIX}${path}`,
             label: file.name,
             preview: signed.signedUrl,
             storagePath: path,
           } satisfies UserBackground;
         })
       );
       setUserBackgrounds(signedUrls.filter(Boolean) as UserBackground[]);
     } else {
       setUserBackgrounds([]);
     }
   }, [supabase]);
   useEffect(() => {
     const saved = safeLocalStorage.getItem('background');
     if (saved) setBackground(saved);
     if (supabase) {
       loadUserBackgrounds();
     }
   }, [supabase, loadUserBackgrounds]);
 
   const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     const selectedFile = e.target.files?.[0];
     if (selectedFile) {
       setFile(selectedFile);
       const reader = new FileReader();
       reader.onload = (event) => {
         setPreview(event.target?.result as string);
       };
       reader.readAsDataURL(selectedFile);
       setError('');
     }
   };
 
   const handleDrop = (e: React.DragEvent) => {
     e.preventDefault();
     setDragOver(false);
     const droppedFile = e.dataTransfer.files?.[0];
     if (droppedFile && droppedFile.type.startsWith('image/')) {
       setFile(droppedFile);
       const reader = new FileReader();
       reader.onload = (event) => {
         setPreview(event.target?.result as string);
       };
       reader.readAsDataURL(droppedFile);
       setError('');
     }
   };
 
   const handleProcess = async () => {
     if (!file) return;
     setProcessing(true);
     setError('');
 
     try {
       const formData = new FormData();
       formData.append('image', file);
       formData.append('background', background);
 
       const response = await fetch('/api/process', {
         method: 'POST',
         body: formData,
       });
 
      const data = await response.json();
 
       if (!response.ok) {
         throw new Error(data.error || 'Processing failed');
       }
 
       safeLocalStorage.setItem('background', background);
      const modeParam = data.mode === 'interior' ? '?mode=interior' : '';
      router.push(`/results/${data.id}${modeParam}`);
     } catch (err) {
       setError(err instanceof Error ? err.message : 'An error occurred');
       setProcessing(false);
     }
   };
 
   const clearImage = () => {
     setPreview(null);
     setFile(null);
     if (fileInputRef.current) fileInputRef.current.value = '';
   };
 
   // Determine current step for visual feedback
   const currentStep = !file ? 1 : 3; // Step 2 (background) is always available
   const backgroundLabel = [...BACKGROUNDS, ...userBackgrounds].find(b => b.id === background)?.label;
 
   return (
     <div className="min-h-[calc(100vh-8rem)] lg:min-h-[calc(100vh-6.25rem)]">
       {/* Desktop Layout - High Density */}
       <div className="hidden lg:block">
         <div className="max-w-7xl mx-auto px-5 py-3">
           {/* Compact Header Row */}
           <div className="flex items-center justify-between mb-3">
             <div>
               <h1 className="text-[15px] font-semibold text-white leading-tight">Single Photo</h1>
               <p className="text-xs text-slate-500 leading-tight">Upload · Select template · Process</p>
             </div>
             <p className="text-xs text-slate-500">
               Need bulk? <Link href="/batch" className="text-cyan-500 hover:text-cyan-400">Batch Processing →</Link>
             </p>
           </div>
 
           {/* Main Grid */}
           <div className="grid grid-cols-12 gap-3">
             {/* Left: Preview Area */}
             <div className="col-span-8">
               <div className="bg-slate-900/50 border border-slate-800 rounded overflow-hidden">
                 {/* Preview Header */}
                 <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-800 bg-slate-900/80">
                   <span className="text-xs font-medium text-slate-400">Preview</span>
                   {file && (
                     <div className="flex items-center gap-3">
                       <span className="text-[11px] text-slate-500">{file.name} • {(file.size / 1024 / 1024).toFixed(1)}MB</span>
                       <button onClick={clearImage} className="text-[11px] text-slate-500 hover:text-white">Clear</button>
                     </div>
                   )}
                 </div>
                 
                 {/* Preview Content - Compact aspect ratio */}
                 <div
                   className={`aspect-[16/9] relative ${!preview ? 'cursor-pointer' : ''}`}
                   onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                   onDragLeave={() => setDragOver(false)}
                   onDrop={handleDrop}
                   onClick={() => !preview && fileInputRef.current?.click()}
                 >
                   {preview ? (
                     <Image src={preview} alt="Preview" fill className="object-contain bg-slate-950" />
                   ) : (
                     <div className={`absolute inset-0 flex flex-col items-center justify-center transition-colors ${dragOver ? 'bg-cyan-500/10' : 'bg-slate-950'}`}>
                       <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center mb-2">
                         <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                         </svg>
                       </div>
                       <p className="text-xs text-slate-500">Drop image or click to upload</p>
                       <p className="text-[10px] text-slate-600 mt-0.5">JPG, PNG, WebP, AVIF, HEIC</p>
                     </div>
                   )}
                 </div>
               </div>
             </div>
 
             {/* Right: Controls Sidebar - Compact */}
             <div className="col-span-4 flex flex-col gap-2">
               {/* Step 1: Upload */}
               <div className={`bg-slate-900/50 border rounded overflow-hidden transition-colors ${currentStep === 1 ? 'border-slate-700' : 'border-slate-800'}`}>
                 <div className="px-2.5 py-1.5 border-b border-slate-800 bg-slate-900/80">
                   <div className="flex items-center gap-2">
                     <span className="text-[10px] text-slate-600 font-medium">1.</span>
                     <span className="text-xs font-medium text-slate-400">Upload photo</span>
                     {file && <svg className="w-3 h-3 text-emerald-500 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                   </div>
                 </div>
                 <div className="p-2">
                   <button
                     onClick={() => fileInputRef.current?.click()}
                     className="w-full px-2 py-1.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 rounded text-xs font-medium text-slate-300 transition-colors flex items-center justify-center gap-1.5"
                   >
                     <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                     </svg>
                     {file ? 'Change photo' : 'Select photo'}
                   </button>
                   <input
                     ref={fileInputRef}
                     type="file"
                     accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
                     onChange={handleFileChange}
                     className="hidden"
                   />
                 </div>
               </div>
 
               {/* Step 2: Background Template */}
               <div className="bg-slate-900/50 border border-slate-800 rounded overflow-hidden">
                 <div className="px-2.5 py-1.5 border-b border-slate-800 bg-slate-900/80">
                   <div className="flex items-center gap-2">
                     <span className="text-[10px] text-slate-600 font-medium">2.</span>
                     <span className="text-xs font-medium text-slate-400">Select background</span>
                     <svg className="w-3 h-3 text-emerald-500 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                   </div>
                 </div>
                 <div className="p-2">
                   <div className="space-y-2">
                     <div>
                       <p className="text-[10px] text-slate-600 mb-1">Built-in</p>
                       <div className="grid grid-cols-2 gap-1.5">
                         {BACKGROUNDS.map((bg) => (
                           <button
                             key={bg.id}
                             onClick={() => { setBackground(bg.id); safeLocalStorage.setItem('background', bg.id); }}
                             className={`relative aspect-video rounded overflow-hidden border transition-all ${
                               background === bg.id ? 'border-cyan-500' : 'border-slate-700 hover:border-slate-600'
                             }`}
                           >
                             <Image src={bg.preview} alt={bg.label} fill className="object-cover" />
                           </button>
                         ))}
                       </div>
                     </div>
                     {userBackgrounds.length > 0 && (
                       <div>
                         <p className="text-[10px] text-slate-600 mb-1">Your backgrounds</p>
                         <div className="grid grid-cols-2 gap-1.5">
                           {userBackgrounds.map((bg) => (
                             <button
                               key={bg.id}
                               onClick={() => { setBackground(bg.id); safeLocalStorage.setItem('background', bg.id); }}
                               className={`relative aspect-video rounded overflow-hidden border transition-all ${
                                 background === bg.id ? 'border-cyan-500' : 'border-slate-700 hover:border-slate-600'
                               }`}
                             >
                               <Image src={bg.preview} alt={bg.label} fill className="object-cover" />
                             </button>
                           ))}
                         </div>
                       </div>
                     )}
                   </div>
                   {backgroundLabel && (
                     <p className="text-[10px] text-slate-600 mt-1.5 leading-tight">{backgroundLabel}</p>
                   )}
                 </div>
               </div>
 
               {/* Error */}
               {error && (
                 <div className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 rounded text-[11px] text-red-400 leading-tight">
                   {error}
                 </div>
               )}
 
               {/* Step 3: Primary CTA - Process Button */}
               <div className={`bg-slate-900/50 border rounded overflow-hidden transition-colors ${currentStep === 3 ? 'border-slate-700' : 'border-slate-800'}`}>
                 <div className="px-2.5 py-1.5 border-b border-slate-800 bg-slate-900/80">
                   <div className="flex items-center gap-2">
                     <span className="text-[10px] text-slate-600 font-medium">3.</span>
                     <span className="text-xs font-medium text-slate-400">Process & download</span>
                   </div>
                 </div>
                 <div className="p-2">
                   <button
                     onClick={handleProcess}
                     disabled={processing || !file}
                     className={`group relative w-full px-3 py-2.5 rounded text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                       processing || !file
                         ? 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-700/50'
                         : 'bg-[#1FB6A6] text-white hover:bg-[#22C6B5] active:bg-[#179E90]'
                     }`}
                   >
                     {processing ? 'Processing...' : 'Process Photo'}
                   </button>
                   {!file && (
                     <p className="text-[10px] text-slate-600 mt-1.5 text-center">Upload a photo to continue</p>
                   )}
                 </div>
               </div>
             </div>
           </div>
         </div>
       </div>
 
       {/* Mobile Layout - Unchanged */}
       <div className="lg:hidden px-4 py-6 pb-20">
         <h1 className="text-lg font-semibold mb-4">Single Photo</h1>
         
         <div
           className={`aspect-video bg-slate-900 border border-slate-800 rounded-lg overflow-hidden relative mb-4 ${!preview ? 'cursor-pointer' : ''}`}
           onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
           onDragLeave={() => setDragOver(false)}
           onDrop={handleDrop}
           onClick={() => !preview && fileInputRef.current?.click()}
         >
           {preview ? (
             <>
               <Image src={preview} alt="Preview" fill className="object-contain" />
               <button
                 onClick={(e) => { e.stopPropagation(); clearImage(); }}
                 className="absolute top-2 right-2 w-8 h-8 bg-black/60 rounded flex items-center justify-center"
               >
                 <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                 </svg>
               </button>
             </>
           ) : (
             <div className="absolute inset-0 flex flex-col items-center justify-center">
               <svg className="w-10 h-10 text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
               </svg>
               <p className="text-sm text-slate-500">Tap to upload</p>
             </div>
           )}
         </div>
 
         <button
           onClick={() => fileInputRef.current?.click()}
           className="w-full py-3 bg-slate-800 border border-slate-700 rounded-lg text-sm font-medium mb-4"
         >
           Select Photo
         </button>
 
         <div className="mb-4">
           <p className="text-sm text-slate-400 mb-2">Background</p>
           <div className="flex gap-2 mb-2">
             {BACKGROUNDS.map((bg) => (
               <button
                 key={bg.id}
                 onClick={() => { setBackground(bg.id); localStorage.setItem('background', bg.id); }}
                 className={`w-16 h-10 rounded overflow-hidden border-2 ${
                   background === bg.id ? 'border-cyan-500' : 'border-slate-700'
                 }`}
               >
                 <Image src={bg.preview} alt={bg.label} width={64} height={40} className="object-cover w-full h-full" />
               </button>
             ))}
           </div>
           {userBackgrounds.length > 0 && (
             <>
               <p className="text-xs text-slate-500 mb-2">Your backgrounds</p>
               <div className="flex gap-2">
                 {userBackgrounds.map((bg) => (
                   <button
                     key={bg.id}
                     onClick={() => { setBackground(bg.id); localStorage.setItem('background', bg.id); }}
                     className={`w-16 h-10 rounded overflow-hidden border-2 ${
                       background === bg.id ? 'border-cyan-500' : 'border-slate-700'
                     }`}
                   >
                     <Image src={bg.preview} alt={bg.label} width={64} height={40} className="object-cover w-full h-full" />
                   </button>
                 ))}
               </div>
             </>
           )}
         </div>
 
         {error && (
           <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400 mb-4">
             {error}
           </div>
         )}
 
         <button
           onClick={handleProcess}
           disabled={processing || !file}
           className={`w-full py-3.5 rounded-lg text-sm font-medium ${
             processing || !file 
               ? 'bg-slate-800 text-slate-500' 
               : 'bg-[#1FB6A6] text-white'
           }`}
         >
           {processing ? 'Processing...' : 'Process Photo'}
         </button>
       </div>
     </div>
   );
 }
