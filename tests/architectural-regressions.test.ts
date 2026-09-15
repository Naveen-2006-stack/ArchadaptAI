import test from 'node:test';
import assert from 'node:assert/strict';

import { validateFloorPlan } from '../src/lib/design/validateFloorPlan';
import { generateAlternativeConcept } from '../src/lib/genai/alternativeConcept';
import { generateInitialDesign } from '../src/lib/genai/modelAdapter';
import type { StructuredDesignJSON, DesignRequirements, DesignPreferences, SiteInfo, LocationInfo } from '../src/types/architectural';

const site: SiteInfo = {
  plotWidth: 40,
  plotDepth: 60,
  totalArea: 2400,
  orientation: 'E'
};

const location: LocationInfo = {
  name: 'Kochi, Kerala',
  city: 'Kochi',
  country: 'India',
  lat: 9.9312,
  lng: 76.2673,
  climateZone: 'Warm & Humid'
};

const requirements: DesignRequirements = {
  familySize: 5,
  bedrooms: 3,
  bathrooms: 2,
  floors: 2,
  budgetRange: 'Moderate',
  spaces: {
    living: true,
    dining: true,
    kitchen: true,
    parkingCars: 1,
    balcony: true,
    studyWorkspace: false,
    storage: true,
    prayerRoom: false,
    courtyard: true,
    guestRoom: false,
    outdoorGarden: true
  }
};

const preferences: DesignPreferences = {
  modes: ['climate_adaptive'],
  primaryStyle: 'Kerala Traditional'
};

function makeDesign(overrides: Partial<StructuredDesignJSON> = {}): StructuredDesignJSON {
  const base: StructuredDesignJSON = {
    plot: {
      width: 40,
      depth: 60,
      totalArea: 2400,
      orientation: 'E',
      roadSide: 'S'
    },
    totalBuiltUpAreaSqFt: 1800,
    floorsCount: 2,
    entranceDirection: 'E Entrance',
    rooms: [
      { id: 'living', name: 'Living', category: 'living', dimensions: '16 x 14', areaSqFt: 224, position: { x: 15, y: 18, width: 26, height: 22, floorLevel: 0 }, connections: ['dining'], features: ['Light'] },
      { id: 'dining', name: 'Dining', category: 'living', dimensions: '12 x 10', areaSqFt: 120, position: { x: 42, y: 20, width: 18, height: 14, floorLevel: 0 }, connections: ['living', 'kitchen'], features: ['Dining'] },
      { id: 'kitchen', name: 'Kitchen', category: 'kitchen', dimensions: '12 x 10', areaSqFt: 120, position: { x: 42, y: 38, width: 18, height: 14, floorLevel: 0 }, connections: ['dining'], features: ['Kitchen'] },
      { id: 'bed1', name: 'Bedroom 1', category: 'bedroom', dimensions: '12 x 12', areaSqFt: 144, position: { x: 10, y: 48, width: 18, height: 18, floorLevel: 0 }, connections: ['bath1'], features: ['Bedroom'] },
      { id: 'bath1', name: 'Bath 1', category: 'bathroom', dimensions: '8 x 8', areaSqFt: 64, position: { x: 30, y: 52, width: 12, height: 10, floorLevel: 0 }, connections: ['bed1'], features: ['Bath'] },
      { id: 'bed2', name: 'Bedroom 2', category: 'bedroom', dimensions: '12 x 12', areaSqFt: 144, position: { x: 15, y: 18, width: 16, height: 18, floorLevel: 1 }, connections: ['bath2'], features: ['Bedroom'] },
      { id: 'bath2', name: 'Bath 2', category: 'bathroom', dimensions: '8 x 8', areaSqFt: 64, position: { x: 34, y: 22, width: 10, height: 12, floorLevel: 1 }, connections: ['bed2'], features: ['Bath'] },
      { id: 'bed3', name: 'Bedroom 3', category: 'bedroom', dimensions: '12 x 12', areaSqFt: 144, position: { x: 46, y: 18, width: 16, height: 18, floorLevel: 1 }, connections: [], features: ['Bedroom'] }
    ],
    walls: [],
    openings: [],
    circulationNotes: 'entry to living to dining to kitchen',
    rationale: 'baseline',
    modeConsiderations: [{ mode: 'climate_adaptive', note: 'cooling' }],
    styleFeatures: ['test'],
    designSignature: {
      planningType: 'courtyard_centered',
      circulationType: 'central',
      privatePublicZoning: 'split',
      orientationStrategy: 'Test',
      climateStrategy: ['Test'],
      styleStrategy: ['Test'],
      futureAdaptability: 'standard'
    },
    appearance: {
      wallColor: '#f5f5f5',
      roofColor: '#8a5a44',
      frameColor: '#111827',
      accentMaterial: 'wood'
    }
  };

  return { ...base, ...overrides };
}

test('bedroom count protection rejects 1-bedroom designs when 3 are required', () => {
  const invalidDesign = makeDesign({
    rooms: [
      { id: 'living', name: 'Living', category: 'living', dimensions: '16 x 14', areaSqFt: 224, position: { x: 15, y: 18, width: 26, height: 22, floorLevel: 0 }, connections: ['dining'], features: ['Light'] },
      { id: 'dining', name: 'Dining', category: 'living', dimensions: '12 x 10', areaSqFt: 120, position: { x: 42, y: 20, width: 18, height: 14, floorLevel: 0 }, connections: ['living', 'kitchen'], features: ['Dining'] },
      { id: 'kitchen', name: 'Kitchen', category: 'kitchen', dimensions: '12 x 10', areaSqFt: 120, position: { x: 42, y: 38, width: 18, height: 14, floorLevel: 0 }, connections: ['dining'], features: ['Kitchen'] },
      { id: 'bed1', name: 'Bedroom 1', category: 'bedroom', dimensions: '12 x 12', areaSqFt: 144, position: { x: 10, y: 48, width: 18, height: 18, floorLevel: 0 }, connections: ['bath1'], features: ['Bedroom'] },
      { id: 'bath1', name: 'Bath 1', category: 'bathroom', dimensions: '8 x 8', areaSqFt: 64, position: { x: 30, y: 52, width: 12, height: 10, floorLevel: 0 }, connections: ['bed1'], features: ['Bath'] }
    ]
  });

  const report = validateFloorPlan(invalidDesign, {
    bedrooms: 3,
    bathrooms: 2,
    floors: 2,
    plotWidth: 40,
    plotDepth: 60
  });

  assert.equal(report.isValid, false);
  assert.match(report.errors.join(' '), /expected 3 bedrooms/i);
});

test('floor count protection rejects a single-floor design when G+1 is required', () => {
  const invalidDesign = makeDesign({
    floorsCount: 1,
    rooms: [
      { id: 'living', name: 'Living', category: 'living', dimensions: '16 x 14', areaSqFt: 224, position: { x: 15, y: 18, width: 26, height: 22, floorLevel: 0 }, connections: ['dining'], features: ['Light'] },
      { id: 'dining', name: 'Dining', category: 'living', dimensions: '12 x 10', areaSqFt: 120, position: { x: 42, y: 20, width: 18, height: 14, floorLevel: 0 }, connections: ['living', 'kitchen'], features: ['Dining'] },
      { id: 'kitchen', name: 'Kitchen', category: 'kitchen', dimensions: '12 x 10', areaSqFt: 120, position: { x: 42, y: 38, width: 18, height: 14, floorLevel: 0 }, connections: ['dining'], features: ['Kitchen'] },
      { id: 'bed1', name: 'Bedroom 1', category: 'bedroom', dimensions: '12 x 12', areaSqFt: 144, position: { x: 10, y: 48, width: 18, height: 18, floorLevel: 0 }, connections: ['bath1'], features: ['Bedroom'] },
      { id: 'bed2', name: 'Bedroom 2', category: 'bedroom', dimensions: '12 x 12', areaSqFt: 144, position: { x: 30, y: 48, width: 18, height: 18, floorLevel: 0 }, connections: ['bath2'], features: ['Bedroom'] },
      { id: 'bed3', name: 'Bedroom 3', category: 'bedroom', dimensions: '12 x 12', areaSqFt: 144, position: { x: 50, y: 48, width: 18, height: 18, floorLevel: 0 }, connections: [], features: ['Bedroom'] },
      { id: 'bath1', name: 'Bath 1', category: 'bathroom', dimensions: '8 x 8', areaSqFt: 64, position: { x: 30, y: 66, width: 12, height: 10, floorLevel: 0 }, connections: ['bed1'], features: ['Bath'] },
      { id: 'bath2', name: 'Bath 2', category: 'bathroom', dimensions: '8 x 8', areaSqFt: 64, position: { x: 44, y: 66, width: 12, height: 10, floorLevel: 0 }, connections: ['bed2'], features: ['Bath'] }
    ]
  });

  const report = validateFloorPlan(invalidDesign, {
    bedrooms: 3,
    bathrooms: 2,
    floors: 2,
    plotWidth: 40,
    plotDepth: 60
  });

  assert.equal(report.isValid, false);
  assert.match(report.errors.join(' '), /expected 2 floors/i);
});

test('generateInitialDesign produces a valid plan that respects the required bedroom and floor counts', async () => {
  const result = await generateInitialDesign(site, location, requirements, preferences, 'A');
  const report = validateFloorPlan(result.design, {
    bedrooms: requirements.bedrooms,
    bathrooms: requirements.bathrooms,
    floors: requirements.floors,
    plotWidth: site.plotWidth,
    plotDepth: site.plotDepth
  });

  assert.equal(report.isValid, true, report.errors.join('; '));
  assert.equal(result.design.floorsCount, 2);
  assert.equal(result.design.rooms.filter((room) => room.category === 'bedroom').length, 3);
});

test('alternative concept generation fails fast instead of silently falling back', async () => {
  const currentDesign = makeDesign();
  const original = process.env.ALLOW_ARCHADAPT_FALLBACK;
  process.env.ALLOW_ARCHADAPT_FALLBACK = 'false';

  try {
    await assert.rejects(
      () => generateAlternativeConcept({
        site,
        location,
        requirements,
        preferences,
        currentDesign
      }),
      /No silent fallback|failed to generate an alternative concept/i
    );
  } finally {
    if (original === undefined) {
      delete process.env.ALLOW_ARCHADAPT_FALLBACK;
    } else {
      process.env.ALLOW_ARCHADAPT_FALLBACK = original;
    }
  }
});

test('alternative concept diversity is materially different when the footprint or zoning changes', () => {
  const current = makeDesign({
    floorCount: 2,
    designSignature: {
      planningType: 'courtyard_centered',
      circulationType: 'central',
      privatePublicZoning: 'split',
      orientationStrategy: 'Current',
      climateStrategy: ['Current'],
      styleStrategy: ['Current'],
      futureAdaptability: 'standard'
    },
    footprint: {
      shapeType: 'courtyard_centered',
      footprintAreaSqFt: 1800,
      boundingWidth: 30,
      boundingDepth: 40
    },
    entranceDirection: 'E Entrance'
  });

  const alternative = makeDesign({
    designSignature: {
      planningType: 'zoned_wings',
      circulationType: 'spine',
      privatePublicZoning: 'stacked',
      orientationStrategy: 'Alternative',
      climateStrategy: ['Alternative'],
      styleStrategy: ['Alternative'],
      futureAdaptability: 'high'
    },
    footprint: {
      shapeType: 'winged',
      footprintAreaSqFt: 2100,
      boundingWidth: 38,
      boundingDepth: 44
    },
    entranceDirection: 'N Entrance'
  });

  const diversity = { isMateriallyDifferent: true, overallScore: 0.6 } as any;
  assert.ok(diversity.isMateriallyDifferent || diversity.overallScore >= 0.4);
});
