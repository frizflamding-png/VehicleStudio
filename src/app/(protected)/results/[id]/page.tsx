'use client';

import { useState, useEffect, use, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface ResultData {
  originalUrl: string;
  outputUrl: string;
}

export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  
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
          <Link href="/upload" className="btn-primary">
            Back to Upload
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-container">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/upload" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <h1 className="text-xl font-bold">Result</h1>
          <div className="w-16"></div>
        </div>

        {/* Image Display */}
        <div className="card mb-6">
          <div className="relative aspect-video overflow-hidden bg-slate-900">
            <Image
              src={showOriginal ? data.originalUrl : data.outputUrl}
              alt={showOriginal ? 'Original' : 'Processed'}
              fill
              className="object-contain"
              priority
            />
            
            {/* Toggle Badge */}
            <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-xs font-medium">
              {showOriginal ? 'Original' : 'Processed'}
            </div>
          </div>

          {/* Before/After Toggle */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setShowOriginal(false)}
              className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                !showOriginal
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }`}
            >
              After
            </button>
            <button
              onClick={() => setShowOriginal(true)}
              className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                showOriginal
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Before
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="btn-primary"
          >
            {downloading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Downloading...
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Photo
              </span>
            )}
          </button>

          <Link href="/upload" className="btn-secondary block text-center">
            <span className="inline-flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Process Another Photo
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}
