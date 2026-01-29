 'use client';
 
import { useState, useEffect, use, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
 
 interface ResultData {
   originalUrl: string;
   outputUrl: string;
 }
 
 export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
   const { id } = use(params);
   const [data, setData] = useState<ResultData | null>(null);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'after' | 'before' | 'compare'>('after');
  const [downloading, setDownloading] = useState(false);
  const searchParams = useSearchParams();
  const isInterior = searchParams.get('mode') === 'interior';
  const hasInteriorHint = searchParams.get('interiorHint') === '1';
   
   // Memoize Supabase client to prevent recreation on every render
   const supabase = useMemo(() => createClient(), []);
 
   const loadResult = useCallback(async () => {
     try {
       // Get signed URLs for both original and output
       const [originalResult, outputResult] = await Promise.all([
         supabase.storage.from('originals').createSignedUrl(`${id}.jpg`, 3600),
         supabase.storage.from('outputs').createSignedUrl(`${id}.jpg`, 3600),
       ]);
 
       if (originalResult.error || outputResult.error) {
         throw new Error('Failed to load images');
       }
 
       setData({
         originalUrl: originalResult.data.signedUrl,
         outputUrl: outputResult.data.signedUrl,
       });
     } catch (err) {
       setError(err instanceof Error ? err.message : 'Failed to load result');
     } finally {
       setLoading(false);
     }
   }, [id, supabase]);
 
   useEffect(() => {
     loadResult();
   }, [loadResult]);
 
   const handleDownload = async () => {
     if (!data?.outputUrl) return;
     
     setDownloading(true);
     try {
       const response = await fetch(data.outputUrl);
       const blob = await response.blob();
       const url = window.URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = url;
       a.download = `dealer-photo-${id}.jpg`;
       document.body.appendChild(a);
       a.click();
       window.URL.revokeObjectURL(url);
       document.body.removeChild(a);
     } catch {
       setError('Download failed');
     } finally {
       setDownloading(false);
     }
   };
 
   if (loading) {
     return (
       <main className="page-container flex items-center justify-center">
         <div className="text-center">
           <svg className="animate-spin h-12 w-12 text-cyan-500 mx-auto mb-4" viewBox="0 0 24 24">
             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
           </svg>
           <p className="text-slate-400">Loading result...</p>
         </div>
       </main>
     );
   }
 
   if (error || !data) {
     return (
       <main className="page-container flex items-center justify-center">
         <div className="text-center card max-w-sm">
           <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
             <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
             </svg>
           </div>
           <h2 className="text-xl font-semibold mb-2">Unable to Load</h2>
           <p className="text-slate-400 text-sm mb-6">{error || 'Result not found'}</p>
           <Link href="/studio" className="btn-primary">
             Back to Studio
           </Link>
         </div>
       </main>
     );
   }
 
  return (
    <main className="min-h-[calc(100vh-8rem)] lg:min-h-[calc(100vh-6.25rem)]">
      <div className="max-w-7xl mx-auto px-4 lg:px-5 py-6 lg:py-3">
        {/* Header */}
        <div className="mb-4 lg:mb-3">
          <h1 className="text-lg font-semibold text-white">Result</h1>
          <p className="text-xs text-slate-500">Review and download your processed photo.</p>
        </div>

        <div className="grid grid-cols-12 gap-4 lg:gap-3">
          {/* Preview */}
          <div className="col-span-12 lg:col-span-8">
            <div className="bg-slate-900/50 border border-slate-800 rounded overflow-hidden">
              <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-800 bg-slate-900/80">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-400">Preview</span>
                  <span className="text-[10px] text-slate-500">
                    {viewMode === 'before' ? 'Before' : viewMode === 'compare' ? 'Compare' : 'After'}
                  </span>
                </div>
                <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/60 p-0.5 text-[11px]">
                  <button
                    onClick={() => setViewMode('after')}
                    className={`px-2 py-1 rounded ${
                      viewMode === 'after'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-500 hover:text-slate-200'
                    }`}
                  >
                    After
                  </button>
                  <button
                    onClick={() => setViewMode('before')}
                    className={`px-2 py-1 rounded ${
                      viewMode === 'before'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-500 hover:text-slate-200'
                    }`}
                  >
                    Before
                  </button>
                  <button
                    onClick={() => setViewMode('compare')}
                    className={`px-2 py-1 rounded ${
                      viewMode === 'compare'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-500 hover:text-slate-200'
                    }`}
                  >
                    Compare
                  </button>
                </div>
              </div>

              <div className="p-2">
                {viewMode === 'compare' ? (
                  <BeforeAfterSlider
                    beforeSrc={data.originalUrl}
                    afterSrc={data.outputUrl}
                    beforeAlt="Before"
                    afterAlt="After"
                    initial={50}
                    autoDemo={false}
                    mode="split"
                    fit="contain"
                  />
                ) : (
                  <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-950">
                    <Image
                      src={viewMode === 'before' ? data.originalUrl : data.outputUrl}
                      alt={viewMode === 'before' ? 'Before' : 'After'}
                      fill
                      className="object-contain"
                      priority
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="col-span-12 lg:col-span-4 space-y-3">
            <div className="text-xs">
              <Link href="/upload" className="text-slate-400 hover:text-white transition-colors">
                Back to Single
              </Link>
            </div>
            {isInterior ? (
              <div className="bg-amber-900/30 border border-amber-700/50 rounded px-2 py-2 text-xs text-amber-200">
                <span className="font-medium">Interior photo</span> – Using centered layout for cabin shots.
              </div>
            ) : hasInteriorHint ? (
              <div className="bg-slate-900/50 border border-slate-800 rounded px-2 py-2 text-xs text-slate-400">
                <span className="text-slate-300">Note:</span> Some interior elements detected. Studio background applied.
              </div>
            ) : null}

            <div className="bg-slate-900/50 border border-slate-800 rounded overflow-hidden">
              <div className="px-2.5 py-1.5 border-b border-slate-800 bg-slate-900/80">
                <span className="text-xs font-medium text-slate-400">Actions</span>
              </div>
              <div className="p-2 space-y-2">
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className={`w-full px-3 py-2.5 rounded text-sm font-medium transition-all ${
                    downloading
                      ? 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-700/50'
                      : 'bg-[#1FB6A6] text-white hover:bg-[#22C6B5] active:bg-[#179E90]'
                  }`}
                >
                  {downloading ? 'Downloading...' : 'Download'}
                </button>
                <Link
                  href="/upload"
                  className="block w-full px-3 py-2 rounded text-sm font-medium border border-slate-700 text-slate-300 text-center hover:border-slate-600 hover:text-white transition-colors"
                >
                  Process another photo
                </Link>
              </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded overflow-hidden">
              <div className="px-2.5 py-1.5 border-b border-slate-800 bg-slate-900/80">
                <span className="text-xs font-medium text-slate-400">Details</span>
              </div>
              <div className="p-2 space-y-1 text-xs text-slate-400">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Output</span>
                  <span>1920 × 1080</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Format</span>
                  <span>JPG</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
 }
