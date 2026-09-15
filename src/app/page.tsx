'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Navbar from '@/components/navigation/Navbar';
import { ArrowRight, Compass, Layers, ShieldCheck, Sparkles, Wind, Users, DollarSign, RefreshCw, Box, CheckCircle2 } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F9F8F6] text-stone-900 selection:bg-terracotta-500 selection:text-white">
      {/* Sticky Editorial Navigation Header */}
      <Navbar />

      {/* Hero Section */}
      <section className="relative border-b border-stone-200 pt-16 pb-24 lg:pt-28 lg:pb-36 overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Copy */}
            <div className="lg:col-span-7 space-y-8">
              <div className="inline-flex items-center gap-2 border border-stone-300 bg-white/80 px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-widest text-stone-800 shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-terracotta-500" />
                <span>Conversational GenAI Architectural Studio</span>
              </div>

              <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-light tracking-tight text-stone-950 leading-[1.08]">
                Design a home that <span className="italic font-normal text-terracotta-500">adapts</span> to you.
              </h1>

              <p className="font-sans text-lg text-stone-600 max-w-2xl leading-relaxed">
                Create conceptual house floor plans based on site constraints, location, family needs, budget, and architectural preferences — then continuously refine your design through natural What-If conversation.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  href="/onboarding"
                  className="flex items-center gap-3 bg-stone-900 px-8 py-4 font-sans text-xs font-semibold uppercase tracking-widest text-stone-50 hover:bg-stone-800 transition-all shadow-md group"
                >
                  Start Designing
                  <ArrowRight className="h-4 w-4 text-terracotta-400 group-hover:translate-x-1 transition-transform" />
                </Link>
                <a
                  href="#how-it-works"
                  className="flex items-center gap-2 border border-stone-900 px-8 py-4 font-sans text-xs font-semibold uppercase tracking-widest text-stone-900 hover:bg-stone-100 transition-all"
                >
                  See How It Works
                </a>
              </div>

              <div className="pt-8 border-t border-stone-200 flex items-center gap-8 font-mono text-xs text-stone-500">
                <div>
                  <span className="font-bold text-stone-900">100%</span> STRUCTURED JSON OUTPUT
                </div>
                <div className="h-4 w-px bg-stone-300"></div>
                <div>
                  <span className="font-bold text-stone-900">2D & 3D</span> CONCEPTUAL VISUALIZATION
                </div>
              </div>
            </div>

            {/* Right Architectural Image Preview */}
            <div className="lg:col-span-5 relative">
              <div className="relative border border-stone-300 bg-white p-3 shadow-2xl">
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-stone-100">
                  <Image
                    src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80"
                    alt="Modern Architectural Cladding & Glass Residence"
                    fill
                    className="object-cover transition-transform duration-700 hover:scale-105"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-950/75 via-transparent to-transparent"></div>
                  <div className="absolute bottom-6 left-6 right-6 text-stone-50">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-terracotta-400">
                      Kerala Modern • Version 3
                    </span>
                    <h3 className="font-serif text-xl font-medium mt-1">Timber Clad Tropical Residence</h3>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architectural Style & Inspiration Showcase */}
      <section id="styles" className="border-b border-stone-200 py-24 bg-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-terracotta-500">Architectural Styles</span>
              <h2 className="font-serif text-3xl sm:text-4xl font-normal text-stone-900 mt-2">
                From Kerala Traditional to Modern Luxury
              </h2>
            </div>
            <p className="font-sans text-sm text-stone-600 max-w-md">
              Select or blend custom styles. ArchAdapt AI tailors openings, roof overhangs, cladding, and spatial hierarchy to your design identity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                style: 'Modern Architectural',
                img: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80',
                desc: 'Vertical timber slats, cantilevered upper massing, floor-to-ceiling glass sliders, and indoor-outdoor integration.'
              },
              {
                style: 'Kerala Traditional',
                img: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=800&q=80',
                desc: 'Nadumuttam central open courtyard, sloped clay tile roofs, exposed laterite masonry, and deep Sit-out verandahs.'
              },
              {
                style: 'Contemporary Minimalist',
                img: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
                desc: 'Clean rectilinear geometry, polished concrete render, muted stone textures, and ambient daylight shafts.'
              }
            ].map((item, idx) => (
              <div key={idx} className="border border-stone-200 bg-[#F9F8F6] overflow-hidden group hover:border-stone-900 transition-all">
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                  <Image
                    src={item.img}
                    alt={item.style}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-6 space-y-2">
                  <h3 className="font-serif text-xl font-medium text-stone-900">{item.style}</h3>
                  <p className="font-sans text-xs text-stone-600 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="border-b border-stone-200 py-24 bg-[#F9F8F6]">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="font-mono text-xs uppercase tracking-widest text-terracotta-500">The ArchAdapt Workflow</span>
            <h2 className="font-serif text-3xl sm:text-4xl font-normal text-stone-900 mt-2">
              From Site Constraints to Evolutionary Concepts
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { step: '01', title: 'Upload Site & Location', desc: 'Upload land document, sketch, or manual plot dimensions with site orientation.' },
              { step: '02', title: 'Define Requirements', desc: 'Conversational input for family size, bedrooms, budget, and specific spaces.' },
              { step: '03', title: 'Select Modes & Style', desc: 'Combine Climate-Adaptive, Life-Stage, Budget-First modes with Kerala, Modern or Minimalist styles.' },
              { step: '04', title: 'What-If Iteration', desc: 'Modify room dimensions, add spaces, or alter styles in real time while tracking versions.' },
            ].map((s, i) => (
              <div key={i} className="border border-stone-200 p-8 bg-white relative group hover:border-stone-900 transition-all">
                <span className="font-mono text-3xl font-light text-stone-300 group-hover:text-terracotta-500 transition-colors">
                  {s.step}
                </span>
                <h3 className="font-serif text-xl font-medium text-stone-900 mt-4">{s.title}</h3>
                <p className="font-sans text-xs text-stone-600 leading-relaxed mt-2">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Special Design Modes Showcase */}
      <section id="modes" className="border-b border-stone-200 py-24 bg-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-terracotta-500">Special Architectural Modes</span>
              <h2 className="font-serif text-3xl sm:text-4xl font-normal text-stone-900 mt-2">
                Designed for Real-World Living
              </h2>
            </div>
            <p className="font-sans text-sm text-stone-600 max-w-md">
              Combine multiple intelligent modes to steer orientation, accessibility, cost optimization, and adaptive reuse.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Wind,
                title: 'Climate-Adaptive',
                desc: 'Prioritizes passive natural ventilation, solar shading, stack-effect courtyards, and thermal mass reduction.',
                color: 'text-sage-500'
              },
              {
                icon: Users,
                title: 'Life-Stage',
                desc: 'Ensures ground-floor accessibility, flexible nursery/study transition rooms, and zero-threshold doorways.',
                color: 'text-blueprint-500'
              },
              {
                icon: DollarSign,
                title: 'Budget-First',
                desc: 'Optimizes footprint ratio, consolidates plumbing cores, and plans modular multi-phase upper expansions.',
                color: 'text-terracotta-500'
              },
              {
                icon: RefreshCw,
                title: 'Renovation',
                desc: 'Adapts existing structural layouts, room extensions, and structural wall preservation.',
                color: 'text-stone-800'
              }
            ].map((mode, i) => (
              <div key={i} className="border border-stone-200 bg-[#F9F8F6] p-8 space-y-4 hover:shadow-lg transition-shadow">
                <mode.icon className={`h-8 w-8 ${mode.color}`} />
                <h3 className="font-serif text-xl font-medium text-stone-900">{mode.title}</h3>
                <p className="font-sans text-xs text-stone-600 leading-relaxed">{mode.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-stone-900 text-stone-50 text-center">
        <div className="mx-auto max-w-4xl px-6 space-y-6">
          <span className="font-mono text-xs uppercase tracking-widest text-terracotta-400">Architectural Studio Workspace</span>
          <h2 className="font-serif text-4xl sm:text-5xl font-light">
            Ready to design your adaptive house concept?
          </h2>
          <p className="font-sans text-stone-400 max-w-xl mx-auto text-sm leading-relaxed">
            Start from your plot constraints, select your preferred architectural style, and explore endless What-If design possibilities.
          </p>
          <div className="pt-4">
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-3 bg-terracotta-500 px-10 py-4 font-sans text-xs font-semibold uppercase tracking-widest text-white hover:bg-terracotta-600 transition-all shadow-lg"
            >
              Start Designing
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-800 bg-stone-950 text-stone-400 py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <Compass className="h-6 w-6 text-terracotta-400" />
            <span className="font-serif text-xl text-stone-100 font-medium">ARCHADAPT AI</span>
          </div>

          <p className="font-mono text-xs text-stone-500">
            © 2026 ArchAdapt AI Studio. Conceptual Design Assistant.
          </p>
        </div>
      </footer>
    </div>
  );
}
