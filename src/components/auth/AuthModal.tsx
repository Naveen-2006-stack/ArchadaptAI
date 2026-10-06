'use client';

import React, { useState } from 'react';
import { X, Lock, UserPlus, ArrowRight, ShieldCheck, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: { name: string; email: string }) => void;
}

export default function AuthModal({ isOpen, onClose, onAuthSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Google OAuth intentionally disabled for the current release.
  // Can be re-enabled after authentication flow is fully verified.
  /*
  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });
      if (error) {
        onAuthSuccess({ name: 'Architect User', email: 'architect@studio.ai' });
        onClose();
      }
    } catch {
      onAuthSuccess({ name: 'Architect User', email: 'architect@studio.ai' });
      onClose();
    } finally {
      setLoading(false);
    }
  };
  */

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const emailTrimmed = email.trim();
    if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailTrimmed,
        password
      });

      if (error) {
        setErrorMessage('Invalid email or password.');
        return;
      }

      if (data.session && data.user) {
        const userName = data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'Architect';
        onAuthSuccess({ name: userName, email: data.user.email || emailTrimmed });
        onClose();
      } else {
        setErrorMessage('Unable to establish session. Please try again.');
      }
    } catch {
      setErrorMessage('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    const emailTrimmed = email.trim();
    if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const cleanName = name.trim();
      const { data, error } = await supabase.auth.signUp({
        email: emailTrimmed,
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

      if (data?.user && (!data.user.identities || data.user.identities.length === 0)) {
        setErrorMessage('An account with this email already exists.');
        return;
      }

      if (data.session) {
        onAuthSuccess({ name: cleanName, email: emailTrimmed });
        onClose();
        return;
      }

      // Fallback: immediate password login without email confirmation
      const signInRes = await supabase.auth.signInWithPassword({
        email: emailTrimmed,
        password
      });

      if (signInRes.data?.session) {
        onAuthSuccess({ name: cleanName, email: emailTrimmed });
        onClose();
      } else {
        setErrorMessage('Account created. Please log in with your credentials.');
        setMode('login');
      }
    } catch {
      setErrorMessage('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md border border-stone-200 bg-[#F9F8F6] p-8 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-stone-400 hover:text-stone-900 transition-colors"
          aria-label="Close modal"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Mode Tabs */}
        <div className="mb-6 flex border-b border-stone-200">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMessage(null);
            }}
            className={`flex-1 pb-3 font-mono text-xs uppercase tracking-wider text-center transition-all ${
              mode === 'login'
                ? 'border-b-2 border-stone-900 text-stone-950 font-bold'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMessage(null);
            }}
            className={`flex-1 pb-3 font-mono text-xs uppercase tracking-wider text-center transition-all ${
              mode === 'register'
                ? 'border-b-2 border-stone-900 text-stone-950 font-bold'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center bg-stone-900 text-stone-50">
            {mode === 'login' ? <Lock className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          </div>
          <h2 className="font-serif text-2xl font-normal text-stone-900">
            {mode === 'login' ? 'Sign in to ArchAdapt AI' : 'Create an Account'}
          </h2>
          <p className="mt-1 font-sans text-xs text-stone-600">
            {mode === 'login'
              ? 'Access your architectural workspace, saved conceptual plans, and What-If revision history.'
              : 'Register to start designing and saving adaptive architectural projects.'}
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2.5 border border-red-200 bg-red-50 p-3 text-xs text-red-800"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <span className="font-sans font-medium">{errorMessage}</span>
          </div>
        )}

        {/* Login Form */}
        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="architect@studio.com"
                className="w-full border border-stone-300 bg-white px-4 py-3 font-sans text-sm text-stone-900 placeholder-stone-400 focus:border-stone-900 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
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
                  className="absolute right-3 top-3 text-stone-400 hover:text-stone-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 bg-stone-900 py-3.5 font-sans text-xs font-semibold tracking-widest uppercase text-stone-50 hover:bg-stone-800 disabled:opacity-60 transition-all shadow-sm"
            >
              {loading ? (
                'Signing In…'
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Register Form */
          <form onSubmit={handleRegister} className="space-y-3" noValidate>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Elena Rostova"
                className="w-full border border-stone-300 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-900 placeholder-stone-400 focus:border-stone-900 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="architect@studio.com"
                className="w-full border border-stone-300 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-900 placeholder-stone-400 focus:border-stone-900 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="At least 8 characters"
                  className="w-full border border-stone-300 bg-white px-3.5 py-2.5 pr-9 font-sans text-sm text-stone-900 placeholder-stone-400 focus:border-stone-900 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Re-enter password"
                className="w-full border border-stone-300 bg-white px-3.5 py-2.5 font-sans text-sm text-stone-900 placeholder-stone-400 focus:border-stone-900 focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 bg-stone-900 py-3 font-sans text-xs font-semibold tracking-widest uppercase text-stone-50 hover:bg-stone-800 disabled:opacity-60 transition-all shadow-sm mt-2"
            >
              {loading ? (
                'Creating Account…'
              ) : (
                <>
                  Create Account
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-stone-500 font-mono">
          <ShieldCheck className="h-3.5 w-3.5 text-sage-500" />
          Secured by Supabase Row Level Security
        </div>
      </div>
    </div>
  );
}
