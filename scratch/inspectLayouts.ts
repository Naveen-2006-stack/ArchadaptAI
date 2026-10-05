/**
 * Prints the layouts the local rule engine + layout engine produce for a set of briefs.
 * Run: npx tsx scratch/inspectLayouts.ts
 */
import { buildConstraints } from '../src/lib/design/program';
import { layoutProgram } from '../src/lib/design/layoutEngine';
import { validateFloorPlan } from '../src/lib/design/validateFloorPlan';
import { buildLocalProgram } from '../src/lib/genai/localPlanner';
import type { DesignPreferences, DesignRequirements, LocationInfo, SiteInfo, SpecialMode } from '../src/types/architectural';

const location: LocationInfo = { name: 'Kochi', city: 'Kochi', country: 'India', lat: 9.93, lng: 76.26 };

function brief(bedrooms: number, floors: number, bathrooms: number, opts: { plot?: [number, number]; modes?: SpecialMode[]; orientation?: SiteInfo['orientation']; spaces?: Partial<DesignRequirements['spaces']>; style?: DesignPreferences['primaryStyle'] } = {}) {
  const [plotWidth, plotDepth] = opts.plot || [40, 60];
  const site: SiteInfo = { plotWidth, plotDepth, totalArea: plotWidth * plotDepth, orientation: opts.orientation || 'E' };
  const requirements: DesignRequirements = {
    familySize: 4, bedrooms, bathrooms, floors, budgetRange: 'Moderate',
    spaces: { living: true, dining: true, kitchen: true, parkingCars: 1, balcony: false, studyWorkspace: false, storage: false, prayerRoom: false, courtyard: false, guestRoom: false, outdoorGarden: false, ...opts.spaces }
  };
  const preferences: DesignPreferences = { modes: opts.modes || [], primaryStyle: opts.style || 'Modern' };
  return { site, requirements, preferences };
}

const cases: [string, ReturnType<typeof brief>][] = [
  ['3BHK G+1', brief(3, 2, 2)],
  ['2BHK G', brief(2, 1, 2)],
  ['4BHK G+1', brief(4, 2, 3)],
  ['3BHK G+2', brief(3, 3, 3)],
  ['3BHK G+1 full', brief(3, 2, 2, { spaces: { balcony: true, studyWorkspace: true, storage: true, courtyard: true, outdoorGarden: true }, modes: ['climate_adaptive', 'life_stage', 'budget_first'], style: 'Kerala Traditional' })],
  ['3BHK G+1 west climate', brief(3, 2, 2, { orientation: 'W', modes: ['climate_adaptive'] })],
  ['5BHK G 30x40 (should fail)', brief(5, 1, 4, { plot: [30, 40] })],
  ['2BHK G 60x90', brief(2, 1, 2, { plot: [60, 90] })]
];

for (const [label, { site, requirements, preferences }] of cases) {
  const constraints = buildConstraints(requirements, preferences);
  const program = buildLocalProgram(site, location, constraints);
  const result = layoutProgram(program, site, constraints);
  console.log(`\n=== ${label} ===`);
  if (!result.ok) {
    console.log('INFEASIBLE:', result.reason);
    continue;
  }
  const { design } = result;
  for (const room of design.rooms) {
    const p = room.position;
    const ft = (pct: number, total: number) => ((pct / 100) * total).toFixed(1).padStart(5);
    console.log(`  F${p.floorLevel} ${room.name.padEnd(28)} ${(room.roomType || '').padEnd(14)} x${ft(p.x, site.plotWidth)} y${ft(p.y, site.plotDepth)} ${room.dimensions.padEnd(14)} ${String(room.areaSqFt).padStart(4)} sqft  -> ${room.connections.join(', ')}`);
  }
  const report = validateFloorPlan(design);
  console.log(`  footprint ${design.footprint?.boundingWidth} x ${design.footprint?.boundingDepth} (${design.footprint?.shapeType}), openings ${design.openings.length}, walls ${design.walls.length}`);
  console.log('  notes:', result.notes);
  console.log('  VALID:', report.isValid, report.errors, '\n  warnings:', report.warnings);
}
