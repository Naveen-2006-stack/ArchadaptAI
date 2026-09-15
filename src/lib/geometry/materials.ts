import { HouseAppearance, ArchitecturalStyle } from '@/types/architectural';

export interface MaterialProperties {
  color: string;
  roughness: number;
  metalness: number;
  transmission?: number;
  opacity?: number;
  transparent?: boolean;
}

export interface HouseMaterialSystem {
  wall: MaterialProperties;
  roof: MaterialProperties;
  frame: MaterialProperties;
  glass: MaterialProperties;
  plinth: MaterialProperties;
  woodAccent: MaterialProperties;
  stoneAccent: MaterialProperties;
  lawn: MaterialProperties;
  driveway: MaterialProperties;
}

export const WALL_COLOR_PRESETS = [
  { name: 'Ivory', hex: '#F4F1EA' },
  { name: 'White', hex: '#FAFAFA' },
  { name: 'Sand', hex: '#E6DFD3' },
  { name: 'Warm Grey', hex: '#D5D0C7' },
  { name: 'Cool Grey', hex: '#B0B5BC' },
  { name: 'Terracotta', hex: '#C86A4B' }
];

export const ROOF_COLOR_PRESETS = [
  { name: 'Terracotta', hex: '#C86A4B' },
  { name: 'Dark Brown', hex: '#4A3525' },
  { name: 'Charcoal', hex: '#282623' },
  { name: 'Slate', hex: '#3A424B' },
  { name: 'Grey', hex: '#63666A' }
];

export const FRAME_COLOR_PRESETS = [
  { name: 'Black', hex: '#121417' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Dark Brown', hex: '#3B2A1E' },
  { name: 'Aluminium Grey', hex: '#78736A' }
];

export const DEFAULT_APPEARANCE_BY_STYLE: Record<string, HouseAppearance> = {
  'Kerala Traditional': {
    wallColor: '#F4F1EA',
    roofColor: '#C86A4B',
    frameColor: '#3B2A1E',
    accentMaterial: 'wood'
  },
  'Modern': {
    wallColor: '#FAFAFA',
    roofColor: '#282623',
    frameColor: '#121417',
    accentMaterial: 'wood'
  },
  'Minimalist': {
    wallColor: '#FAFAFA',
    roofColor: '#282623',
    frameColor: '#121417',
    accentMaterial: 'concrete'
  },
  'Contemporary': {
    wallColor: '#E6DFD3',
    roofColor: '#3A424B',
    frameColor: '#121417',
    accentMaterial: 'stone'
  },
  'Colonial': {
    wallColor: '#F4F1EA',
    roofColor: '#4A3525',
    frameColor: '#FFFFFF',
    accentMaterial: 'wood'
  },
  'Tropical': {
    wallColor: '#F4F1EA',
    roofColor: '#C86A4B',
    frameColor: '#3B2A1E',
    accentMaterial: 'wood'
  },
  'Traditional Indian': {
    wallColor: '#F4F1EA',
    roofColor: '#C86A4B',
    frameColor: '#3B2A1E',
    accentMaterial: 'stone'
  },
  'Modern Luxury': {
    wallColor: '#FAFAFA',
    roofColor: '#282623',
    frameColor: '#121417',
    accentMaterial: 'wood'
  }
};

/**
 * Computes Three.js procedural material definitions based on user appearance overrides and active style.
 */
export function getHouseMaterials(
  appearance?: HouseAppearance,
  styleName?: string
): HouseMaterialSystem {
  const styleDefaults = DEFAULT_APPEARANCE_BY_STYLE[styleName || 'Modern'] || DEFAULT_APPEARANCE_BY_STYLE['Modern'];

  const wallColor = appearance?.wallColor || styleDefaults.wallColor;
  const roofColor = appearance?.roofColor || styleDefaults.roofColor;
  const frameColor = appearance?.frameColor || styleDefaults.frameColor;
  const accentType = appearance?.accentMaterial || styleDefaults.accentMaterial;

  let accentColor = '#8C5A3C'; // Wood default
  if (accentType === 'stone') accentColor = '#605B54';
  else if (accentType === 'concrete') accentColor = '#8A8680';

  return {
    wall: { color: wallColor, roughness: 0.55, metalness: 0.02 },
    roof: { color: roofColor, roughness: 0.65, metalness: 0.08 },
    frame: { color: frameColor, roughness: 0.3, metalness: 0.4 },
    glass: { color: '#2B5B84', roughness: 0.1, metalness: 0.8, transmission: 0.85, opacity: 0.8, transparent: true },
    plinth: { color: '#D5D0C7', roughness: 0.8, metalness: 0.05 },
    woodAccent: { color: '#8C5A3C', roughness: 0.7, metalness: 0.05 },
    stoneAccent: { color: accentColor, roughness: 0.85, metalness: 0.05 },
    lawn: { color: '#4A6B5D', roughness: 0.95, metalness: 0.0 },
    driveway: { color: '#A8A297', roughness: 0.85, metalness: 0.05 }
  };
}
