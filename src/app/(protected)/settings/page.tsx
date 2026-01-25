'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

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

export default function SettingsPage() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [background, setBackground] = useState('showroom-grey');
  const [uploading, setUploading] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userBackgrounds, setUserBackgrounds] = useState<UserBackground[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  
  const isConfigured = isSupabaseConfigured();
  
  const supabase = useMemo(() => {
    if (!isConfigured) return null;
    return createClient();
  }, [isConfigured]);

  const loadUserSettings = useCallback(async () => {
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

    const { data: logoData } = await supabase.storage
      .from('logos')
      .createSignedUrl(`${user.id}.png`, 3600);
    
    if (logoData?.signedUrl) {
      setLogoUrl(logoData.signedUrl);
    }

    const { data: backgroundFiles } = await supabase.storage
      .from(USER_BACKGROUNDS_BUCKET)
      .list(`${user.id}/`, { limit: 100, sortBy: { column: 'name', order: 'asc' } });

    if (backgroundFiles && backgroundFiles.length > 0) {
      const signedUrls = await Promise.all(
        backgroundFiles.map(async (file) => {
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
      loadUserSettings();
    }
  }, [supabase, loadUserSettings]);

  if (!supabase) {
    return (
      <div className="min-h-[calc(100vh-8rem)] lg:min-h-[calc(100vh-6.25rem)]">
        <div className="hidden lg:block">
          <div className="max-w-7xl mx-auto px-5 py-3">
            <div className="mb-3">
              <h1 className="text-[15px] font-semibold text-white leading-tight">Settings</h1>
              <p className="text-xs text-slate-500 leading-tight">Branding and templates</p>
            </div>

            <div className="max-w-xl">
              <div className="bg-slate-900/50 border border-slate-800 rounded p-3 text-center">
                <div className="w-8 h-8 rounded bg-yellow-500/20 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-xs text-slate-400 mb-3">Configure Supabase in <code className="text-cyan-400">.env.local</code></p>
                
                <div className="text-left pt-3 border-t border-slate-800">
                  <p className="text-[11px] text-slate-500 mb-1.5">Default Background</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {BACKGROUNDS.map((bg) => (
                      <button
                        key={bg.id}
                        onClick={() => { setBackground(bg.id); localStorage.setItem('background', bg.id); }}
                        className={`relative aspect-video rounded overflow-hidden border transition-all ${
                          background === bg.id ? 'border-cyan-500' : 'border-slate-700'
                        }`}
                      >
                        <Image src={bg.preview} alt={bg.label} fill className="object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:hidden px-4 py-6 pb-20">
          <h1 className="text-lg font-semibold mb-4">Settings</h1>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-center">
            <p className="text-sm text-slate-400">Configure Supabase to enable all features.</p>
          </div>
        </div>
      </div>
    );
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogoPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!supabase) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBackground(true);
    setMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const safeName = file.name.replace(/\s+/g, '-').toLowerCase();
      const fileName = `${Date.now()}-${safeName}`;
      const storagePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(USER_BACKGROUNDS_BUCKET)
        .upload(storagePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: signed } = await supabase.storage
        .from(USER_BACKGROUNDS_BUCKET)
        .createSignedUrl(storagePath, 3600);

      if (signed?.signedUrl) {
        setUserBackgrounds((prev) => [
          ...prev,
          {
            id: `${USER_BACKGROUND_PREFIX}${storagePath}`,
            label: fileName,
            preview: signed.signedUrl,
            storagePath,
          },
        ]);
      }

      setMessage({ type: 'success', text: 'Background uploaded' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setUploadingBackground(false);
      if (backgroundInputRef.current) backgroundInputRef.current.value = '';
    }
  };

  const handleUploadLogo = async () => {
    if (!logoFile || !supabase) return;
    
    setUploading(true);
    setMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get file extension from the uploaded file
      const fileExt = logoFile.name.split('.').pop()?.toLowerCase() || 'png';
      const fileName = `${user.id}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, logoFile, {
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: signedData } = await supabase.storage
        .from('logos')
        .createSignedUrl(fileName, 3600);

      setLogoUrl(signedData?.signedUrl || null);
      setLogoFile(null);
      setLogoPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      setMessage({ type: 'success', text: 'Logo uploaded' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setMessage(null);
    localStorage.setItem('background', background);

    try {
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error } = await supabase
            .from('profiles')
            .upsert({ id: user.id, background_id: background }, { onConflict: 'id' });
          if (error) throw error;
        }
      }
      setMessage({ type: 'success', text: 'Saved' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push('/');
    router.refresh();
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] lg:min-h-[calc(100vh-6.25rem)]">
      {/* Desktop Layout - High Density */}
      <div className="hidden lg:block">
        <div className="max-w-7xl mx-auto px-5 py-3">
          {/* Compact Header */}
          <div className="mb-3">
            <h1 className="text-[15px] font-semibold text-white leading-tight">Settings</h1>
            <p className="text-xs text-slate-500 leading-tight">Account and preferences</p>
          </div>

          {/* Message */}
          {message && (
            <div className={`mb-2 px-2 py-1 rounded text-[11px] max-w-xl ${
              message.type === 'success' 
                ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}>
              {message.text}
            </div>
          )}

          {/* Grid */}
          <div className="grid grid-cols-12 gap-3">
            {/* Left Column */}
            <div className="col-span-8 space-y-2">
              {/* Logo Upload */}
              <div className="bg-slate-900/50 border border-slate-800 rounded overflow-hidden">
                <div className="px-2.5 py-1.5 border-b border-slate-800 bg-slate-900/80">
                  <span className="text-xs font-medium text-slate-400">Dealership Logo</span>
                </div>
                <div className="p-2">
                  <div className="flex items-center gap-3">
                    {/* Logo Preview - Inline */}
                    <div className="w-24 h-12 bg-slate-950 rounded border border-slate-800 flex items-center justify-center flex-shrink-0">
                      {logoPreview || logoUrl ? (
                        <div className="relative w-20 h-10">
                          <Image src={logoPreview || logoUrl!} alt="Logo" fill className="object-contain" />
                        </div>
                      ) : (
                        <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <p className="text-[11px] text-slate-500 leading-tight mb-1.5">PNG with transparent background</p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[11px] font-medium transition-colors"
                        >
                          {logoPreview ? 'Change' : 'Select'}
                        </button>
                        {logoPreview && (
                          <button
                            onClick={handleUploadLogo}
                            disabled={uploading}
                            className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 rounded text-[11px] font-medium transition-colors disabled:opacity-50"
                          >
                            {uploading ? 'Uploading...' : 'Upload'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml" onChange={handleLogoChange} className="hidden" />
                </div>
              </div>

            </div>

            {/* Right Sidebar */}
            <div className="col-span-4 space-y-2">
              {/* Backgrounds */}
              <div className="bg-slate-900/50 border border-slate-800 rounded overflow-hidden">
                <div className="px-2.5 py-1.5 border-b border-slate-800 bg-slate-900/80">
                  <span className="text-xs font-medium text-slate-400">Backgrounds</span>
                </div>
                <div className="p-2 space-y-2">
                  <div>
                    <p className="text-[11px] text-slate-500 mb-1">Built-in</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {BACKGROUNDS.map((bg) => (
                        <button
                          key={bg.id}
                          onClick={() => setBackground(bg.id)}
                          className={`relative aspect-video rounded overflow-hidden border transition-all ${
                            background === bg.id ? 'border-cyan-500' : 'border-slate-700 hover:border-slate-600'
                          }`}
                        >
                          <Image src={bg.preview} alt={bg.label} fill className="object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-slate-500">Your backgrounds</p>
                      <label className="text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer">
                        {uploadingBackground ? 'Uploading...' : 'Upload'}
                        <input
                          ref={backgroundInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleBackgroundUpload}
                          className="hidden"
                          disabled={uploadingBackground}
                        />
                      </label>
                    </div>
                    {userBackgrounds.length === 0 ? (
                      <p className="text-[10px] text-slate-600">No custom backgrounds yet</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-1.5">
                        {userBackgrounds.map((bg) => (
                          <button
                            key={bg.id}
                            onClick={() => setBackground(bg.id)}
                            className={`relative aspect-video rounded overflow-hidden border transition-all ${
                              background === bg.id ? 'border-cyan-500' : 'border-slate-700 hover:border-slate-600'
                            }`}
                          >
                            <Image src={bg.preview} alt={bg.label} fill className="object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleSaveSettings}
                    disabled={saving}
                    className={`w-full mt-1 px-2 py-1 rounded text-[11px] font-medium transition-colors disabled:opacity-50 ${
                      saving
                        ? 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-700/50'
                        : 'bg-[#1FB6A6] text-white hover:bg-[#22C6B5] active:bg-[#179E90]'
                    }`}
                  >
                    {saving ? 'Saving...' : 'Save default'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Layout - Unchanged */}
      <div className="lg:hidden px-4 py-6 pb-20">
        <h1 className="text-lg font-semibold mb-4">Settings</h1>

        {message && (
          <div className={`mb-4 p-3 rounded text-sm ${
            message.type === 'success' 
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-4">
          <p className="text-sm text-slate-400 mb-3">Dealership Logo</p>
          <div className="p-4 bg-slate-950 rounded mb-3 flex items-center justify-center">
            {logoPreview || logoUrl ? (
              <div className="relative h-12 w-24">
                <Image src={logoPreview || logoUrl!} alt="Logo" fill className="object-contain" />
              </div>
            ) : (
              <p className="text-xs text-slate-500">No logo</p>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml" onChange={handleLogoChange} className="hidden" />
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-2 bg-slate-800 border border-slate-700 rounded text-sm"
            >
              {logoPreview ? 'Change' : 'Select'}
            </button>
            {logoPreview && (
              <button
                onClick={handleUploadLogo}
                disabled={uploading}
                className="flex-1 py-2 bg-cyan-600 rounded text-sm disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-4">
          <p className="text-sm text-slate-400 mb-3">Backgrounds</p>
          <p className="text-xs text-slate-500 mb-2">Built-in</p>
          <div className="flex gap-2 mb-3">
            {BACKGROUNDS.map((bg) => (
              <button
                key={bg.id}
                onClick={() => setBackground(bg.id)}
                className={`w-16 h-10 rounded overflow-hidden border-2 ${
                  background === bg.id ? 'border-cyan-500' : 'border-slate-700'
                }`}
              >
                <Image src={bg.preview} alt={bg.label} width={64} height={40} className="object-cover w-full h-full" />
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500">Your backgrounds</p>
            <label className="text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer">
              {uploadingBackground ? 'Uploading...' : 'Upload'}
              <input
                ref={backgroundInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleBackgroundUpload}
                className="hidden"
                disabled={uploadingBackground}
              />
            </label>
          </div>
          {userBackgrounds.length === 0 ? (
            <p className="text-xs text-slate-600 mb-3">No custom backgrounds yet</p>
          ) : (
            <div className="flex gap-2 mb-3">
              {userBackgrounds.map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => setBackground(bg.id)}
                  className={`w-16 h-10 rounded overflow-hidden border-2 ${
                    background === bg.id ? 'border-cyan-500' : 'border-slate-700'
                  }`}
                >
                  <Image src={bg.preview} alt={bg.label} width={64} height={40} className="object-cover w-full h-full" />
                </button>
              ))}
            </div>
          )}
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="w-full py-2 bg-slate-800 border border-slate-700 rounded text-sm"
          >
            {saving ? 'Saving...' : 'Save default'}
          </button>
        </div>

      </div>
    </div>
  );
}
