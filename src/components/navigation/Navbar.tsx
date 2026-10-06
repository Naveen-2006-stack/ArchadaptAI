'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Compass, LogOut, FolderKanban, Plus } from 'lucide-react';
import AuthModal from '@/components/auth/AuthModal';
import { supabase } from '@/lib/supabase/client';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string; avatarUrl?: string } | null>(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Architect',
          email: session.user.email || '',
          avatarUrl: session.user.user_metadata?.avatar_url
        });
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser({
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Architect',
          email: session.user.email || '',
          avatarUrl: session.user.user_metadata?.avatar_url
        });
      } else {
        setUser(null);
        if (event === 'SIGNED_OUT' && (pathname === '/dashboard' || pathname?.startsWith('/workspace'))) {
          router.replace('/login');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.replace('/login');
  };

  const navItems = [
    { name: 'How It Works', href: '/how-it-works' },
    { name: 'Architectural Styles', href: '/styles' },
    { name: 'Special Modes', href: '/modes' },
    { name: 'My Projects', href: '/dashboard', icon: FolderKanban }
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-stone-200 bg-[#F9F8F6]/90 backdrop-blur-md transition-all">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-12">
          {/* Logo Brand Mark */}
          <Link href="/" className="group flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-stone-900 text-stone-50 transition-transform group-hover:scale-105">
              <Compass className="h-5 w-5 stroke-[1.5]" />
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-xl font-medium tracking-tight text-stone-900">
                ARCHADAPT<span className="font-mono text-xs text-terracotta-500 ml-1">AI</span>
              </span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500">
                Architectural Studio Engine
              </span>
            </div>
          </Link>

          {/* Center Quiet Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 font-sans text-xs font-semibold tracking-widest uppercase text-stone-600">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 py-1 border-b-2 transition-all ${
                    isActive
                      ? 'border-terracotta-500 text-stone-950 font-bold'
                      : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 text-terracotta-500" />}
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  href="/dashboard"
                  className={`hidden sm:flex items-center gap-2 px-4 py-2.5 font-mono text-xs uppercase tracking-wider transition-all border ${
                    pathname === '/dashboard'
                      ? 'bg-stone-900 text-stone-50 border-stone-900 font-bold'
                      : 'border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-stone-50'
                  }`}
                >
                  <FolderKanban className="h-3.5 w-3.5" />
                  Dashboard
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex h-9 w-9 items-center justify-center border border-stone-200 text-stone-600 hover:border-stone-900 hover:text-stone-900 transition-all"
                  title="Sign Out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="hidden sm:inline-block font-sans text-xs font-semibold uppercase tracking-widest text-stone-700 hover:text-stone-900 px-3 py-2"
                >
                  Sign In
                </Link>
                <Link
                  href="/onboarding"
                  className="flex items-center gap-2 bg-stone-900 px-6 py-3 font-sans text-xs font-semibold uppercase tracking-widest text-stone-50 hover:bg-stone-800 transition-all shadow-sm"
                >
                  <Plus className="h-4 w-4 text-terracotta-400" />
                  Start Designing
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Auth Modal */}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onAuthSuccess={(u) => setUser(u)} />
    </>
  );
}
