'use client';

import React from 'react';
import Link from 'next/link';
import Navbar from '@/components/navigation/Navbar';
import {
  Upload, MapPin, Sliders, Palette, Layers, Box, Sparkles, ArrowRight, CheckCircle2, ShieldCheck
} from 'lucide-react';

export default function HowItWorksPage() {
  const steps = [
    {
      num: '01',
      title: 'Upload Site & Boundary',
      icon: Upload,
      desc: 'Input plot dimensions (width × depth), site area, and road-facing orientation (North, East, South, West). Attach land documents or sketches if available.',
      details: ['Plot Boundary Grid Mapping', 'Road Facing Alignment', 'Site Orientation Rules']
    },
    {
      num: '02',
      title: 'Select Location & Climate Context',
      icon: MapPin,
      desc: 'Specify your city and country location. ArchAdapt retrieves geographical and regional climate parameters (e.g. tropical humid monsoon in Kochi, Kerala).',
      details: ['Latitude/Longitude Mapping', 'Climate Zone Adaptation', 'Passive Wind Capture Strategy']
    },
    {
      num: '03',
      title: 'Define Family Requirements',
      icon: Sliders,
      desc: 'Specify family size, bedroom counts, ensuite bathrooms, floors, parking capacity, and requested spatial amenities like courtyards, study rooms, or balconies.',
      details: ['Spatial Area Budgeting', 'Room Adjacency Matrix', 'Custom Lifestyle Directives']
    },
    {
      num: '04',
      title: 'Choose Special Modes & Style',
      icon: Palette,
      desc: 'Select from Climate-Adaptive, Life-Stage, Budget-First, or Renovation modes, and select your primary architectural style (e.g., Kerala Traditional, Modern, Minimalist).',
      details: ['Multi-Mode Synthesis', 'Design Signature Generation', 'Style-Aware Facade Directives']
    },
    {
      num: '05',
      title: 'Generate 2D Conceptual Floor Plan',
      icon: Layers,
      desc: 'Our constraint-driven architectural engine transforms your parameters into a validated, non-generic 2D floor plan JSON rendered in an interactive SVG editor.',
      details: ['100% Validated Structured JSON', 'Normalized Grid Percentages', 'Room Dimension Tags']
    },
    {
      num: '06',
      title: 'Interactive 3D Massing Preview',
      icon: Box,
      desc: 'Inspect exterior volumes, floor heights, open-to-sky courtyard light wells, and style-aware roof geometry (sloped terracotta gables vs flat modern parapets) in Three.js.',
      details: ['Deterministic Massing Builder', 'Style-Aware Roof Geometry', 'Orbit & Daylight Controls']
    },
    {
      num: '07',
      title: 'Iterate via What-If Conversational Engine',
      icon: Sparkles,
      desc: 'Refine your design naturally by chatting: "Add another bedroom", "Make kitchen 20% larger", or "Change to Kerala + Modern". Compare versions side-by-side.',
      details: ['Delta-Based What-If Processing', 'Version History Comparison', 'Feasibility Rejection Handling']
    }
  ];

  return (
    <div className="min-h-screen bg-[#F9F8F6] text-stone-900 selection:bg-terracotta-500 selection:text-white">
      <Navbar />

      {/* Hero */}
      <section className="border-b border-stone-200 py-16 lg:py-24 bg-[#F4F2EC]/60">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="max-w-3xl space-y-4">
            <span className="font-mono text-xs uppercase tracking-widest text-terracotta-500 font-semibold">
              The ArchAdapt AI Workflow
            </span>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-light text-stone-950 leading-tight">
              How ArchAdapt AI Engine Works
            </h1>
            <p className="font-sans text-base text-stone-600 leading-relaxed max-w-2xl">
              From site boundaries and location climate to 2D structured floor plans and style-aware 3D previews — discover how our 7-stage generative workflow transforms constraints into living architectural concepts.
            </p>
          </div>
        </div>
      </section>

      {/* Steps List */}
      <section className="py-20 mx-auto max-w-7xl px-6 lg:px-12">
        <div className="space-y-12">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.num}
                className="border border-stone-300 bg-white p-8 lg:p-10 shadow-sm hover:border-stone-900 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-8 group"
              >
                <div className="space-y-4 max-w-2xl">
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-3xl font-light text-terracotta-500">{s.num}</span>
                    <div className="flex h-10 w-10 items-center justify-center bg-stone-100 border border-stone-200 text-stone-800 group-hover:bg-stone-900 group-hover:text-stone-50 transition-all">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-serif text-2xl font-medium text-stone-950">{s.title}</h3>
                  </div>

                  <p className="font-sans text-sm text-stone-600 leading-relaxed">{s.desc}</p>
                </div>

                <div className="border-t lg:border-t-0 lg:border-l border-stone-200 pt-6 lg:pt-0 lg:pl-8 space-y-2 font-mono text-xs text-stone-600 shrink-0">
                  <div className="uppercase tracking-wider font-semibold text-stone-400 text-[10px]">Key Technical Features</div>
                  {s.details.map((d, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-stone-700">
                      <CheckCircle2 className="h-3.5 w-3.5 text-terracotta-500 shrink-0" />
                      <span>{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-20 border border-stone-300 bg-stone-900 text-stone-50 p-12 text-center space-y-6">
          <span className="font-mono text-xs uppercase tracking-widest text-terracotta-400 font-semibold">
            Start Your Project
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-light">
            Ready to generate your first adaptive house concept?
          </h2>
          <p className="font-sans text-stone-400 text-sm max-w-xl mx-auto leading-relaxed">
            Enter your plot constraints, choose your preferred design modes and style, and explore endless What-If possibilities.
          </p>
          <div className="pt-2">
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-3 bg-terracotta-500 px-8 py-4 font-sans text-xs font-semibold uppercase tracking-widest text-white hover:bg-terracotta-600 transition-all shadow-md"
            >
              Start Designing Now
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-800 bg-stone-950 text-stone-400 py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-6 font-mono text-xs text-stone-500">
          <div>© 2026 ArchAdapt AI Studio • Core Generative Architectural Engine</div>
          <div className="flex items-center gap-6">
            <Link href="/how-it-works" className="hover:text-stone-300">How It Works</Link>
            <Link href="/styles" className="hover:text-stone-300">Styles</Link>
            <Link href="/modes" className="hover:text-stone-300">Modes</Link>
            <Link href="/dashboard" className="hover:text-stone-300">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
