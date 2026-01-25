'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { FileObject } from '@supabase/storage-js';
import Image from 'next/image';
import JSZip from 'jszip';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

const MAX_CONCURRENT = 3;
const MAX_BATCH_SIZE = 50;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif'];

const BACKGROUNDS = [
  { id: 'showroom-grey', label: 'Showroom Grey', preview: '/templates/backgrounds/showroom-grey.jpg' },
];
const USER_BACKGROUND_PREFIX = 'user:';
const USER_BACKGROUNDS_BUCKET = 'user-backgrounds';

type UserBackground = {
  id: string;
  label: string;
  preview: string;
  storagePath: string;
};

type ImageStatus = 'pending' | 'processing' | 'done' | 'failed';

interface BatchImage {
  id: string;
  file: File;
  preview: string;
  status: ImageStatus;
  error?: string;
  outputUrl?: string;
  outputId?: string;
}

export default function BatchUploadPage() {
  const [images, setImages] = useState<BatchImage[]>([]);
  const [background, setBackground] = useState('showroom-grey');
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [userBackgrounds, setUserBackgrounds] = useState<UserBackground[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
      localStorage.setItem('background', profile.background_id);
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
    const saved = localStorage.getItem('background');
    if (saved) setBackground(saved);
    if (supabase) {
      loadUserBackgrounds();
    }
  }, [supabase, loadUserBackgrounds]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(f => ALLOWED_TYPES.includes(f.type));
    if (validFiles.length === 0) return;

    const remainingSlots = MAX_BATCH_SIZE - images.length;
    const filesToAdd = validFiles.slice(0, remainingSlots);

    const newImages: BatchImage[] = filesToAdd.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      preview: URL.createObjectURL(file),
      status: 'pending' as ImageStatus,
    }));

    setImages(prev => [...prev, ...newImages]);
  }, [images.length]);

  const removeImage = useCallback((id: string) => {
    setImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img?.preview) URL.revokeObjectURL(img.preview);
      return prev.filter(i => i.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    images.forEach(img => {
      if (img.preview) URL.revokeObjectURL(img.preview);
    });
    setImages([]);
  }, [images]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
    }
    e.target.value = '';
  }, [addFiles]);

  const processImage = async (image: BatchImage, signal: AbortSignal): Promise<{ outputUrl: string; outputId: string }> => {
    const formData = new FormData();
    formData.append('image', image.file);
    formData.append('background', background);

    const response = await fetch('/api/process', {
      method: 'POST',
      body: formData,
      signal,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Processing failed');
    }

    const data = await response.json();
    return { outputUrl: `/api/download/${data.id}`, outputId: data.id };
  };

  const processAll = useCallback(async () => {
    const pendingImages = images.filter(img => img.status === 'pending');
    if (pendingImages.length === 0) return;

    setIsProcessing(true);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const queue = [...pendingImages.map(img => img.id)];
    const processing = new Set<string>();

    const processNext = async () => {
      if (signal.aborted) return;
      
      while (processing.size < MAX_CONCURRENT && queue.length > 0) {
        const imageId = queue.shift()!;
        processing.add(imageId);

        setImages(prev => prev.map(img => 
          img.id === imageId ? { ...img, status: 'processing' as ImageStatus } : img
        ));

        const image = images.find(img => img.id === imageId);
        if (!image) {
          processing.delete(imageId);
          continue;
        }

        try {
          const result = await processImage(image, signal);
          setImages(prev => prev.map(img => 
            img.id === imageId 
              ? { ...img, status: 'done' as ImageStatus, outputUrl: result.outputUrl, outputId: result.outputId }
              : img
          ));
        } catch (err) {
          if (signal.aborted) return;
          setImages(prev => prev.map(img => 
            img.id === imageId 
              ? { ...img, status: 'failed' as ImageStatus, error: err instanceof Error ? err.message : 'Failed' }
              : img
          ));
        }

        processing.delete(imageId);
        processNext();
      }
    };

    await Promise.all(
      Array(Math.min(MAX_CONCURRENT, pendingImages.length))
        .fill(null)
        .map(() => processNext())
    );

    while (processing.size > 0 || queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (signal.aborted) break;
    }

    setIsProcessing(false);
  }, [images, background]);

  const cancelProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsProcessing(false);
    setImages(prev => prev.map(img => 
      img.status === 'processing' ? { ...img, status: 'pending' as ImageStatus } : img
    ));
  }, []);

  const downloadSingle = useCallback(async (image: BatchImage) => {
    if (!image.outputId) return;

    try {
      const response = await fetch(`/api/download/${image.outputId}`);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${image.file.name.replace(/\.[^/.]+$/, '')}_processed.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  }, []);

  const downloadAllAsZip = useCallback(async () => {
    const completedImages = images.filter(img => img.status === 'done' && img.outputId);
    if (completedImages.length === 0) return;

    const zip = new JSZip();
    
    for (const image of completedImages) {
      try {
        const response = await fetch(`/api/download/${image.outputId}`);
        if (!response.ok) continue;
        
        const blob = await response.blob();
        const filename = `${image.file.name.replace(/\.[^/.]+$/, '')}_processed.jpg`;
        zip.file(filename, blob);
      } catch (err) {
        console.error(`Failed to add ${image.file.name} to ZIP:`, err);
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vehiclestudio_batch_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [images]);

  const stats = {
    total: images.length,
    pending: images.filter(i => i.status === 'pending').length,
    processing: images.filter(i => i.status === 'processing').length,
    done: images.filter(i => i.status === 'done').length,
    failed: images.filter(i => i.status === 'failed').length,
  };

  const progressPercent = stats.total > 0 
    ? Math.round(((stats.done + stats.failed) / stats.total) * 100) 
    : 0;

  // Determine current step
  const currentStep = images.length === 0 ? 1 : stats.done > 0 ? 4 : 3;
  const backgroundLabel = [...BACKGROUNDS, ...userBackgrounds].find(b => b.id === background)?.label;

  return (
    <div className="min-h-[calc(100vh-8rem)] lg:min-h-[calc(100vh-6.25rem)]">
      {/* Desktop Layout - High Density */}
      <div className="hidden lg:block">
        <div className="max-w-7xl mx-auto px-5 py-3">
          {/* Compact Header Row */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-[15px] font-semibold text-white leading-tight">Batch Processing</h1>
              <p className="text-xs text-slate-500 leading-tight">Upload · Select template · Process all · Download</p>
            </div>
            {images.length > 0 && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-500">{stats.done}/{stats.total} done</span>
                {!isProcessing && <button onClick={clearAll} className="text-slate-500 hover:text-white">Clear all</button>}
              </div>
            )}
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-12 gap-3">
            {/* Left: Workspace */}
            <div className="col-span-9">
              {images.length === 0 ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border border-dashed rounded p-6 text-center cursor-pointer transition-all ${
                    dragOver ? 'border-cyan-500 bg-cyan-500/5' : 'border-slate-700 hover:border-slate-600 bg-slate-900/30'
                  }`}
                >
                  <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center mx-auto mb-2">
                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-xs text-slate-400 mb-0.5">Step 1 — Drop images here or click to select</p>
                  <p className="text-[10px] text-slate-600">JPG, PNG, WebP, AVIF • Up to {MAX_BATCH_SIZE} images</p>
                </div>
              ) : (
                <>
                  {/* Progress Bar */}
                  {isProcessing && (
                    <div className="bg-slate-900/50 border border-slate-800 rounded px-2.5 py-2 mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-slate-400">{stats.processing} active • {stats.done} done • {stats.failed} failed</span>
                        <span className="text-[11px] font-medium text-white">{progressPercent}%</span>
                      </div>
                      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Toolbar */}
                  <div className="flex items-center gap-1.5 mb-2">
                    {!isProcessing ? (
                      <>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2 py-1 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 rounded text-[11px] font-medium text-slate-300 transition-colors"
                        >
                          + Add more
                        </button>
                        {stats.pending > 0 && (
                          <button
                            onClick={processAll}
                            className="px-3 py-1.5 bg-[#1FB6A6] hover:bg-[#22C6B5] active:bg-[#179E90] rounded text-xs font-medium text-white transition-colors"
                          >
                            Process Batch ({stats.pending})
                          </button>
                        )}
                        {stats.done > 0 && (
                          <button
                            onClick={downloadAllAsZip}
                            className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 rounded text-[11px] font-medium text-slate-300 transition-colors flex items-center gap-1 ml-auto"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download ZIP ({stats.done})
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={cancelProcessing}
                        className="px-2.5 py-1 bg-red-600/80 hover:bg-red-500 border border-red-500/50 rounded text-[11px] font-medium text-white transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  {/* Image Grid - Small thumbnails */}
                  <div
                    className={`grid gap-1.5 ${dragOver ? 'opacity-50' : ''}`}
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    {images.map((image) => (
                      <div
                        key={image.id}
                        className={`bg-slate-900/50 border rounded overflow-hidden transition-all ${
                          image.status === 'done' ? 'border-green-500/40' :
                          image.status === 'failed' ? 'border-red-500/40' :
                          image.status === 'processing' ? 'border-cyan-500/40' :
                          'border-slate-800'
                        }`}
                      >
                        <div className="aspect-video relative bg-slate-950">
                          <Image src={image.preview} alt={image.file.name} fill className="object-cover" />
                          {image.status === 'processing' && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                          {image.status === 'done' && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                          {image.status === 'failed' && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </div>
                          )}
                          {!isProcessing && image.status !== 'processing' && (
                            <button
                              onClick={() => removeImage(image.id)}
                              className="absolute top-0.5 right-0.5 w-4 h-4 rounded bg-black/60 hover:bg-black/80 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                            >
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <div className="px-1.5 py-1">
                          <p className="text-[10px] text-slate-500 truncate leading-tight">{image.file.name}</p>
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-medium capitalize ${
                              image.status === 'done' ? 'text-green-400' :
                              image.status === 'failed' ? 'text-red-400' :
                              image.status === 'processing' ? 'text-cyan-400' :
                              'text-slate-600'
                            }`}>
                              {image.status}
                            </span>
                            {image.status === 'done' && (
                              <button onClick={() => downloadSingle(image)} className="text-[10px] text-cyan-400 hover:text-cyan-300">↓</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {!isProcessing && images.length < MAX_BATCH_SIZE && (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-video bg-slate-900/30 border border-dashed border-slate-700 hover:border-slate-600 rounded flex flex-col items-center justify-center cursor-pointer transition-colors"
                      >
                        <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Right: Sidebar - Compact */}
            <div className="col-span-3 flex flex-col gap-2">
              {/* Step 1: Upload Status */}
              <div className={`bg-slate-900/50 border rounded overflow-hidden transition-colors ${currentStep === 1 ? 'border-slate-700' : 'border-slate-800'}`}>
                <div className="px-2.5 py-1.5 border-b border-slate-800 bg-slate-900/80">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-600 font-medium">1.</span>
                    <span className="text-xs font-medium text-slate-400">Upload photos</span>
                    {images.length > 0 && <svg className="w-3 h-3 text-emerald-500 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                </div>
                <div className="p-2">
                  {images.length === 0 ? (
                    <p className="text-[10px] text-slate-600 text-center py-1">No images yet</p>
                  ) : (
                    <p className="text-[10px] text-slate-500 text-center py-1">{images.length} image{images.length !== 1 ? 's' : ''} in queue</p>
                  )}
                </div>
              </div>

              {/* Step 2: Background */}
              <div className="bg-slate-900/50 border border-slate-800 rounded overflow-hidden">
                <div className="px-2.5 py-1.5 border-b border-slate-800 bg-slate-900/80">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-600 font-medium">2.</span>
                    <span className="text-xs font-medium text-slate-400">Select background</span>
                    <svg className="w-3 h-3 text-emerald-500 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                </div>
                <div className="p-2 space-y-2">
                  <div>
                    <p className="text-[10px] text-slate-600 mb-1">Built-in</p>
                    {BACKGROUNDS.map((bg) => (
                      <button
                        key={bg.id}
                        onClick={() => { setBackground(bg.id); localStorage.setItem('background', bg.id); }}
                        disabled={isProcessing}
                        className={`w-full aspect-video rounded overflow-hidden border transition-all relative ${
                          background === bg.id ? 'border-cyan-500' : 'border-slate-700 hover:border-slate-600'
                        } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <Image src={bg.preview} alt={bg.label} fill className="object-cover" />
                      </button>
                    ))}
                  </div>
                  {userBackgrounds.length > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-600 mb-1">Your backgrounds</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {userBackgrounds.map((bg) => (
                          <button
                            key={bg.id}
                            onClick={() => { setBackground(bg.id); localStorage.setItem('background', bg.id); }}
                            disabled={isProcessing}
                            className={`relative aspect-video rounded overflow-hidden border transition-all ${
                              background === bg.id ? 'border-cyan-500' : 'border-slate-700 hover:border-slate-600'
                            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <Image src={bg.preview} alt={bg.label} fill className="object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {backgroundLabel && (
                    <p className="text-[10px] text-slate-600">{backgroundLabel}</p>
                  )}
                </div>
              </div>

              {/* Step 3: Process & Download */}
              {images.length > 0 && (
                <div className={`bg-slate-900/50 border rounded overflow-hidden transition-colors ${currentStep >= 3 ? 'border-slate-700' : 'border-slate-800'}`}>
                  <div className="px-2.5 py-1.5 border-b border-slate-800 bg-slate-900/80">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-600 font-medium">3.</span>
                      <span className="text-xs font-medium text-slate-400">Process & download</span>
                      {stats.done === stats.total && stats.total > 0 && <svg className="w-3 h-3 text-emerald-500 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                  </div>
                  <div className="p-2 space-y-1.5">
                    {!isProcessing && stats.pending > 0 && (
                      <button 
                        onClick={processAll} 
                        className="w-full px-3 py-2.5 bg-[#1FB6A6] hover:bg-[#22C6B5] active:bg-[#179E90] rounded text-sm font-medium text-white transition-colors"
                      >
                        Process All ({stats.pending})
                      </button>
                    )}
                    {!isProcessing && stats.done > 0 && (
                      <button onClick={downloadAllAsZip} className="w-full px-2 py-1.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 rounded text-[11px] font-medium text-slate-300 transition-colors">
                        Download ZIP ({stats.done})
                      </button>
                    )}
                    {isProcessing && (
                      <button onClick={cancelProcessing} className="w-full px-2 py-1.5 bg-red-600/80 hover:bg-red-500 border border-red-500/50 rounded text-[11px] font-medium text-white transition-colors">
                        Cancel processing
                      </button>
                    )}
                    {!isProcessing && stats.pending === 0 && stats.done === 0 && (
                      <p className="text-[10px] text-slate-600 text-center py-1">Add images to process</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Layout - Unchanged */}
      <div className="lg:hidden px-4 py-6 pb-20">
        <h1 className="text-lg font-semibold mb-4">Batch Processing</h1>
        
        {images.length === 0 ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-lg p-8 text-center ${dragOver ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-700'}`}
          >
            <svg className="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-slate-400 mb-1">Tap to select images</p>
            <p className="text-xs text-slate-500">Up to {MAX_BATCH_SIZE} images</p>
          </div>
        ) : (
          <>
            {isProcessing && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">{stats.processing} processing</span>
                  <span className="text-white">{progressPercent}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 transition-all" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 mb-4">
              {images.map((image) => (
                <div key={image.id} className="aspect-video relative bg-slate-900 rounded overflow-hidden">
                  <Image src={image.preview} alt="" fill className="object-cover" />
                  {image.status === 'processing' && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {image.status === 'done' && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {!isProcessing && (
                    <button
                      onClick={() => removeImage(image.id)}
                      className="absolute top-1 right-1 w-5 h-5 rounded bg-black/60 flex items-center justify-center"
                    >
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              {!isProcessing && images.length < MAX_BATCH_SIZE && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-video bg-slate-900/50 border border-dashed border-slate-700 rounded flex items-center justify-center"
                >
                  <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {!isProcessing && stats.pending > 0 && (
                <button onClick={processAll} className="w-full py-3.5 bg-[#1FB6A6] rounded-lg text-sm font-medium text-white">
                  Process All ({stats.pending})
                </button>
              )}
              {!isProcessing && stats.done > 0 && (
                <button onClick={downloadAllAsZip} className="w-full py-3 bg-slate-800 border border-slate-700 rounded-lg text-sm font-medium">
                  Download ZIP ({stats.done})
                </button>
              )}
              {isProcessing && (
                <button onClick={cancelProcessing} className="w-full py-3 bg-red-600 rounded-lg text-sm font-medium">
                  Cancel
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        multiple
        onChange={handleFileInput}
        className="hidden"
      />
    </div>
  );
}
