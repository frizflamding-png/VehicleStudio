'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

const BACKGROUNDS = [
  { id: 'showroom-grey', label: 'Showroom Grey', preview: '/templates/backgrounds/showroom-grey.jpg' },
];

export default function OnboardingPage() {
  const [dealershipName, setDealershipName] = useState('');
  const [phone, setPhone] = useState('');
  const [background, setBackground] = useState('showroom-grey');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dealershipError, setDealershipError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const getErrorMessage = (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    try {
      return JSON.stringify(err);
    } catch {
      return 'Unable to save onboarding details.';
    }
  };

  const supabase = useMemo(() => {
    if (!isSupabaseConfigured()) return null;
    return createClient();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;

    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('dealership_name, phone, background_id')
        .eq('id', user.id)
        .maybeSingle<{ dealership_name: string | null; phone: string | null; background_id: string | null }>();

      if (!isMounted) return;

      if (profile?.dealership_name) setDealershipName(profile.dealership_name);
      if (profile?.phone) setPhone(profile.phone);
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

      setLoadingProfile(false);
    };

    loadProfile().catch(() => setLoadingProfile(false));

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      setLogoPreview(readerEvent.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleComplete = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError('');
    setDealershipError('');

    if (!dealershipName.trim()) {
      setDealershipError('Dealership name is required.');
      setSaving(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop()?.toLowerCase() || 'png';
        const fileName = `${user.id}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('logos')
          .upload(fileName, logoFile, { upsert: true });
        if (uploadError) throw uploadError;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          dealership_name: dealershipName.trim(),
          phone: phone.trim() || null,
          background_id: background,
        }, { onConflict: 'id' });

      if (profileError) throw profileError;

      localStorage.setItem('background', background);
      router.push('/studio');
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!supabase) {
    return (
      <div className="min-h-[calc(100vh-8rem)] lg:min-h-[calc(100vh-6.25rem)] px-4 py-10">
        <div className="max-w-lg mx-auto bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
          <p className="text-sm text-slate-400">
            Configure Supabase in <code className="text-cyan-400">.env.local</code> to enable onboarding.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] lg:min-h-[calc(100vh-6.25rem)] px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-white mb-2">Welcome to VehicleStudio</h1>
          <p className="text-sm text-slate-400">
            Set up your dealership profile and default look before you start processing photos.
          </p>
        </div>

        <form onSubmit={handleComplete} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Dealership name
              </label>
              <input
                value={dealershipName}
                onChange={(event) => setDealershipName(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-slate-600 focus:outline-none transition-colors"
                placeholder="Example Auto Group"
                disabled={loadingProfile}
              />
              {dealershipError && (
                <p className="mt-2 text-sm text-red-400">{dealershipError}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Phone (optional)
              </label>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-slate-600 focus:outline-none transition-colors"
                placeholder="(555) 123-4567"
                disabled={loadingProfile}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">
              Default background
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {BACKGROUNDS.map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => setBackground(bg.id)}
                  className={`relative aspect-video rounded-lg overflow-hidden border transition-all ${
                    background === bg.id ? 'border-cyan-500' : 'border-slate-700'
                  }`}
                >
                  <Image src={bg.preview} alt={bg.label} fill className="object-cover" />
                  <span className="absolute bottom-2 left-2 text-xs text-white bg-slate-950/70 px-2 py-0.5 rounded">
                    {bg.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Dealership logo (optional)
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-24 h-24 rounded-lg border border-slate-700 bg-slate-800 flex items-center justify-center overflow-hidden">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain" />
                ) : logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-slate-500">No logo</span>
                )}
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
                >
                  Upload logo
                </button>
                <p className="text-xs text-slate-500 mt-2">PNG with transparency works best.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-slate-500">
              You can edit these settings later from the Settings tab.
            </p>
            <button
              type="submit"
              disabled={saving || loadingProfile}
              className="px-5 py-2.5 rounded-lg bg-white text-slate-900 font-medium hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Continue to Studio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
