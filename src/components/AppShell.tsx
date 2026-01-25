"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const STUDIO_TABS = [
  { href: '/upload', label: 'Single' },
  { href: '/batch', label: 'Batch' },
  { href: '/settings', label: 'Settings' },
  { href: '/studio/account', label: 'Account' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inStudio = pathname.startsWith('/upload') || pathname.startsWith('/batch') || pathname.startsWith('/settings') || pathname.startsWith('/results') || pathname.startsWith('/studio');
  
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Desktop: Compact Navigation */}
      <header className="hidden lg:block border-b border-slate-800/60 bg-slate-950/95 sticky top-0 z-50">
        {/* Single Row Navigation */}
        <div className="flex items-center h-10 px-5">
          <Link href="/" className="text-sm font-semibold tracking-tight text-white hover:text-slate-200 transition-colors mr-6">
            VehicleStudio
          </Link>
          
          {inStudio && (
            <>
              <div className="w-px h-4 bg-slate-800 mr-4" />
              <nav className="flex gap-0.5">
                {STUDIO_TABS.map(tab => (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                      pathname.startsWith(tab.href)
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-500 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    {tab.label}
                  </Link>
                ))}
              </nav>
            </>
          )}
          
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[11px] text-slate-600">Pro</span>
            <Link href="/studio/account" className="text-[11px] text-slate-500 hover:text-white transition-colors">
              Account
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile: Header */}
      <header className="lg:hidden flex items-center justify-between h-12 px-4 border-b border-slate-800/60 bg-slate-950/95 sticky top-0 z-50">
        <Link href="/" className="text-base font-semibold text-white">
          VehicleStudio
        </Link>
        <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">Studio</span>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Mobile: Bottom Nav */}
      {inStudio && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-sm border-t border-slate-800/60">
          <div className="flex items-center justify-around h-12 max-w-lg mx-auto">
            {STUDIO_TABS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center px-4 py-1.5 text-xs font-medium transition-colors ${
                    isActive ? 'text-cyan-400' : 'text-slate-500'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
