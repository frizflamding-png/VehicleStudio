'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MarketingNavbar from '@/components/MarketingNavbar';
import MarketingHeroActions from '@/components/MarketingHeroActions';
import MarketingPricingCard from '@/components/MarketingPricingCard';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import AuthModal from '@/components/AuthModal';

export default function Home() {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const router = useRouter();

  const openSignIn = () => {
    setAuthMode('signin');
    setIsAuthOpen(true);
  };

  const openSignUp = () => {
    setAuthMode('signup');
    setIsAuthOpen(true);
  };

  const closeAuth = () => {
    setIsAuthOpen(false);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('auth') || params.get('checkout') || params.get('plan')) {
        router.replace('/');
      }
    }
  };

  useEffect(() => {
    if (isAuthOpen || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('auth');
    if (mode === 'signin' || mode === 'signup') {
      setAuthMode(mode);
      setIsAuthOpen(true);
    }
  }, [isAuthOpen]);

  return (
    <div className="min-h-screen bg-slate-950">
      <MarketingNavbar onSignIn={openSignIn} onSignUp={openSignUp} />
      <AuthModal
        isOpen={isAuthOpen}
        mode={authMode}
        onClose={closeAuth}
        onModeChange={setAuthMode}
      />

      <main>
        {/* ===== HERO SECTION ===== */}
        {/* Desktop Hero */}
        <section className="hidden lg:block pt-32 pb-16 px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl font-semibold text-white tracking-tight leading-tight mb-4">
              Vehicle photo processing<br />for automotive dealerships
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8 leading-relaxed">
              Remove backgrounds, apply studio templates, and add your dealership branding. 
              Process inventory photos consistently at scale.
            </p>
            <MarketingHeroActions variant="desktop" onSignIn={openSignIn} onSignUp={openSignUp} />
          </div>
        </section>

        {/* Mobile Hero */}
        <section className="lg:hidden px-5 pt-6 pb-8 text-left">
          <h1 className="text-2xl font-semibold text-white mb-2">
            Vehicle photo processing for dealerships
          </h1>
          <p className="text-sm text-slate-400 max-w-sm mb-6">
            Consistent studio backgrounds and branding for inventory workflows.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openSignUp}
              className="px-4 py-2 text-sm font-semibold bg-[#1FB6A6] text-white rounded-md hover:bg-[#22C6B5] active:bg-[#179E90] transition-colors"
            >
              Start processing photos
            </button>
            <button
              type="button"
              onClick={openSignIn}
              className="text-sm text-slate-300 hover:text-white transition-colors"
            >
              Sign in
            </button>
          </div>
        </section>

        {/* ===== BEFORE / AFTER SLIDER ===== */}
        <section className="py-12 px-6">
          <div className="max-w-5xl mx-auto text-center">
            <h2 className="text-2xl font-semibold text-white mb-3">See the difference</h2>
            <p className="text-sm text-slate-400 max-w-2xl mx-auto mb-8">
              Upload a vehicle photo, choose a studio background, and generate a listing-ready image in seconds.
            </p>
            <div className="max-w-3xl mx-auto">
              <BeforeAfterSlider
                beforeSrc="/templates/studio-gray.jpg"
                afterSrc="/templates/studio-white.jpg"
                beforeAlt="Vehicle photo before studio background"
                afterAlt="Vehicle photo after studio background"
              />
            </div>
          </div>
        </section>

        {/* ===== PRODUCT PREVIEW (Desktop) ===== */}
        <section id="how-it-works" className="hidden lg:block py-12 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              {/* Browser Chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-800/50 border-b border-slate-700/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-slate-600"></div>
                  <div className="w-3 h-3 rounded-full bg-slate-600"></div>
                  <div className="w-3 h-3 rounded-full bg-slate-600"></div>
                </div>
                <div className="flex-1 mx-4">
                  <div className="max-w-md mx-auto h-7 bg-slate-700/50 rounded-md flex items-center px-3">
                    <span className="text-xs text-slate-500">vehiclestudio.app/batch</span>
                  </div>
                </div>
              </div>
              {/* Screenshot Area */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6">
                {/* Status Bar */}
                <div className="flex items-center justify-between mb-4 px-2">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-semibold text-white">32</span>
                      <span className="text-sm text-slate-400">photos</span>
                    </div>
                    <div className="h-6 w-px bg-slate-700"></div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="text-emerald-400 font-medium">24</span>
                        <span className="text-slate-500">done</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
                        <span className="text-cyan-400 font-medium">3</span>
                        <span className="text-slate-500">processing</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                        <span className="text-slate-400 font-medium">5</span>
                        <span className="text-slate-500">pending</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400">75%</span>
                    <div className="w-32 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="w-3/4 h-full bg-cyan-500 rounded-full"></div>
                    </div>
                  </div>
                </div>
                {/* Photo Grid */}
                <div className="grid grid-cols-6 gap-2">
                  {[...Array(12)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`aspect-video rounded ${
                        i < 8 
                          ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30' 
                          : i < 10 
                            ? 'bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-500/30 animate-pulse'
                            : 'bg-slate-800/50 border border-slate-700/50'
                      }`}
                    >
                      {i < 8 && (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                      {i >= 8 && i < 10 && (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-center text-sm text-slate-500 mt-4">
              Process 30+ vehicle photos in minutes with batch upload
            </p>
          </div>
        </section>

        {/* ===== FEATURES SECTION ===== */}
        {/* Desktop Features */}
        <section id="features" className="hidden lg:block py-16 px-6 border-t border-slate-800/50">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-semibold text-white mb-3">
                Built for dealership workflows
              </h2>
              <p className="text-slate-400 max-w-xl mx-auto">
                Everything you need to produce consistent, professional vehicle photos across your inventory.
              </p>
            </div>
            
            <div className="grid grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="text-left">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-base font-medium text-white mb-2">
                  Automated background removal
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  AI-powered cutouts remove parking lots, driveways, and cluttered backgrounds automatically.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="text-left">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-base font-medium text-white mb-2">
                  Studio-quality templates
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Place vehicles on clean showroom backgrounds with realistic lighting and floor surfaces.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="text-left">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className="text-base font-medium text-white mb-2">
                  Consistent branded output
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Add your dealership logo to every photo. Maintain brand consistency across all listings.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="text-left">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </div>
                <h3 className="text-base font-medium text-white mb-2">
                  Batch processing
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Upload 50 photos at once. Process your entire inventory in a single session.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="text-left">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <h3 className="text-base font-medium text-white mb-2">
                  Bulk download
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Download all processed photos as a ZIP file. Ready for your listing platform.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="text-left">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="text-base font-medium text-white mb-2">
                  High-resolution export
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Output at 1920×1080 with preserved detail. Sharp enough for any platform.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Mobile Features */}
        <section className="lg:hidden px-5 pb-8">
          <div className="border-t border-slate-800/70 pt-5">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <svg className="w-4 h-4 text-cyan-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white">Automated background removal</h3>
                  <p className="text-xs text-slate-400">Consistent cutouts for dealer inventory.</p>
                </div>
              </div>
              <div className="h-px bg-slate-800/70" />
              <div className="flex items-start gap-3">
                <svg className="w-4 h-4 text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white">Studio-quality templates</h3>
                  <p className="text-xs text-slate-400">Clean showroom scenes built for listings.</p>
                </div>
              </div>
              <div className="h-px bg-slate-800/70" />
              <div className="flex items-start gap-3">
                <svg className="w-4 h-4 text-purple-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white">Consistent branded output</h3>
                  <p className="text-xs text-slate-400">Apply dealership branding across inventory.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Mobile Pricing */}
        <section className="lg:hidden px-5 pb-10">
          <div className="border-t border-slate-800/70 pt-6">
            <h2 className="text-lg font-semibold text-white mb-2">Pricing</h2>
            <p className="text-sm text-slate-400 mb-4">
              Simple subscription pricing for dealership teams.
            </p>
            <MarketingPricingCard onSubscribe={openSignUp} />
          </div>
        </section>

        {/* ===== PRICING SECTION (Desktop) ===== */}
        <section id="pricing" className="hidden lg:block py-16 px-6 border-t border-slate-800/50">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl font-semibold text-white mb-3">
              Simple subscription pricing
            </h2>
            <p className="text-slate-400 mb-8">
              One flat subscription for full access.
            </p>
            
            <MarketingPricingCard onSubscribe={openSignUp} />
          </div>
        </section>

        {/* ===== FOOTER ===== */}
        <footer className="py-8 px-6 border-t border-slate-800/50">
          <div className="max-w-5xl mx-auto">
            {/* Desktop Footer */}
            <div className="hidden lg:flex items-center justify-between">
              <span className="text-sm text-slate-500">
                VehicleStudio — Vehicle photo processing for automotive dealerships
              </span>
              <div className="flex items-center gap-6 text-sm text-slate-500">
                <a href="mailto:support@vehiclestudio.app" className="hover:text-slate-300 transition-colors">Contact</a>
              </div>
            </div>
            {/* Mobile Footer */}
            <p className="lg:hidden text-center text-sm text-slate-500">
              Built for automotive dealerships
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
