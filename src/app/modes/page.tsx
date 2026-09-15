'use client';

import React from 'react';
import Link from 'next/link';
import Navbar from '@/components/navigation/Navbar';
import { Wind, Users, DollarSign, RefreshCw, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';

export default function SpecialModesPage() {
  const modesList = [
    {
      id: 'climate_adaptive',
      name: 'Climate-Adaptive Mode',
      icon: Wind,
      color: 'text-sage-500',
      badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      summary: 'Optimizes passive ventilation, solar heat mitigation, and stack-effect cooling based on regional climate.',
      keyPillars: [
        'Central open-to-sky courtyards (Nadumuttam) for passive stack ventilation',
        'North-South window alignment for prevailing wind capture',
        'Deep roof eaves pitch (30-45°) to shade openings from monsoon rain & zenith sun',
        'Thermal buffer zones placing closets/utility along high-heat West facades'
      ],
      architecturalResult: 'Floor plan automatically positions living and dining halls for cross ventilation and creates natural light cores.'
    },
    {
      id: 'life_stage',
      name: 'Life-Stage Mode',
      icon: Users,
      color: 'text-blueprint-500',
      badgeBg: 'bg-blue-50 text-blue-800 border-blue-300',
      summary: 'Prioritizes lifelong accessibility, aging-in-place, and flexible space conversion over family life cycles.',
      keyPillars: [
        'Mandatory ground-floor Master Bedroom suite with ensuite bathroom',
        'Zero-step threshold entrances and wider 36-inch (3-foot) door passages',
        'Flex-rooms near entrance transitioning from office to nursery to senior suite',
        'Vertical plumbing stack alignment for simple future upper-floor additions'
      ],
      architecturalResult: 'Eliminates step barriers on the ground level and reduces circulation complexity for elderly family members.'
    },
    {
      id: 'budget_first',
      name: 'Budget-First Mode',
      icon: DollarSign,
      color: 'text-terracotta-500',
      badgeBg: 'bg-amber-50 text-amber-900 border-amber-300',
      summary: 'Minimizes structural footprint complexity and consolidates wet services to lower construction costs.',
      keyPillars: [
        'Compact rectilinear building perimeter footprint reducing wall surface area',
        'Consolidated wet zones (kitchen, bathrooms, utility) sharing back-to-back plumbing stacks',
        'Prioritizes multi-functional high-ceiling spaces over excess unused square footage',
        'Modular expansion nodes enabling future financial phase additions without structural teardowns'
      ],
      architecturalResult: 'Reduces plumbing pipe runs, structural wall overhangs, and unnecessary corridor square footage.'
    },
    {
      id: 'renovation',
      name: 'Renovation Mode',
      icon: RefreshCw,
      color: 'text-stone-800',
      badgeBg: 'bg-stone-100 text-stone-900 border-stone-300',
      summary: 'Preserves existing structural walls while integrating new room additions and modern opening extensions.',
      keyPillars: [
        'Identifies retained vs modified vs new structural walls',
        'Preserves load-bearing structural cores during space re-allocation',
        'Integrates new room expansion nodes smoothly into existing circulation spines',
        'Modern facade cladding extensions wrapping existing masonry'
      ],
      architecturalResult: 'Maintains key existing room locations while introducing modern open-plan extensions.'
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
              Architectural Design Modes
            </span>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-light text-stone-950 leading-tight">
              Special Architectural Modes
            </h1>
            <p className="font-sans text-base text-stone-600 leading-relaxed max-w-2xl">
              Special modes steer the spatial reasoning of our architectural engine. They directly influence room placement, door threshold sizing, plumbing consolidation, and solar shading.
            </p>
          </div>
        </div>
      </section>

      {/* Multi-Mode Synthesis Banner */}
      <section className="border-b border-stone-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="border border-stone-300 bg-[#F9F8F6] p-8 lg:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2 font-mono text-xs uppercase text-terracotta-500 font-semibold">
                <Sparkles className="h-4 w-4" />
                <span>Multi-Mode Synthesis</span>
              </div>
              <h3 className="font-serif text-2xl font-medium text-stone-950">
                Combine Multiple Modes (e.g. "Climate-Adaptive + Life-Stage + Budget-First")
              </h3>
              <p className="font-sans text-xs text-stone-600 leading-relaxed">
                You can activate multiple modes simultaneously. The engine synthesizes their objectives: placing an accessible ground-floor master suite (<span className="font-semibold text-stone-900">Life-Stage</span>) next to a stack-ventilation courtyard (<span className="font-semibold text-stone-900">Climate-Adaptive</span>) while sharing back-to-back wet walls (<span className="font-semibold text-stone-900">Budget-First</span>).
              </p>
            </div>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 bg-stone-900 px-6 py-3 font-sans text-xs font-semibold uppercase tracking-widest text-stone-50 hover:bg-stone-800 transition-all shrink-0"
            >
              Select Active Modes
              <ArrowRight className="h-4 w-4 text-terracotta-400" />
            </Link>
          </div>
        </div>
      </section>

      {/* Modes Grid */}
      <section className="py-20 mx-auto max-w-7xl px-6 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {modesList.map((mode) => {
            const Icon = mode.icon;
            return (
              <div key={mode.id} className="border border-stone-300 bg-white p-8 lg:p-10 flex flex-col justify-between hover:border-stone-900 transition-all group">
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-stone-200 pb-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center bg-stone-100 border border-stone-200 group-hover:bg-stone-900 group-hover:text-stone-50 transition-colors">
                        <Icon className={`h-6 w-6 ${mode.color}`} />
                      </div>
                      <h3 className="font-serif text-2xl font-medium text-stone-950">{mode.name}</h3>
                    </div>
                  </div>

                  <p className="font-sans text-sm text-stone-600 leading-relaxed">
                    {mode.summary}
                  </p>

                  <div className="space-y-2">
                    <div className="font-mono text-[10px] uppercase font-bold text-stone-400">Design Implementation Pillars</div>
                    {mode.keyPillars.map((p, pIdx) => (
                      <div key={pIdx} className="flex items-start gap-2.5 font-sans text-xs text-stone-700 leading-normal">
                        <CheckCircle2 className="h-3.5 w-3.5 text-terracotta-500 shrink-0 mt-0.5" />
                        <span>{p}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-stone-100">
                  <div className="font-mono text-[10px] uppercase font-bold text-stone-400">Spatial Result</div>
                  <p className="font-sans text-xs text-stone-600 leading-relaxed mt-1 italic">
                    "{mode.architecturalResult}"
                  </p>
                </div>
              </div>
            );
          })}
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
