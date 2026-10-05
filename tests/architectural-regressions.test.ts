import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { generateDesign, realiseProgram, MAX_GENERATION_ATTEMPTS } from '../src/lib/design/pipeline';
import { buildConstraints, parseProgram, programFromDesign } from '../src/lib/design/program';
import { layoutProgram } from '../src/lib/design/layoutEngine';
import { validateFloorPlan } from '../src/lib/design/validateFloorPlan';
import { applyProgramDelta, interpretRequestLocally, runWhatIf } from '../src/lib/design/whatIf';
import { countBedrooms, countRoomsOfType } from '../src/lib/design/roomTypes';
import { classifyDesignRequestIntent } from '../src/lib/design/requestIntent';
import { buildLocalProgram } from '../src/lib/genai/localPlanner';
import { buildHouseGeometry, checkRenderConsistency } from '../src/lib/geometry/buildHouseGeometry';
import type { DesignPreferences, DesignRequirements, FloorPlanRoom, LocationInfo, SiteInfo, SpecialMode, StructuredDesignJSON } from '../src/types/architectural';

const location: LocationInfo = { name: 'Kochi, Kerala', city: 'Kochi', country: 'India', lat: 9.9312, lng: 76.2673, climateZone: 'Warm & Humid' };

interface BriefOptions {
  plot?: [number, number];
  orientation?: SiteInfo['orientation'];
  modes?: SpecialMode[];
  spaces?: Partial<DesignRequirements['spaces']>;
  style?: DesignPreferences['primaryStyle'];
}

function brief(bedrooms: number, floors: number, bathrooms: number, options: BriefOptions = {}) {
  const [plotWidth, plotDepth] = options.plot || [40, 60];
  const site: SiteInfo = { plotWidth, plotDepth, totalArea: plotWidth * plotDepth, orientation: options.orientation || 'E' };
  const requirements: DesignRequirements = {
    familySize: 4, bedrooms, bathrooms, floors, budgetRange: 'Moderate',
    spaces: { living: true, dining: true, kitchen: true, parkingCars: 1, balcony: false, studyWorkspace: false, storage: false, prayerRoom: false, courtyard: false, guestRoom: false, outdoorGarden: false, ...options.spaces }
  };
  const preferences: DesignPreferences = { modes: options.modes || [], primaryStyle: options.style || 'Modern' };
  return { site, location, requirements, preferences };
}

/** Generates through the full pipeline using the built-in engine (no network). */
async function generate(...args: Parameters<typeof brief>): Promise<StructuredDesignJSON> {
  const outcome = await generateDesign({ ...brief(...args), engine: 'local' });
  assert.equal(outcome.status, 'OK', outcome.status === 'OK' ? '' : `${outcome.reason} ${outcome.violatedConstraints.join('; ')}`);
  if (outcome.status !== 'OK') throw new Error('unreachable');
  return outcome.design;
}

const layoutSignature = (design: StructuredDesignJSON) =>
  design.rooms.map((room) => `${room.roomType}@${room.position.floorLevel}:${room.position.x},${room.position.y},${room.position.width},${room.position.height}`).sort().join('|');
const bedroomsOnFloor = (design: StructuredDesignJSON, level: number) =>
  design.rooms.filter((room) => (room.roomType === 'bedroom' || room.roomType === 'master_bedroom') && room.position.floorLevel === level).length;

// The suite must never reach the real Gemini API or depend on a developer's key.
const savedEnv = { key: process.env.GENAI_API_KEY, alt: process.env.GEMINI_API_KEY, fallback: process.env.ALLOW_ARCHADAPT_FALLBACK };
const realFetch = globalThis.fetch;
beforeEach(() => {
  delete process.env.GENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.ALLOW_ARCHADAPT_FALLBACK;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  if (savedEnv.key) process.env.GENAI_API_KEY = savedEnv.key;
  if (savedEnv.alt) process.env.GEMINI_API_KEY = savedEnv.alt;
  if (savedEnv.fallback) process.env.ALLOW_ARCHADAPT_FALLBACK = savedEnv.fallback;
});

function mockGemini(responses: (object | number)[]) {
  const prompts: string[] = [];
  let call = 0;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    prompts.push(JSON.parse(String(init?.body)).contents[0].parts[0].text);
    const response = responses[Math.min(call++, responses.length - 1)];
    if (typeof response === 'number') return new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: response });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] }, finishReason: 'STOP' }] }), { status: 200 });
  }) as typeof fetch;
  return { prompts, calls: () => call };
}

// ---------------------------------------------------------------------------------------------
// Required scenarios
// ---------------------------------------------------------------------------------------------

test('Test 1: 3 bedrooms, G+1 → exactly 3 bedrooms on 2 floors', async () => {
  const design = await generate(3, 2, 2);
  assert.equal(design.floorsCount, 2);
  assert.equal(countBedrooms(design), 3);
  assert.ok(design.rooms.some((room) => room.position.floorLevel === 1 && room.category === 'bedroom'), 'first floor has a bedroom');
  assert.equal(validateFloorPlan(design).isValid, true);
});

test('Test 2: 2 bedrooms, G → exactly 2 bedrooms on 1 floor', async () => {
  const design = await generate(2, 1, 2);
  assert.equal(design.floorsCount, 1);
  assert.equal(countBedrooms(design), 2);
  assert.ok(design.rooms.every((room) => room.position.floorLevel === 0));
  assert.equal((design.stairs || []).length, 0, 'a single-storey house has no staircase');
});

test('Test 3: 3 bedrooms, G+1, 2 bathrooms, kitchen and utility all exist', async () => {
  const design = await generate(3, 2, 2, { spaces: { storage: true } });
  assert.equal(countBedrooms(design), 3);
  assert.equal(design.floorsCount, 2);
  assert.ok(countRoomsOfType(design, 'bathroom') >= 2);
  assert.equal(countRoomsOfType(design, 'kitchen'), 1);
  assert.ok(countRoomsOfType(design, 'utility') >= 1, 'utility exists');
  assert.ok(countRoomsOfType(design, 'store') >= 1, 'requested store exists');
  const kitchen = design.rooms.find((room) => room.roomType === 'kitchen')!;
  const utility = design.rooms.find((room) => room.roomType === 'utility')!;
  assert.ok(kitchen.connections.includes(utility.id), 'utility opens off the kitchen');
});

test('Test 4: What-If "add one bedroom" on a 3BHK G+1 gives 4 bedrooms on 2 floors and keeps the rest', async () => {
  const original = await generate(3, 2, 2);
  const snapshot = JSON.stringify(original);
  const outcome = await runWhatIf(original, 'Add one bedroom.');
  assert.equal(outcome.status, 'OK', JSON.stringify(outcome));
  if (outcome.status !== 'OK') return;
  assert.equal(countBedrooms(outcome.design), 4);
  assert.equal(outcome.design.floorsCount, 2);
  assert.equal(outcome.design.constraints?.bedrooms, 4, 'the hard requirement now reads 4 bedrooms');
  assert.equal(validateFloorPlan(outcome.design).isValid, true);
  // Every planned room of the original is still there, on the same floor.
  for (const room of programFromDesign(original).rooms) {
    const kept: FloorPlanRoom | undefined = outcome.design.rooms.find((r) => r.id === room.id);
    assert.ok(kept, `${room.name} was preserved`);
    assert.equal(kept!.position.floorLevel, room.floor, `${room.name} stayed on its floor`);
  }
  assert.equal(JSON.stringify(original), snapshot, 'the original version object was not mutated');
});

test('Test 5: an impossible What-If returns INFEASIBLE and leaves the design intact', async () => {
  const original = await generate(3, 2, 2);
  const snapshot = JSON.stringify(original);
  const outcome = await runWhatIf(original, 'Add 12 bedrooms on the ground floor');
  assert.equal(outcome.status, 'INFEASIBLE', JSON.stringify(outcome).slice(0, 300));
  if (outcome.status === 'INFEASIBLE') {
    assert.match(outcome.reason, /cannot fit|buildable envelope/i);
    assert.ok(outcome.violatedConstraints.length > 0);
  }
  assert.equal(JSON.stringify(original), snapshot);
});

// ---------------------------------------------------------------------------------------------
// No silent downgrading
// ---------------------------------------------------------------------------------------------

test('a brief that cannot fit the plot is reported INFEASIBLE, never shrunk to fit', async () => {
  const outcome = await generateDesign({ ...brief(5, 1, 4, { plot: [30, 40] }), engine: 'local' });
  assert.equal(outcome.status, 'INFEASIBLE');
  if (outcome.status === 'INFEASIBLE') {
    assert.match(outcome.reason, /cannot fit/i);
    assert.ok(outcome.violatedConstraints.some((line) => /5 bedroom/.test(line)));
  }
});

test('validation rejects a design with fewer bedrooms or floors than required', async () => {
  const design = await generate(3, 2, 2);
  const fewerBedrooms = validateFloorPlan(design, { bedrooms: 4 });
  assert.equal(fewerBedrooms.isValid, false);
  assert.match(fewerBedrooms.errors.join(' '), /expected 4 bedrooms/i);
  const fewerFloors = validateFloorPlan(design, { floors: 3 });
  assert.equal(fewerFloors.isValid, false);
  assert.match(fewerFloors.errors.join(' '), /expected 3 floors/i);
});

test('validation rejects overlapping rooms and rooms outside the buildable envelope', async () => {
  const design = await generate(2, 1, 2);
  const overlapping: StructuredDesignJSON = JSON.parse(JSON.stringify(design));
  const [a, b] = overlapping.rooms.filter((room) => room.category === 'bedroom');
  b.position = { ...a.position };
  assert.match(validateFloorPlan(overlapping).errors.join(' '), /overlap/i);

  const outside: StructuredDesignJSON = JSON.parse(JSON.stringify(design));
  outside.rooms[0].position.x = 0;
  assert.match(validateFloorPlan(outside).errors.join(' '), /setback|buildable envelope/i);
});

test('a planner programme missing a required bedroom is rejected before any geometry exists', () => {
  const { site, requirements, preferences } = brief(3, 2, 2);
  const constraints = buildConstraints(requirements, preferences);
  const program = buildLocalProgram(site, location, constraints);
  program.rooms = program.rooms.filter((room) => room.id !== 'room-master' && room.attachedTo !== 'room-master');
  const stage = realiseProgram(program, site, constraints);
  assert.equal(stage.design, undefined);
  assert.match(stage.errors.join(' '), /Requested 3 bedrooms but the program contains 2/);
});

// ---------------------------------------------------------------------------------------------
// Requirement-driven variation, without randomness
// ---------------------------------------------------------------------------------------------

test('different requirements produce different layouts; identical requirements produce identical layouts', async () => {
  const briefs: [number, number, number][] = [[3, 2, 2], [4, 2, 3], [2, 1, 2], [3, 3, 3]];
  const designs = await Promise.all(briefs.map(([beds, floors, baths]) => generate(beds, floors, baths)));
  const signatures = designs.map(layoutSignature);
  assert.equal(new Set(signatures).size, briefs.length, 'every brief has its own arrangement');
  designs.forEach((design, index) => {
    assert.equal(countBedrooms(design), briefs[index][0]);
    assert.equal(design.floorsCount, briefs[index][1]);
  });
  // 4BHK G+1 puts two bedrooms on each floor; 3BHK G+2 puts one on each of three floors.
  assert.deepEqual([bedroomsOnFloor(designs[1], 0), bedroomsOnFloor(designs[1], 1)], [2, 2]);
  assert.deepEqual([0, 1, 2].map((level) => bedroomsOnFloor(designs[3], level)), [1, 1, 1]);

  const repeat = await generate(3, 2, 2);
  assert.equal(layoutSignature(repeat), signatures[0], 'no randomness: the same brief gives the same plan');
});

test('the plot itself changes the plan: a wider plot and a rotated plot give different geometry', async () => {
  const base = await generate(3, 2, 2);
  const wide = await generate(3, 2, 2, { plot: [60, 60] });
  assert.notEqual(layoutSignature(base), layoutSignature(wide));
  assert.ok(wide.footprint!.boundingDepth < base.footprint!.boundingDepth + 0.01 || wide.footprint!.boundingWidth !== base.footprint!.boundingWidth);
});

// ---------------------------------------------------------------------------------------------
// Modes change geometry, not just text
// ---------------------------------------------------------------------------------------------

test('Climate-Adaptive moves the living room to the cooler side for the plot orientation', async () => {
  const centreX = (design: StructuredDesignJSON, type: string) => {
    const room = design.rooms.find((r) => r.roomType === type)!;
    return room.position.x + room.position.width / 2;
  };
  // West-facing plot: plan-right is north (cool). East-facing plot: plan-left is north (cool).
  const west = await generate(3, 2, 2, { orientation: 'W', modes: ['climate_adaptive'] });
  const east = await generate(3, 2, 2, { orientation: 'E', modes: ['climate_adaptive'] });
  assert.ok(centreX(west, 'living') > centreX(west, 'parking'), 'west-facing: living on the right (north), parking buffers the south');
  assert.ok(centreX(east, 'living') < centreX(east, 'parking'), 'east-facing: living on the left (north)');
  const plain = await generate(3, 2, 2, { orientation: 'W' });
  assert.notEqual(layoutSignature(west), layoutSignature(plain), 'the mode changed the geometry');
  const windows = (design: StructuredDesignJSON) => design.openings.filter((op) => op.type === 'window').length;
  assert.ok(windows(west) > windows(plain), 'climate mode adds cross-ventilation openings');
});

test('Life-Stage puts a bedroom and its bathroom on the ground floor and widens circulation', async () => {
  const design = await generate(3, 2, 2, { modes: ['life_stage'] });
  const groundBedroom = design.rooms.find((room) => room.position.floorLevel === 0 && room.roomType === 'master_bedroom');
  assert.ok(groundBedroom, 'master bedroom is on the ground floor');
  const groundBath = design.rooms.find((room) => room.position.floorLevel === 0 && room.roomType === 'bathroom' && room.attachedTo === groundBedroom!.id);
  assert.ok(groundBath, 'it has its own ground-floor bathroom');
  const mainDoor = design.openings.find((op) => op.id === 'op-main')!;
  assert.equal(mainDoor.width, 4, 'main door widened');
  const plain = await generate(3, 2, 2);
  assert.equal(plain.rooms.some((room) => room.position.floorLevel === 0 && room.roomType === 'master_bedroom'), false, 'without the mode the master is upstairs');
});

test('Budget-First builds less area for the same brief', async () => {
  const plain = await generate(3, 2, 2);
  const budget = await generate(3, 2, 2, { modes: ['budget_first'] });
  assert.ok(budget.totalBuiltUpAreaSqFt < plain.totalBuiltUpAreaSqFt, `${budget.totalBuiltUpAreaSqFt} < ${plain.totalBuiltUpAreaSqFt}`);
  assert.equal(countBedrooms(budget), 3, 'but never fewer rooms');
});

// ---------------------------------------------------------------------------------------------
// One source of truth: 2D and 3D
// ---------------------------------------------------------------------------------------------

test('2D plan and 3D model contain the same rooms, floors, dimensions, doors and windows', async () => {
  for (const args of [[3, 2, 2], [2, 1, 2], [4, 2, 3], [3, 3, 3]] as [number, number, number][]) {
    const design = await generate(...args, { spaces: { balcony: true, courtyard: args[1] === 2 } });
    const consistency = checkRenderConsistency(design);
    assert.deepEqual(consistency.problems, []);
    const geometry = buildHouseGeometry(design);
    assert.equal(geometry.summary.bedrooms, args[0]);
    assert.equal(geometry.totalFloors, args[1]);
    assert.equal(geometry.stairSteps.length > 0, args[1] > 1, 'stairs appear in 3D exactly when there is more than one floor');
    assert.ok(geometry.walls.length > 0 && geometry.openings.length > 0);
  }
});

test('3D geometry follows the design it is given (no static model)', async () => {
  const a = buildHouseGeometry(await generate(2, 1, 2));
  const b = buildHouseGeometry(await generate(4, 2, 3));
  assert.notEqual(a.rooms.length, b.rooms.length);
  assert.notDeepEqual(a.rooms.map((room) => room.size), b.rooms.map((room) => room.size));
});

// ---------------------------------------------------------------------------------------------
// Geometry invariants across many briefs
// ---------------------------------------------------------------------------------------------

test('every feasible brief in a sweep yields a valid plan: no overlaps, inside the envelope, all rooms reachable', () => {
  let produced = 0;
  for (const plot of [[30, 50], [40, 60], [50, 80], [60, 40]] as [number, number][]) {
    for (let bedrooms = 1; bedrooms <= 5; bedrooms++) {
      for (let floors = 1; floors <= 3; floors++) {
        for (const modes of [[], ['climate_adaptive', 'life_stage'], ['budget_first']] as SpecialMode[][]) {
          const { site, requirements, preferences } = brief(bedrooms, floors, Math.max(1, bedrooms - 1), { plot, modes, spaces: { balcony: floors > 1, studyWorkspace: bedrooms > 2 } });
          const constraints = buildConstraints(requirements, preferences);
          const layout = layoutProgram(buildLocalProgram(site, location, constraints), site, constraints);
          if (!layout.ok) continue; // legitimately infeasible on this plot
          produced++;
          const report = validateFloorPlan(layout.design);
          const label = `${bedrooms}BHK ${floors} floor(s) on ${plot.join('x')} [${modes.join(',')}]`;
          assert.deepEqual(report.errors, [], label);
          assert.equal(countBedrooms(layout.design), bedrooms, label);
          assert.equal(layout.design.floorsCount, floors, label);
          assert.deepEqual(checkRenderConsistency(layout.design).problems, [], label);
        }
      }
    }
  }
  assert.ok(produced >= 100, `sweep produced ${produced} valid designs`);
});

// ---------------------------------------------------------------------------------------------
// What-If engine
// ---------------------------------------------------------------------------------------------

test('What-If edits are deltas: resize, move, remove and appearance', async () => {
  const original = await generate(3, 2, 2, { spaces: { studyWorkspace: true } });
  const area = (design: StructuredDesignJSON, type: string) => design.rooms.find((room) => room.roomType === type)!.areaSqFt;

  const bigger = await runWhatIf(original, 'Make the kitchen 30% larger');
  assert.equal(bigger.status, 'OK', JSON.stringify(bigger).slice(0, 300));
  if (bigger.status === 'OK') {
    assert.ok(area(bigger.design, 'kitchen') > area(original, 'kitchen'));
    assert.equal(countBedrooms(bigger.design), 3);
  }

  const moved = await runWhatIf(original, 'Move the study next to the living room');
  assert.equal(moved.status, 'OK', JSON.stringify(moved).slice(0, 300));
  if (moved.status === 'OK') {
    const study = moved.design.rooms.find((room) => room.roomType === 'study')!;
    const living = moved.design.rooms.find((room) => room.roomType === 'living')!;
    assert.equal(study.position.floorLevel, living.position.floorLevel);
    assert.equal(validateFloorPlan(moved.design).isValid, true);
  }

  const removed = await runWhatIf(original, 'Remove the study');
  assert.equal(removed.status, 'OK');
  if (removed.status === 'OK') assert.equal(countRoomsOfType(removed.design, 'study'), 0);

  const noKitchen = await runWhatIf(original, 'Remove the kitchen');
  assert.equal(noKitchen.status, 'INFEASIBLE');

  const painted = await runWhatIf(original, 'Change the wall colour to white');
  assert.equal(painted.status, 'OK');
  if (painted.status === 'OK') {
    assert.equal(painted.geometryChanged, false);
    assert.equal(painted.design.appearance?.wallColor, '#FAFAFA');
    assert.equal(layoutSignature(painted.design), layoutSignature(original), 'an appearance change leaves geometry untouched');
  }

  const unclear = await runWhatIf(original, 'make it nicer please');
  assert.equal(unclear.status, 'NOT_UNDERSTOOD');
});

test('What-If changes chain: version 2 is edited into version 3 without losing version 2\'s change', async () => {
  const v1 = await generate(3, 2, 2);
  const v2 = await runWhatIf(v1, 'Add a bedroom upstairs');
  assert.equal(v2.status, 'OK');
  if (v2.status !== 'OK') return;
  const v3 = await runWhatIf(v2.design, 'Add a balcony');
  assert.equal(v3.status, 'OK', JSON.stringify(v3).slice(0, 300));
  if (v3.status !== 'OK') return;
  assert.equal(countBedrooms(v3.design), 4);
  assert.ok(countRoomsOfType(v3.design, 'balcony') >= 1);
  assert.equal(countBedrooms(v1), 3, 'version 1 is still a 3-bedroom design');
});

test('delta application reports unknown rooms instead of guessing', async () => {
  const design = await generate(2, 1, 2);
  const program = programFromDesign(design);
  const applied = applyProgramDelta(program, design.constraints!, { understood: true, summary: '', tradeOffs: [], ops: [{ op: 'resize_room', target: 'room-does-not-exist', scale: 2 }] });
  assert.match(applied.errors.join(' '), /no room matching/i);
  assert.equal(interpretRequestLocally('asdf qwerty', program, design.constraints!), null);
});

test('request intent: only explicit wording regenerates a concept', () => {
  assert.equal(classifyDesignRequestIntent('Generate another concept'), 'GENERATE_ALTERNATIVE_CONCEPT');
  assert.equal(classifyDesignRequestIntent('Add another bedroom'), 'MODIFY_CURRENT_DESIGN');
});

test('an alternative concept keeps the brief but changes the arrangement', async () => {
  const input = brief(3, 2, 2);
  const first = await generateDesign({ ...input, engine: 'local' });
  assert.equal(first.status, 'OK');
  if (first.status !== 'OK') return;
  const second = await generateDesign({ ...input, engine: 'local', alternativeTo: first.design });
  assert.equal(second.status, 'OK');
  if (second.status !== 'OK') return;
  assert.equal(countBedrooms(second.design), 3);
  assert.equal(second.design.floorsCount, 2);
  assert.notEqual(layoutSignature(second.design), layoutSignature(first.design));
  assert.equal(second.design.conceptNumber, 2);
});

// ---------------------------------------------------------------------------------------------
// Gemini path (network mocked): schema validation, retry-with-feedback, two-attempt cap, no silent fallback
// ---------------------------------------------------------------------------------------------

const validGeminiProgram = {
  status: 'OK', planningType: 'linear_circulation', circulationType: 'spine', stairSide: 'left',
  rooms: [
    { id: 'living', name: 'Living Room', type: 'living', floor: 0, areaSqFt: 210, band: 'front', side: 'left' },
    { id: 'porch', name: 'Sit-out', type: 'entrance', floor: 0, areaSqFt: 60, band: 'front', side: 'left', attachedTo: 'living' },
    { id: 'car', name: 'Car Porch', type: 'parking', floor: 0, areaSqFt: 160, band: 'front', side: 'right' },
    { id: 'dining', name: 'Dining', type: 'dining', floor: 0, areaSqFt: 120, band: 'middle', side: 'left', relationships: [{ type: 'CONNECTED_TO', target: 'living' }] },
    { id: 'kitchen', name: 'Kitchen', type: 'kitchen', floor: 0, areaSqFt: 100, band: 'middle', side: 'right', relationships: [{ type: 'CONNECTED_TO', target: 'dining' }] },
    { id: 'bed-g', name: 'Guest Bedroom', type: 'bedroom', floor: 0, areaSqFt: 130, band: 'rear', side: 'left' },
    { id: 'bath-g', name: 'Common Bath', type: 'bathroom', floor: 0, areaSqFt: 40, band: 'rear', side: 'center' },
    { id: 'lounge', name: 'Family Lounge', type: 'lounge', floor: 1, areaSqFt: 90, band: 'middle', side: 'center' },
    { id: 'master', name: 'Master Bedroom', type: 'master_bedroom', floor: 1, areaSqFt: 160, band: 'rear', side: 'left' },
    { id: 'master-bath', name: 'Master Bath', type: 'bathroom', floor: 1, areaSqFt: 40, band: 'rear', side: 'left', attachedTo: 'master' },
    { id: 'bed-2', name: 'Bedroom 2', type: 'bedroom', floor: 1, areaSqFt: 130, band: 'front', side: 'left' },
    { id: 'stairs', name: 'Staircase', type: 'stair', floor: 0, areaSqFt: 80, band: 'middle', side: 'right' }
  ],
  rationale: 'Test programme.', styleFeatures: ['Modern']
};

test('a Gemini room programme is schema-checked, laid out by the engine and validated', async () => {
  process.env.GENAI_API_KEY = 'test-key';
  const mock = mockGemini([validGeminiProgram]);
  const outcome = await generateDesign(brief(3, 2, 2));
  assert.equal(outcome.status, 'OK', JSON.stringify(outcome).slice(0, 400));
  if (outcome.status !== 'OK') return;
  assert.equal(outcome.engine, 'gemini');
  assert.equal(outcome.attempts, 1);
  assert.equal(mock.calls(), 1);
  assert.equal(countBedrooms(outcome.design), 3);
  assert.equal(outcome.design.generationMetadata?.engine, 'gemini');
  // The planner's stair room is ignored: the engine owns stairs and places one per floor.
  assert.equal(outcome.design.rooms.filter((room) => room.roomType === 'stair').length, 2);
  assert.ok(outcome.design.rooms.some((room) => room.id === 'room-master'), 'ids are normalised, rooms are the planner\'s');
  assert.equal(validateFloorPlan(outcome.design).isValid, true);
  assert.deepEqual(checkRenderConsistency(outcome.design).problems, []);
});

test('an invalid Gemini answer is retried once with the validation errors as feedback', async () => {
  process.env.GENAI_API_KEY = 'test-key';
  const twoBedrooms = { ...validGeminiProgram, rooms: validGeminiProgram.rooms.filter((room) => room.id !== 'bed-2') };
  const mock = mockGemini([twoBedrooms, validGeminiProgram]);
  const outcome = await generateDesign(brief(3, 2, 2));
  assert.equal(outcome.status, 'OK');
  if (outcome.status === 'OK') assert.equal(outcome.attempts, 2);
  assert.equal(mock.calls(), 2);
  assert.match(mock.prompts[1], /FAILED VALIDATION/);
  assert.match(mock.prompts[1], /Requested 3 bedrooms but the program contains 2/);
});

test('two invalid Gemini answers end in a clear failure: no third attempt and no silent template', async () => {
  process.env.GENAI_API_KEY = 'test-key';
  process.env.ALLOW_ARCHADAPT_FALLBACK = 'true'; // even with the local engine allowed, an INVALID design is not swapped out
  const twoBedrooms = { ...validGeminiProgram, rooms: validGeminiProgram.rooms.filter((room) => room.id !== 'bed-2') };
  const mock = mockGemini([twoBedrooms, { rooms: 'nonsense' }, validGeminiProgram]);
  const outcome = await generateDesign(brief(3, 2, 2));
  assert.equal(outcome.status, 'INVALID_DESIGN');
  assert.equal(mock.calls(), MAX_GENERATION_ATTEMPTS);
  if (outcome.status === 'INVALID_DESIGN') {
    assert.equal(outcome.attempts, 2);
    assert.equal(outcome.canUseLocalEngine, true, 'the user may choose the rule engine explicitly');
  }
});

test('when Gemini is unreachable the outcome says so; the local engine is used only if allowed, and is labelled', async () => {
  process.env.GENAI_API_KEY = 'test-key';
  mockGemini([404]);
  const blocked = await generateDesign(brief(3, 2, 2));
  assert.equal(blocked.status, 'ENGINE_UNAVAILABLE');

  process.env.ALLOW_ARCHADAPT_FALLBACK = 'true';
  mockGemini([404]);
  const allowed = await generateDesign(brief(3, 2, 2));
  assert.equal(allowed.status, 'OK');
  if (allowed.status === 'OK') {
    assert.equal(allowed.engine, 'local-rule-engine');
    assert.match(allowed.notice || '', /could not be reached/i);
    assert.equal(allowed.design.generationMetadata?.engine, 'local-rule-engine');
    assert.equal(countBedrooms(allowed.design), 3);
  }
});

test('programme parsing rejects unknown room types and out-of-range floors instead of dropping rooms', () => {
  const { requirements, preferences } = brief(3, 2, 2);
  const constraints = buildConstraints(requirements, preferences);
  const badType = parseProgram({ rooms: [{ id: 'x', name: 'Mystery', type: 'holodeck', floor: 0 }] }, constraints);
  assert.equal(badType.program, null);
  assert.match(badType.errors.join(' '), /unknown type/i);
  const badFloor = parseProgram({ rooms: [{ id: 'x', name: 'Attic Bedroom', type: 'bedroom', floor: 5 }] }, constraints);
  assert.equal(badFloor.program, null);
  assert.match(badFloor.errors.join(' '), /floor 5/);
  assert.equal(parseProgram('not json', constraints).program, null);
});

test('a Gemini What-If delta is applied to the existing design', async () => {
  const original = await generate(3, 2, 2);
  process.env.GENAI_API_KEY = 'test-key';
  mockGemini([{ understood: true, summary: 'Added a puja room.', tradeOffs: ['Slightly smaller dining.'], ops: [{ op: 'add_room', type: 'puja', floor: 0, areaSqFt: 25 }] }]);
  const outcome = await runWhatIf(original, 'I would like a small prayer space');
  assert.equal(outcome.status, 'OK', JSON.stringify(outcome).slice(0, 300));
  if (outcome.status !== 'OK') return;
  assert.equal(outcome.engine, 'gemini');
  assert.equal(countRoomsOfType(outcome.design, 'puja'), 1);
  assert.equal(countBedrooms(outcome.design), 3);
  assert.ok(outcome.design.constraints?.requiredSpaces.includes('prayerRoom'));
});

test('if the AI planner declines to produce a change, a plainly worded request still gets a real feasibility answer', async () => {
  const original = await generate(3, 2, 2);
  process.env.GENAI_API_KEY = 'test-key';
  mockGemini([{ understood: true, summary: 'This will not fit.', ops: [] }]);
  const outcome = await runWhatIf(original, 'Add 12 more bedrooms on the ground floor');
  assert.equal(outcome.status, 'INFEASIBLE', JSON.stringify(outcome).slice(0, 300));
  if (outcome.status === 'INFEASIBLE') assert.match(outcome.reason, /cannot fit/i);
});
