'use client';

import React from 'react';
import { FloorPlanVersion } from '@/types/architectural';
import { X, ArrowRight, Layers, Check, AlertTriangle } from 'lucide-react';
import { evaluateConceptDiversity } from '@/lib/design/conceptDiversity';

interface VersionComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  versionA: FloorPlanVersion | null;
  versionB: FloorPlanVersion | null;
  onRestoreVersion: (version: FloorPlanVersion) => void;
}

export default function VersionComparisonModal({
  isOpen,
  onClose,
  versionA,
  versionB,
  onRestoreVersion
}: VersionComparisonModalProps) {
  if (!isOpen || !versionA || !versionB) return null;

  const roomsA = versionA.structuredDesign.rooms || [];
  const roomsB = versionB.structuredDesign.rooms || [];

  const addedRooms = roomsB.filter(rb => !roomsA.some(ra => ra.id === rb.id || ra.name === rb.name));
  const removedRooms = roomsA.filter(ra => !roomsB.some(rb => rb.id === ra.id || rb.name === ra.name));
  const diversity = evaluateConceptDiversity(versionA.structuredDesign, versionB.structuredDesign);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 backdrop-blur-sm p-6 select-none">
      <div className="relative w-full max-w-4xl border border-stone-700 bg-[#15181C] text-stone-100 p-8 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-6 top-6 text-stone-400 hover:text-stone-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-6 border-b border-stone-800 pb-4">
          <div className="flex items-center gap-2 font-mono text-xs uppercase text-terracotta-400 font-bold tracking-widest">
            <Layers className="h-4 w-4" />
            Architectural Version Comparison
          </div>
          <h2 className="font-serif text-2xl font-normal text-stone-100 mt-1">
            Comparing Version {versionA.versionNumber} vs Version {versionB.versionNumber}
          </h2>
        </div>

        {/* Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto pr-2 flex-1">
          {/* Version A Card */}
          <div className="border border-stone-800 bg-[#111315] p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3 font-mono text-xs uppercase">
              <span className="text-stone-400">VERSION {versionA.versionNumber}</span>
              <span className="text-stone-500">{versionA.structuredDesign.totalBuiltUpAreaSqFt} SQ FT</span>
            </div>
            <h3 className="font-serif text-lg font-medium text-stone-200">{versionA.title}</h3>
            <p className="font-sans text-xs text-stone-400 italic">"{versionA.rationale}"</p>

            <div>
              <span className="font-mono text-[10px] uppercase text-stone-500 tracking-wider">ROOMS INCLUDED ({roomsA.length})</span>
              <div className="mt-2 space-y-1.5 font-mono text-xs text-stone-300">
                {roomsA.map(r => (
                  <div key={r.id} className="flex justify-between border-b border-stone-900 pb-1">
                    <span>• {r.name}</span>
                    <span className="text-stone-500">{r.dimensions}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-stone-800 p-3 space-y-1.5">
              <span className="font-mono text-[10px] uppercase text-terracotta-400 font-bold tracking-wider">Architectural Organization</span>
              <div className="font-mono text-[11px] text-stone-300">Footprint: {versionA.structuredDesign.footprint?.shapeType || 'custom'} → {versionB.structuredDesign.footprint?.shapeType || 'custom'}</div>
              <div className="font-mono text-[11px] text-stone-300">Circulation: {versionA.structuredDesign.designSignature?.circulationType || 'custom'} → {versionB.structuredDesign.designSignature?.circulationType || 'custom'}</div>
              <div className="font-mono text-[11px] text-stone-300">Zoning: {versionA.structuredDesign.designSignature?.privatePublicZoning || 'custom'} → {versionB.structuredDesign.designSignature?.privatePublicZoning || 'custom'}</div>
              <div className="font-mono text-[11px] text-stone-400">Diversity: {Math.round(diversity.overallScore * 100)}%</div>
              {diversity.reasons.slice(0, 3).map((reason, index) => <div key={index} className="text-xs text-stone-400">• {reason}</div>)}
            </div>
          </div>

          {/* Version B Card */}
          <div className="border border-terracotta-500/60 bg-[#181A1D] p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3 font-mono text-xs uppercase">
              <span className="text-terracotta-400 font-bold">VERSION {versionB.versionNumber} (ACTIVE)</span>
              <span className="text-stone-300 font-bold">{versionB.structuredDesign.totalBuiltUpAreaSqFt} SQ FT</span>
            </div>
            <h3 className="font-serif text-lg font-medium text-stone-100">{versionB.title}</h3>
            <p className="font-sans text-xs text-stone-300 italic">"{versionB.rationale}"</p>

            <div>
              <span className="font-mono text-[10px] uppercase text-terracotta-400 font-bold tracking-wider">STRUCTURAL DELTAS & CHANGES</span>
              <div className="mt-2 space-y-2 font-sans text-xs text-stone-300">
                {addedRooms.length > 0 && (
                  <div className="bg-emerald-950/40 border border-emerald-800/60 p-2 text-emerald-300">
                    <span className="font-mono font-bold text-[10px] uppercase block mb-1">Added Spaces:</span>
                    {addedRooms.map(r => (
                      <div key={r.id}>+ {r.name} ({r.dimensions})</div>
                    ))}
                  </div>
                )}
                {removedRooms.length > 0 && (
                  <div className="bg-red-950/40 border border-red-800/60 p-2 text-red-300">
                    <span className="font-mono font-bold text-[10px] uppercase block mb-1">Removed Spaces:</span>
                    {removedRooms.map(r => (
                      <div key={r.id}>- {r.name}</div>
                    ))}
                  </div>
                )}
                {addedRooms.length === 0 && removedRooms.length === 0 && (
                  <div className="text-stone-400 font-mono text-xs">
                    Dimensions and spatial positions adjusted.
                  </div>
                )}
              </div>
            </div>

            {/* Trade-offs list */}
            {versionB.tradeOffs && versionB.tradeOffs.length > 0 && (
              <div className="pt-2">
                <span className="font-mono text-[10px] uppercase text-amber-400 font-bold tracking-wider flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Key Trade-offs
                </span>
                <div className="mt-1.5 space-y-1 font-sans text-xs text-stone-400">
                  {versionB.tradeOffs.map((t, idx) => (
                    <div key={idx}>• {t}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-6 pt-4 border-t border-stone-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-6 py-2.5 border border-stone-700 text-stone-300 font-mono text-xs uppercase hover:border-stone-500"
          >
            Close Comparison
          </button>

          <button
            onClick={() => {
              onRestoreVersion(versionA);
              onClose();
            }}
            className="flex items-center gap-2 bg-stone-100 text-stone-950 px-6 py-2.5 font-mono text-xs uppercase font-bold hover:bg-white"
          >
            Restore Version {versionA.versionNumber}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
