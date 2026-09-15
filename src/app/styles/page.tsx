'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Navbar from '@/components/navigation/Navbar';
import { Palette, ArrowRight, Layers, Sparkles, CheckCircle2 } from 'lucide-react';

export default function ArchitecturalStylesPage() {
  const stylesList = [
    {
      name: 'Kerala Traditional',
      tagline: 'Vernacular Tropical Heritage & Monsoon Climate Architecture',
      img: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=800&q=80',
      characteristics: [
        'Nadumuttam central open-to-sky courtyard',
        'Sloped terracotta gable rooflines with deep monsoon overhangs',
        'Wood-louvered Sit-out verandahs',
        'Exposed laterite stone masonry and earthen textures'
      ],
      spatialImpact: 'Organizes rooms around a central stack-ventilation courtyard with sheltered exterior verandahs.'
    },
    {
      name: 'Modern',
      tagline: 'Clean Geometries, Open Floor Plans & Seamless Indoor-Outdoor Transition',
      img: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80',
      characteristics: [
        'Cantilevered upper floor massing & clean horizontal parapets',
        'Floor-to-ceiling sliding glass facade panels',
        'Open-plan living, dining, and kitchen spatial spine',
        'Minimalist metal accents and architectural pivot doors'
      ],
      spatialImpact: 'Emphasizes linear circulation, double-height living spaces, and expansive glazed wall connections.'
    },
    {
      name: 'Minimalist',
      tagline: 'Restrained Spatial Composition, Compact Cores & Quiet Materials',
      img: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
      characteristics: [
        'Compact central plumbing & utility core',
        'Flush wall transitions & concealed storage alcoves',
        'Polished cement render & monochrome stone surfaces',
        'Restrained perimeter footprint minimizing circulation loss'
      ],
      spatialImpact: 'Optimizes square footage efficiency with streamlined room layouts and minimal corridor waste.'
    },
    {
      name: 'Contemporary',
      tagline: 'Adaptive Fluid Geometry, Sculptural Facades & High Performance',
      img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
      characteristics: [
        'Asymmetrical rooflines & dynamic volume intersections',
        'Integrated solar shading louvers & green wall recesses',
        'Flexible multi-purpose transition spaces',
        'High-performance insulated glazing'
      ],
      spatialImpact: 'Combines open social spaces with private split-level zoning.'
    },
    {
      name: 'Colonial',
      tagline: 'Symmetrical Formality, High Ceilings & Covered Colonnades',
      img: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=800&q=80',
      characteristics: [
        'Formal central entrance porch & archways',
        'High 12ft ceilings with transom window ventilation',
        'Symmetrical window placement & perimeter colonnades',
        'Dedicated foyer & reception spaces'
      ],
      spatialImpact: 'Enforces clear formal separation between public guest spaces and private family wings.'
    },
    {
      name: 'Tropical',
      tagline: 'Lush Landscape Integration, Deep Overhangs & Natural Light Shafts',
      img: 'https://images.unsplash.com/photo-1600573472550-8090b5e0745e?auto=format&fit=crop&w=800&q=80',
      characteristics: [
        'Semi-open garden courtyards & outdoor showers',
        'Wide roof eaves shading glass openings from zenith solar heat',
        'Natural timber slats & woven bamboo textures',
        'Cross-ventilation wind corridors'
      ],
      spatialImpact: 'Creates deep transitional balconies and semi-covered verandahs surrounding living areas.'
    },
    {
      name: 'Traditional Indian',
      tagline: 'Courtyard-Centered Courtyards, Jali Screens & Sacred Orientations',
      img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
      characteristics: [
        'Sacred North-East Puja room positioning',
        'Carved wooden accents & terracotta jali shading screens',
        'Central family courtyard (Chowk) for social gathering',
        'Shaded roof terraces & sit-outs'
      ],
      spatialImpact: 'Prioritizes central courtyard gathering cores and cardinal spatial zoning.'
    },
    {
      name: 'Modern Luxury',
      tagline: 'Double-Height Voids, Premium Materiality & Private Suites',
      img: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=800&q=80',
      characteristics: [
        'Double-height grand living hall with ceiling light shafts',
        'Spacious ensuite master bedrooms with walk-in wardrobes',
        'Covered multi-car parking garage & security foyer',
        'Private infinity balcony terraces'
      ],
      spatialImpact: 'Generous room dimensions, private ensuite zones, and dramatic double-height living volumes.'
    }
  ];

  return (
    <div className="min-h-screen bg-[#F9F8F6] text-stone-900 selection:bg-terracotta-500 selection:text-white">
      <Navbar />

      {/* Header Banner */}
      <section className="border-b border-stone-200 py-16 lg:py-24 bg-[#F4F2EC]/60">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="max-w-3xl space-y-4">
            <span className="font-mono text-xs uppercase tracking-widest text-terracotta-500 font-semibold">
              Supported Architectural Styles
            </span>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-light text-stone-950 leading-tight">
              Architectural Styles & Expressions
            </h1>
            <p className="font-sans text-base text-stone-600 leading-relaxed max-w-2xl">
              ArchAdapt AI supports a curated library of architectural styles. Each style dynamically alters spatial layout strategies, roof profiles, verandah placements, and opening proportions.
            </p>
          </div>
        </div>
      </section>

      {/* Style Synthesis Concept Callout */}
      <section className="border-b border-stone-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="border border-stone-300 bg-[#F9F8F6] p-8 lg:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2 font-mono text-xs uppercase text-terracotta-500 font-semibold">
                <Sparkles className="h-4 w-4" />
                <span>Multi-Style Synthesis</span>
              </div>
              <h3 className="font-serif text-2xl font-medium text-stone-950">
                Combine Styles for Unique Hybrid Concepts (e.g. "Kerala + Modern")
              </h3>
              <p className="font-sans text-xs text-stone-600 leading-relaxed">
                You can select a primary style (e.g. <span className="font-semibold text-stone-900">Kerala Traditional</span>) and secondary style (e.g. <span className="font-semibold text-stone-900">Modern</span>). The engine combines compatible characteristics: traditional Nadumuttam courtyards and sloped terracotta gables with crisp floor-to-ceiling glass sliders.
              </p>
            </div>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 bg-stone-900 px-6 py-3 font-sans text-xs font-semibold uppercase tracking-widest text-stone-50 hover:bg-stone-800 transition-all shrink-0"
            >
              Try Hybrid Styles
              <ArrowRight className="h-4 w-4 text-terracotta-400" />
            </Link>
          </div>
        </div>
      </section>

      {/* Styles Grid */}
      <section className="py-20 mx-auto max-w-7xl px-6 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {stylesList.map((st, idx) => (
            <div key={idx} className="border border-stone-300 bg-white overflow-hidden group hover:border-stone-900 transition-all flex flex-col justify-between">
              <div>
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-stone-100">
                  <Image
                    src={st.img}
                    alt={st.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-950/60 via-transparent to-transparent"></div>
                  <div className="absolute bottom-4 left-6 right-6 text-white font-serif text-2xl font-medium">
                    {st.name}
                  </div>
                </div>

                <div className="p-8 space-y-6">
                  <p className="font-mono text-xs uppercase tracking-wider text-terracotta-500 font-semibold">
                    {st.tagline}
                  </p>

                  <div className="space-y-2">
                    <div className="font-mono text-[10px] uppercase font-bold text-stone-400">Architectural Characteristics</div>
                    {st.characteristics.map((c, cIdx) => (
                      <div key={cIdx} className="flex items-center gap-2.5 font-sans text-xs text-stone-700">
                        <CheckCircle2 className="h-3.5 w-3.5 text-stone-900 shrink-0" />
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-stone-100">
                    <div className="font-mono text-[10px] uppercase font-bold text-stone-400">Spatial Layout Impact</div>
                    <p className="font-sans text-xs text-stone-600 leading-relaxed mt-1 italic">
                      "{st.spatialImpact}"
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
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
