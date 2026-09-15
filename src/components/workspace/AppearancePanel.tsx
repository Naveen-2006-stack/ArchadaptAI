'use client';

import React from 'react';
import { HouseAppearance } from '@/types/architectural';
import { WALL_COLOR_PRESETS, ROOF_COLOR_PRESETS, FRAME_COLOR_PRESETS } from '@/lib/geometry/materials';
import { Palette, X } from 'lucide-react';

interface AppearancePanelProps {
  appearance: HouseAppearance;
  onChange: (updated: HouseAppearance) => void;
  onClose: () => void;
}

export default function AppearancePanel({ appearance, onChange, onClose }: AppearancePanelProps) {
  return (
    <div className="absolute top-16 right-6 z-30 w-80 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border border-stone-300 dark:border-stone-700 shadow-2xl p-5 text-stone-900 dark:text-stone-100 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
        <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-stone-800 dark:text-stone-200">
          <Palette className="h-4 w-4 text-terracotta-500" />
          <span>House Appearance</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Wall Plaster Color */}
      <div className="space-y-2">
        <label className="font-mono text-[10px] uppercase font-bold text-stone-500 tracking-wider">Wall Plaster Color</label>
        <div className="flex items-center gap-2">
          {WALL_COLOR_PRESETS.map((preset) => {
            const isSelected = appearance.wallColor.toLowerCase() === preset.hex.toLowerCase();
            return (
              <button
                key={preset.name}
                onClick={() => onChange({ ...appearance, wallColor: preset.hex })}
                className={`h-7 w-7 rounded-full border transition-all ${
                  isSelected ? 'ring-2 ring-terracotta-500 scale-110 border-stone-900' : 'border-stone-300 hover:scale-105'
                }`}
                style={{ backgroundColor: preset.hex }}
                title={preset.name}
              />
            );
          })}
          <input
            type="color"
            value={appearance.wallColor}
            onChange={(e) => onChange({ ...appearance, wallColor: e.target.value })}
            className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
            title="Custom Wall Color"
          />
        </div>
      </div>

      {/* Roof Tile Color */}
      <div className="space-y-2">
        <label className="font-mono text-[10px] uppercase font-bold text-stone-500 tracking-wider">Roof Tile Color</label>
        <div className="flex items-center gap-2">
          {ROOF_COLOR_PRESETS.map((preset) => {
            const isSelected = appearance.roofColor.toLowerCase() === preset.hex.toLowerCase();
            return (
              <button
                key={preset.name}
                onClick={() => onChange({ ...appearance, roofColor: preset.hex })}
                className={`h-7 w-7 rounded-full border transition-all ${
                  isSelected ? 'ring-2 ring-terracotta-500 scale-110 border-stone-900' : 'border-stone-300 hover:scale-105'
                }`}
                style={{ backgroundColor: preset.hex }}
                title={preset.name}
              />
            );
          })}
          <input
            type="color"
            value={appearance.roofColor}
            onChange={(e) => onChange({ ...appearance, roofColor: e.target.value })}
            className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
            title="Custom Roof Color"
          />
        </div>
      </div>

      {/* Window Frame Color */}
      <div className="space-y-2">
        <label className="font-mono text-[10px] uppercase font-bold text-stone-500 tracking-wider">Window & Door Frame</label>
        <div className="flex items-center gap-2">
          {FRAME_COLOR_PRESETS.map((preset) => {
            const isSelected = appearance.frameColor.toLowerCase() === preset.hex.toLowerCase();
            return (
              <button
                key={preset.name}
                onClick={() => onChange({ ...appearance, frameColor: preset.hex })}
                className={`h-7 w-7 rounded-full border transition-all ${
                  isSelected ? 'ring-2 ring-terracotta-500 scale-110 border-stone-900' : 'border-stone-300 hover:scale-105'
                }`}
                style={{ backgroundColor: preset.hex }}
                title={preset.name}
              />
            );
          })}
        </div>
      </div>

      {/* Accent Material */}
      <div className="space-y-2">
        <label className="font-mono text-[10px] uppercase font-bold text-stone-500 tracking-wider">Facade Accent Material</label>
        <div className="grid grid-cols-3 gap-2">
          {(['wood', 'stone', 'concrete'] as const).map((mat) => {
            const isSelected = appearance.accentMaterial === mat;
            return (
              <button
                key={mat}
                onClick={() => onChange({ ...appearance, accentMaterial: mat })}
                className={`py-1.5 font-mono text-[10px] uppercase tracking-wider border text-center transition-all ${
                  isSelected
                    ? 'bg-stone-900 text-stone-50 border-stone-900 font-bold dark:bg-stone-100 dark:text-stone-900'
                    : 'border-stone-300 text-stone-600 dark:text-stone-400 hover:border-stone-900'
                }`}
              >
                {mat}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-2 text-[10px] font-mono text-stone-500 text-center border-t border-stone-200 dark:border-stone-800">
        Material changes update 3D preview instantly without altering 2D plan geometry.
      </div>
    </div>
  );
}
