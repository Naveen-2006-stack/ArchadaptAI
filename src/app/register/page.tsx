'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Compass, UserPlus, Mail, Lock, User, ArrowRight, Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next') || '/dashboard';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If already authenticated, redirect to target
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        router.replace(nextUrl);
      }
    });
  }, [router, nextUrl]);

  // Google OAuth intentionally disabled for the current release.
  // Can be re-enabled after authentication flow is fully verified.
  /*
  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
  };
  */

  const validateForm = (): boolean => {
    if (!name.trim()) {
      setErrorMessage('Please enter your full name.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setErrorMessage('Please enter a valid email address.');
      return false;
    }
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters.');
      return false;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return false;
    }
    return true;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validateForm()) return;

    setLoading(true);
    try {
      const cleanEmail = email.trim();
      const cleanName = name.trim();

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName
          }
        }
      });

      if (error) {
        const errorMsg = error.message?.toLowerCase() || '';
        const errorCode = (error as any).code || '';
        if (
          errorCode === 'user_already_exists' ||
          errorMsg.includes('already registered') ||
          errorMsg.includes('already exists')
        ) {
          setErrorMessage('An account with this email already exists.');
        } else {
          setErrorMessage('Unable to create account. Please check your details and try again.');
        }
        return;
      }

      // Check if user already exists (Supabase sometimes returns existing user with empty identities)
      if (data?.user && (!data.user.identities || data.user.identities.length === 0)) {
        setErrorMessage('An account with this email already exists.');
        return;
      }

      // Ensure active session is established immediately without email confirmation
      if (data?.session) {
        router.replace(nextUrl);
        return;
      }

      // Fallback: in case session was not attached on signUp, immediately log in with password
      const signInRes = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });

      if (signInRes.data?.session) {
        router.replace(nextUrl);
      } else {
        // If login failed, show clean prompt
        router.replace(`/login?registered=true&next=${encodeURIComponent(nextUrl)}`);
      }
    } catch {
      setErrorMessage('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] text-stone-900 flex flex-col justify-between">
      {/* Minimal Top Brand Bar */}
      <header className="w-full border-b border-stone-200 bg-[#F9F8F6]/90 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-12">
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

          <Link
            href="/login"
            className="font-sans text-xs font-semibold uppercase tracking-widest text-stone-700 hover:text-stone-950 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Main Authentication Container */}
      <main className="flex-1 flex items-center justify-center p-6 py-12">
        <div className="w-full max-w-md border border-stone-200 bg-white p-8 sm:p-10 shadow-sm">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center bg-stone-900 text-stone-50">
              <UserPlus className="h-5 w-5 stroke-[1.5]" />
            </div>
            <h1 className="font-serif text-3xl font-normal text-stone-950">Create Account</h1>
            <p className="mt-2 font-sans text-xs text-stone-600 leading-relaxed">
              Register to access conceptual floor plans, 3D massing models, and revision history.
            </p>
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 border border-red-200 bg-red-50/80 p-3.5 text-xs text-red-800"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span className="font-sans font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleRegister} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="register-name"
                className="block font-mono text-[11px] uppercase tracking-wider text-stone-700 mb-1.5"
              >
                Full Name
              </label>
              <div className="relative">
                <input
                  id="register-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Elena Rostova"
                  className="w-full border border-stone-300 bg-white px-4 py-3 font-sans text-sm text-stone-900 placeholder-stone-400 focus:border-stone-900 focus:outline-none transition-colors"
                />
                <User className="absolute right-3.5 top-3.5 h-4 w-4 text-stone-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label
                htmlFor="register-email"
                className="block font-mono text-[11px] uppercase tracking-wider text-stone-700 mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <input
                  id="register-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="architect@studio.com"
                  className="w-full border border-stone-300 bg-white px-4 py-3 font-sans text-sm text-stone-900 placeholder-stone-400 focus:border-stone-900 focus:outline-none transition-colors"
                />
                <Mail className="absolute right-3.5 top-3.5 h-4 w-4 text-stone-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label
                htmlFor="register-password"
                className="block font-mono text-[11px] uppercase tracking-wider text-stone-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="At least 8 characters"
                  className="w-full border border-stone-300 bg-white px-4 py-3 pr-10 font-sans text-sm text-stone-900 placeholder-stone-400 focus:border-stone-900 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-stone-400 hover:text-stone-700 p-0.5"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="register-confirm-password"
                className="block font-mono text-[11px] uppercase tracking-wider text-stone-700 mb-1.5"
              >
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="register-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Re-enter your password"
                  className="w-full border border-stone-300 bg-white px-4 py-3 pr-10 font-sans text-sm text-stone-900 placeholder-stone-400 focus:border-stone-900 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-stone-400 hover:text-stone-700 p-0.5"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 bg-stone-900 py-3.5 px-4 font-sans text-xs font-semibold tracking-widest uppercase text-stone-50 hover:bg-stone-800 disabled:opacity-60 transition-all shadow-sm mt-3"
            >
              {loading ? (
                <span className="font-mono text-xs">Creating Account…</span>
              ) : (
                <>
                  Create Account
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Navigation to Login */}
          <div className="mt-8 border-t border-stone-200 pt-6 text-center">
            <p className="font-sans text-xs text-stone-600">
              Already have an account?{' '}
              <Link
                href={`/login${nextUrl !== '/dashboard' ? `?next=${encodeURIComponent(nextUrl)}` : ''}`}
                className="font-semibold text-terracotta-600 hover:text-terracotta-700 underline underline-offset-4 transition-colors"
              >
                Sign In
              </Link>
            </p>
          </div>

          {/* RLS Security Badge */}
          <div className="mt-8 flex items-center justify-center gap-1.5 font-mono text-[10px] text-stone-500">
            <ShieldCheck className="h-3.5 w-3.5 text-sage-500" />
            Protected by Supabase Row Level Security
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 py-6 text-center font-mono text-[10px] uppercase text-stone-500">
        ArchAdapt AI — Adaptive Architectural Design System
      </footer>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center font-mono text-xs uppercase text-stone-500">Loading…</div>}>
      <RegisterForm />
    </Suspense>
  );
}
