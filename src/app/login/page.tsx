'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Compass, Lock, Mail, ArrowRight, Eye, EyeOff, AlertCircle, CheckCircle2, ShieldCheck, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Forgot password state
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

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
    if (!email.trim()) {
      setErrorMessage('Please enter a valid email address.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMessage('Please enter a valid email address.');
      return false;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return false;
    }
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validateForm()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) {
        // Clean error message without exposing internal details
        if (
          error.status === 400 ||
          error.message?.toLowerCase().includes('invalid') ||
          error.message?.toLowerCase().includes('credentials')
        ) {
          setErrorMessage('Invalid email or password.');
        } else {
          setErrorMessage('Invalid email or password.');
        }
        return;
      }

      if (data.session) {
        router.replace(nextUrl);
      } else {
        setErrorMessage('Unable to establish session. Please try again.');
      }
    } catch {
      setErrorMessage('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetSuccess(false);

    if (!resetEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail.trim())) {
      setResetError('Please enter a valid email address.');
      return;
    }

    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`
      });

      if (error) {
        // Don't leak whether the account exists
        setResetSuccess(true);
      } else {
        setResetSuccess(true);
      }
    } catch {
      setResetError('Unable to send reset instructions. Please try again later.');
    } finally {
      setResetLoading(false);
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
            href="/register"
            className="font-sans text-xs font-semibold uppercase tracking-widest text-stone-700 hover:text-stone-950 transition-colors"
          >
            Create Account
          </Link>
        </div>
      </header>

      {/* Main Authentication Container */}
      <main className="flex-1 flex items-center justify-center p-6 py-12">
        <div className="w-full max-w-md border border-stone-200 bg-white p-8 sm:p-10 shadow-sm">
          {!isForgotPassword ? (
            <>
              {/* Header */}
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center bg-stone-900 text-stone-50">
                  <Lock className="h-5 w-5 stroke-[1.5]" />
                </div>
                <h1 className="font-serif text-3xl font-normal text-stone-950">Sign In</h1>
                <p className="mt-2 font-sans text-xs text-stone-600 leading-relaxed">
                  Enter your credentials to access your architectural projects and workspace.
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

              {/* Login Form */}
              <form onSubmit={handleLogin} className="space-y-5" noValidate>
                <div>
                  <label
                    htmlFor="login-email"
                    className="block font-mono text-[11px] uppercase tracking-wider text-stone-700 mb-1.5"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <input
                      id="login-email"
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
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="login-password"
                      className="block font-mono text-[11px] uppercase tracking-wider text-stone-700"
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setResetEmail(email);
                        setIsForgotPassword(true);
                        setErrorMessage(null);
                      }}
                      className="font-mono text-[10px] uppercase tracking-wider text-stone-500 hover:text-terracotta-600 transition-colors"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="••••••••"
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

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 bg-stone-900 py-3.5 px-4 font-sans text-xs font-semibold tracking-widest uppercase text-stone-50 hover:bg-stone-800 disabled:opacity-60 transition-all shadow-sm mt-2"
                >
                  {loading ? (
                    <span className="font-mono text-xs">Authenticating…</span>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Navigation to Register */}
              <div className="mt-8 border-t border-stone-200 pt-6 text-center">
                <p className="font-sans text-xs text-stone-600">
                  Don't have an account?{' '}
                  <Link
                    href={`/register${nextUrl !== '/dashboard' ? `?next=${encodeURIComponent(nextUrl)}` : ''}`}
                    className="font-semibold text-terracotta-600 hover:text-terracotta-700 underline underline-offset-4 transition-colors"
                  >
                    Create Account
                  </Link>
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Forgot Password View */}
              <div className="mb-6 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setResetSuccess(false);
                    setResetError(null);
                  }}
                  className="mb-4 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-stone-500 hover:text-stone-900 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Sign In
                </button>
                <h2 className="font-serif text-2xl font-normal text-stone-950">Reset Password</h2>
                <p className="mt-1 font-sans text-xs text-stone-600">
                  Enter your registered email to receive password reset instructions.
                </p>
              </div>

              {resetSuccess ? (
                <div className="space-y-4">
                  <div className="border border-sage-500/30 bg-emerald-50/70 p-4 text-xs text-emerald-900 flex items-start gap-3">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 mt-0.5" />
                    <div>
                      <p className="font-medium">Instructions Sent</p>
                      <p className="mt-1 text-emerald-800">
                        If an account exists for {resetEmail}, instructions to reset your password have been sent.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(false);
                      setResetSuccess(false);
                    }}
                    className="w-full border border-stone-300 py-3 font-sans text-xs font-semibold tracking-wider uppercase text-stone-800 hover:border-stone-900 transition-colors"
                  >
                    Return to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  {resetError && (
                    <div className="border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                      <span>{resetError}</span>
                    </div>
                  )}
                  <div>
                    <label className="block font-mono text-[11px] uppercase tracking-wider text-stone-700 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="architect@studio.com"
                      className="w-full border border-stone-300 bg-white px-4 py-3 font-sans text-sm text-stone-900 placeholder-stone-400 focus:border-stone-900 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full bg-stone-900 py-3.5 font-sans text-xs font-semibold tracking-widest uppercase text-stone-50 hover:bg-stone-800 disabled:opacity-60 transition-all"
                  >
                    {resetLoading ? 'Sending…' : 'Send Reset Link'}
                  </button>
                </form>
              )}
            </>
          )}

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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center font-mono text-xs uppercase text-stone-500">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
