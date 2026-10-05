import {
  DesignConstraints,
  DesignProgram,
  HouseAppearance,
  PlanBand,
  PlanSide,
  ProgramRoom,
  RoomType,
  SiteInfo,
  StructuredDesignJSON
} from '@/types/architectural';
import { ProgramDelta, ProgramDeltaOp } from '@/types/delta';
import { callGeminiJson, geminiApiKey } from '@/lib/genai/gemini';
import { SYSTEM_ARCHITECTURAL_PROMPT, buildWhatIfDeltaPrompt } from '@/lib/genai/prompts';
import { realiseProgram, MAX_GENERATION_ATTEMPTS, EngineId } from './pipeline';
import { DEFAULT_BAND, constraintsFromDesign, normalizeProgram, programFromDesign } from './program';
import { REQUIRED_SPACE_TYPES, ROOM_TYPE_SPECS, floorName, isBedroomType, normalizeRoomType } from './roomTypes';

export type WhatIfOutcome =
  | {
      status: 'OK';
      design: StructuredDesignJSON;
      summary: string;
      tradeOffs: string[];
      changes: string[];
      warnings: string[];
      engine: EngineId | 'local-interpreter';
      modelId: string;
      geometryChanged: boolean;
    }
  | { status: 'INFEASIBLE'; reason: string; violatedConstraints: string[]; summary: string; engine: string }
  | { status: 'NOT_UNDERSTOOD'; reason: string }
  | { status: 'ENGINE_UNAVAILABLE'; reason: string };

const BANDS: PlanBand[] = ['front', 'middle', 'rear'];
const SIDES: PlanSide[] = ['left', 'center', 'right'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function siteFromDesign(design: StructuredDesignJSON): SiteInfo {
  return {
    plotWidth: design.plot.width,
    plotDepth: design.plot.depth,
    totalArea: design.plot.totalArea || design.plot.width * design.plot.depth,
    orientation: design.plot.orientation as SiteInfo['orientation'],
    // Only canonical designs carry setbacks the layout engine chose; older ones get the standard rule.
    setbacks: (design.schemaVersion || 1) >= 2 ? design.plot.setbacks : undefined
  };
}

/** Schema-validates a raw delta from the planner. */
export function parseDelta(raw: unknown): { delta: ProgramDelta | null; errors: string[] } {
  if (!isRecord(raw)) return { delta: null, errors: ['Response is not a JSON object.'] };
  if (raw.understood === false) return { delta: { understood: false, summary: String(raw.summary || 'The request was not understood.'), tradeOffs: [], ops: [] }, errors: [] };
  if (!Array.isArray(raw.ops) || raw.ops.length === 0) return { delta: null, errors: ['Response has no "ops".'] };
  const errors: string[] = [];
  const ops: ProgramDeltaOp[] = [];
  raw.ops.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`ops[${index}] is not an object.`);
      return;
    }
    const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
    const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
    const band = BANDS.includes(entry.band as PlanBand) ? (entry.band as PlanBand) : undefined;
    const side = SIDES.includes(entry.side as PlanSide) ? (entry.side as PlanSide) : undefined;
    switch (entry.op) {
      case 'add_room': {
        const type = normalizeRoomType(entry.type);
        if (!type || ['stair', 'passage', 'void'].includes(type)) errors.push(`ops[${index}]: "${String(entry.type)}" is not a room type that can be added.`);
        else ops.push({ op: 'add_room', type, name: text(entry.name), floor: num(entry.floor), areaSqFt: num(entry.areaSqFt), band, side, attachedTo: text(entry.attachedTo) });
        break;
      }
      case 'remove_room':
      case 'rename_room':
      case 'resize_room':
      case 'move_room': {
        const target = text(entry.target);
        if (!target) { errors.push(`ops[${index}] (${entry.op}) has no target.`); break; }
        if (entry.op === 'remove_room') ops.push({ op: 'remove_room', target });
        else if (entry.op === 'rename_room') {
          const name = text(entry.name);
          if (name) ops.push({ op: 'rename_room', target, name });
          else errors.push(`ops[${index}] (rename_room) has no name.`);
        } else if (entry.op === 'resize_room') {
          const areaSqFt = num(entry.areaSqFt);
          const scale = num(entry.scale);
          if (areaSqFt || scale) ops.push({ op: 'resize_room', target, areaSqFt, scale });
          else errors.push(`ops[${index}] (resize_room) needs areaSqFt or scale.`);
        } else ops.push({ op: 'move_room', target, floor: num(entry.floor), band, side, nextTo: text(entry.nextTo) });
        break;
      }
      case 'add_floor':
        ops.push({ op: 'add_floor' });
        break;
      case 'set_appearance': {
        const appearance: Partial<HouseAppearance> = {};
        (['wallColor', 'roofColor', 'frameColor'] as const).forEach((key) => { if (HEX.test(String(entry[key] || ''))) appearance[key] = String(entry[key]); });
        if (['wood', 'stone', 'concrete', 'neutral'].includes(String(entry.accentMaterial))) appearance.accentMaterial = entry.accentMaterial as HouseAppearance['accentMaterial'];
        if (Object.keys(appearance).length) ops.push({ op: 'set_appearance', appearance });
        else errors.push(`ops[${index}] (set_appearance) has no valid colour or material.`);
        break;
      }
      default:
        errors.push(`ops[${index}] has unknown op "${String(entry.op)}".`);
    }
  });
  if (errors.length) return { delta: null, errors };
  return { delta: { understood: true, summary: String(raw.summary || ''), tradeOffs: Array.isArray(raw.tradeOffs) ? raw.tradeOffs.filter((t): t is string => typeof t === 'string') : [], ops }, errors };
}

function resolveRoom(program: DesignProgram, reference: string): ProgramRoom | undefined {
  const ref = reference.trim().toLowerCase();
  const byId = program.rooms.find((room) => room.id.toLowerCase() === ref);
  if (byId) return byId;
  const byName = program.rooms.find((room) => room.name.toLowerCase() === ref) || program.rooms.find((room) => room.name.toLowerCase().includes(ref));
  if (byName) return byName;
  const type = normalizeRoomType(ref);
  return type ? program.rooms.find((room) => room.type === type) : undefined;
}

const SPACE_KEY_FOR_TYPE: Partial<Record<RoomType, string>> = {
  dining: 'dining', balcony: 'balcony', study: 'studyWorkspace', store: 'storage', puja: 'prayerRoom', courtyard: 'courtyard', guest_room: 'guestRoom'
};

export interface DeltaApplication {
  program: DesignProgram;
  constraints: DesignConstraints;
  appearance?: HouseAppearance;
  changes: string[];
  errors: string[];
  geometryChanged: boolean;
}

/**
 * Applies a delta to a copy of the programme. The existing rooms that the delta does not mention
 * are carried over untouched; only then is geometry re-derived. Updates the hard requirements to
 * match what the client now asks for (adding a bedroom makes it an N+1 bedroom brief).
 */
export function applyProgramDelta(current: DesignProgram, currentConstraints: DesignConstraints, delta: ProgramDelta, baseAppearance?: HouseAppearance): DeltaApplication {
  const program: DesignProgram = JSON.parse(JSON.stringify(current));
  const constraints: DesignConstraints = JSON.parse(JSON.stringify(currentConstraints));
  const changes: string[] = [];
  const errors: string[] = [];
  let appearance = baseAppearance ? { ...baseAppearance } : program.appearance ? { ...program.appearance } : undefined;
  let geometryChanged = false;
  const count = (...types: RoomType[]) => program.rooms.filter((room) => types.includes(room.type)).length;

  for (const op of delta.ops) {
    if (op.op === 'set_appearance') {
      appearance = { wallColor: '#F4F1EA', roofColor: '#C86A4B', frameColor: '#121417', accentMaterial: 'wood', ...(appearance || {}), ...op.appearance };
      changes.push('Updated the house appearance.');
      continue;
    }
    geometryChanged = true;

    if (op.op === 'add_floor') {
      constraints.floors += 1;
      changes.push(`Added a ${floorName(constraints.floors - 1).toLowerCase()}.`);
      continue;
    }

    if (op.op === 'add_room') {
      const spec = ROOM_TYPE_SPECS[op.type];
      const anchor = op.attachedTo ? resolveRoom(program, op.attachedTo) : undefined;
      if (op.attachedTo && !anchor) {
        errors.push(`Cannot attach the new ${op.type.replace('_', ' ')} to "${op.attachedTo}": no such room.`);
        continue;
      }
      let floor = op.floor ?? anchor?.floor;
      if (floor === undefined) {
        if (isBedroomType(op.type) || op.type === 'lounge') floor = constraints.floors - 1;
        else if (op.type === 'balcony' || op.type === 'terrace') floor = constraints.floors > 1 ? 1 : 0;
        else if (op.type === 'bathroom') {
          // Serve the floor whose bedrooms have the fewest bathrooms.
          const ratio = (level: number) => program.rooms.filter((r) => r.floor === level && r.type === 'bathroom').length / Math.max(1, program.rooms.filter((r) => r.floor === level && isBedroomType(r.type)).length);
          floor = Array.from({ length: constraints.floors }, (_, level) => level).filter((level) => level === 0 || program.rooms.some((r) => r.floor === level && isBedroomType(r.type))).sort((a, b) => ratio(a) - ratio(b))[0] ?? 0;
        } else floor = 0;
      }
      floor = Math.round(floor);
      if (floor < 0 || floor >= constraints.floors) {
        errors.push(`The design has ${constraints.floors} floor(s); there is no floor level ${floor} to put a ${op.type.replace('_', ' ')} on.`);
        continue;
      }
      const sameType = count(op.type) + (op.type === 'bedroom' ? count('master_bedroom') : 0);
      const defaultName = op.type === 'bedroom' ? `Bedroom ${sameType + 1}` : op.type === 'bathroom' ? (anchor ? `${anchor.name} Bath` : `Bathroom ${sameType + 1}`) : op.type.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') + (sameType ? ` ${sameType + 1}` : '');
      let id = `room-${op.type.replace(/_/g, '-')}-${sameType + 1}`;
      while (program.rooms.some((room) => room.id === id)) id += 'b';
      // Put a new major room in the least crowded zone of its floor unless told otherwise.
      const crowd = (band: PlanBand) => program.rooms.filter((room) => room.floor === floor && room.band === band && ROOM_TYPE_SPECS[room.type].placement === 'major').length;
      const preferred = DEFAULT_BAND[op.type];
      const band = op.band || anchor?.band || (spec.placement === 'major' && isBedroomType(op.type) ? (['rear', 'front', 'middle'] as PlanBand[]).sort((a, b) => crowd(a) - crowd(b))[0] : preferred);
      const sidesUsed = program.rooms.filter((room) => room.floor === floor && room.band === band).map((room) => room.side);
      const side = op.side || anchor?.side || (['left', 'right', 'center'] as PlanSide[]).sort((a, b) => sidesUsed.filter((s) => s === a).length - sidesUsed.filter((s) => s === b).length)[0];
      program.rooms.push({
        id, name: op.name || defaultName, type: op.type, floor,
        areaSqFt: Math.round(Math.max(spec.minArea, op.areaSqFt || spec.targetArea)),
        band, side, required: true, attachedTo: anchor?.id, relationships: [], features: ['Added on request']
      });
      if (isBedroomType(op.type)) constraints.bedrooms += 1;
      if (op.type === 'bathroom') constraints.bathrooms = Math.max(constraints.bathrooms, count('bathroom'));
      if (op.type === 'parking') constraints.parkingCars += 1;
      const spaceKey = SPACE_KEY_FOR_TYPE[op.type];
      if (spaceKey && !constraints.requiredSpaces.includes(spaceKey)) constraints.requiredSpaces.push(spaceKey);
      changes.push(`Added ${op.name || defaultName} on the ${floorName(floor).toLowerCase()}.`);
      continue;
    }

    const room = resolveRoom(program, op.target);
    if (!room) {
      errors.push(`There is no room matching "${op.target}" in the current design.`);
      continue;
    }

    if (op.op === 'remove_room') {
      const lastOfKind = (types: RoomType[], label: string) => types.includes(room.type) && count(...types) <= 1 ? `A house needs at least one ${label}; "${room.name}" cannot be removed.` : null;
      const blocked = lastOfKind(['living'], 'living room') || lastOfKind(['kitchen'], 'kitchen') || lastOfKind(['master_bedroom', 'bedroom'], 'bedroom') || lastOfKind(['bathroom'], 'bathroom');
      if (blocked) {
        errors.push(blocked);
        continue;
      }
      const removed = program.rooms.filter((r) => r.id === room.id || r.attachedTo === room.id);
      program.rooms = program.rooms.filter((r) => !removed.includes(r));
      program.rooms.forEach((r) => { r.relationships = r.relationships.filter((rel) => !removed.some((gone) => gone.id === rel.target)); });
      constraints.bedrooms = Math.max(1, count('master_bedroom', 'bedroom'));
      constraints.bathrooms = Math.max(1, Math.min(constraints.bathrooms, count('bathroom')));
      if (room.type === 'parking') constraints.parkingCars = count('parking');
      constraints.requiredSpaces = constraints.requiredSpaces.filter((key) => !REQUIRED_SPACE_TYPES[key] || count(...REQUIRED_SPACE_TYPES[key]) > 0);
      changes.push(`Removed ${removed.map((r) => r.name).join(' and ')}.`);
    } else if (op.op === 'rename_room') {
      changes.push(`Renamed ${room.name} to ${op.name}.`);
      room.name = op.name;
    } else if (op.op === 'resize_room') {
      const spec = ROOM_TYPE_SPECS[room.type];
      const wanted = op.areaSqFt || room.areaSqFt * (op.scale || 1);
      if (wanted < spec.minArea) {
        errors.push(`${room.name} cannot be reduced to ${Math.round(wanted)} sq ft; a ${room.type.replace('_', ' ')} needs at least ${spec.minArea} sq ft.`);
        continue;
      }
      changes.push(`${wanted > room.areaSqFt ? 'Enlarged' : 'Reduced'} ${room.name} from ${room.areaSqFt} to ${Math.round(wanted)} sq ft (target area).`);
      room.areaSqFt = Math.round(wanted);
    } else if (op.op === 'move_room') {
      const other = op.nextTo ? resolveRoom(program, op.nextTo) : undefined;
      if (op.nextTo && !other) {
        errors.push(`There is no room matching "${op.nextTo}" to move ${room.name} next to.`);
        continue;
      }
      const floor = Math.round(op.floor ?? other?.floor ?? room.floor);
      if (floor < 0 || floor >= constraints.floors) {
        errors.push(`The design has ${constraints.floors} floor(s); ${room.name} cannot move to floor level ${floor}.`);
        continue;
      }
      const followers = program.rooms.filter((r) => r.attachedTo === room.id);
      room.floor = floor;
      room.band = op.band || other?.band || room.band;
      room.side = op.side || other?.side || room.side;
      followers.forEach((r) => { r.floor = room.floor; r.band = room.band; r.side = room.side; });
      if (other) {
        room.relationships = [...room.relationships.filter((rel) => rel.target !== other.id), { type: 'ADJACENT_TO', target: other.id }];
        // Within a zone, rooms on the same side are laid out in programme order.
        program.rooms = program.rooms.filter((r) => r.id !== room.id);
        program.rooms.splice(program.rooms.findIndex((r) => r.id === other.id) + 1, 0, room);
      }
      changes.push(`Moved ${room.name}${other ? ` next to ${other.name}` : ''} (${floorName(room.floor).toLowerCase()}, ${room.band} zone).`);
    }
  }

  if (appearance) program.appearance = appearance;
  normalizeProgram(program);
  return { program, constraints, appearance, changes, errors, geometryChanged };
}

// ---------- Local interpreter (used only when Gemini cannot be reached) ----------

const ROOM_WORDS: [RegExp, RoomType][] = [
  [/master\s+bed(room)?/, 'master_bedroom'], [/guest\s*(room|bedroom)/, 'guest_room'], [/bed\s?rooms?/, 'bedroom'],
  [/bath\s?rooms?|toilets?|washrooms?|\bbaths?\b/, 'bathroom'], [/kitchen/, 'kitchen'], [/living(\s+room)?|drawing\s+room|\bhall\b/, 'living'],
  [/dining(\s+room)?/, 'dining'], [/study|home\s+office|office|workspace/, 'study'], [/store\s?room|storage|\bstore\b/, 'store'],
  [/puja|pooja|prayer(\s+room)?/, 'puja'], [/balcon(y|ies)/, 'balcony'], [/courtyard/, 'courtyard'], [/utility/, 'utility'],
  [/parking|car\s?porch|garage/, 'parking'], [/lounge|family\s+room/, 'lounge'], [/terrace/, 'terrace']
];
const COUNT_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, another: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const COLOURS: Record<string, string> = {
  ivory: '#F4F1EA', white: '#FAFAFA', sand: '#E6DFD3', beige: '#E6DFD3', grey: '#B0B5BC', gray: '#B0B5BC', terracotta: '#C86A4B', red: '#B5452F',
  brown: '#4A3525', charcoal: '#282623', black: '#121417', slate: '#3A424B', blue: '#3B5B7A', green: '#4A6B5D', yellow: '#E8C873', cream: '#F1E8D8'
};

/** The first room mentioned in the text (the thing being acted on), not the first pattern in the table. */
function findRoomType(text: string): RoomType | null {
  let best: { index: number; length: number; type: RoomType } | null = null;
  for (const [pattern, type] of ROOM_WORDS) {
    const match = pattern.exec(text);
    if (match && (!best || match.index < best.index || (match.index === best.index && match[0].length > best.length))) {
      best = { index: match.index, length: match[0].length, type };
    }
  }
  return best ? best.type : null;
}

function floorHint(text: string, floors: number): number | undefined {
  if (/second\s+floor/.test(text)) return 2;
  if (/upstairs|first\s+floor|upper\s+floor/.test(text)) return Math.min(1, floors - 1) || 1;
  if (/downstairs|ground\s+floor|lower\s+floor/.test(text)) return 0;
  return undefined;
}

/** Turns a plain-English request into delta ops without an AI call. Returns null when nothing is recognised. */
export function interpretRequestLocally(message: string, program: DesignProgram, constraints: DesignConstraints): ProgramDelta | null {
  const text = message.toLowerCase().replace(/\s+/g, ' ').trim();
  const ops: ProgramDeltaOp[] = [];

  const colour = Object.keys(COLOURS).find((name) => new RegExp(`\\b${name}\\b`).test(text));
  if (colour && /wall|roof|frame|window|colou?r|paint|exterior/.test(text)) {
    const key = /roof/.test(text) ? 'roofColor' : /frame|window/.test(text) ? 'frameColor' : 'wallColor';
    return { understood: true, summary: `Changed the ${key.replace('Color', '')} colour to ${colour}.`, tradeOffs: ['Appearance only: the floor plan is unchanged.'], ops: [{ op: 'set_appearance', appearance: { [key]: COLOURS[colour] } }] };
  }

  if (/\badd\b.*\b(floor|storey|story)\b/.test(text) && !findRoomType(text)) {
    return { understood: true, summary: 'Added a floor.', tradeOffs: ['A new floor needs the staircase to continue upward and adds structural cost.'], ops: [{ op: 'add_floor' }] };
  }

  const type = findRoomType(text);
  if (!type) return null;
  const floor = floorHint(text, constraints.floors);

  if (/\b(remove|delete|drop|get rid of|without)\b/.test(text)) {
    const target = program.rooms.filter((room) => room.type === type && (floor === undefined || room.floor === floor)).pop() || (type === 'bedroom' ? undefined : program.rooms.filter((room) => room.type === type).pop());
    if (!target) return null;
    return { understood: true, summary: `Removed ${target.name}.`, tradeOffs: ['The remaining rooms are re-planned over the freed area.'], ops: [{ op: 'remove_room', target: target.id }] };
  }

  const moveMatch = text.match(/\b(move|shift|relocate|put|place)\b/);
  if (moveMatch) {
    const target = program.rooms.find((room) => room.type === type);
    if (!target) return null;
    const after = text.split(/next to|beside|adjacent to|near/)[1];
    const otherType = after ? findRoomType(after) : null;
    const other = otherType ? program.rooms.find((room) => room.type === otherType && room.id !== target.id) : undefined;
    const band: PlanBand | undefined = /\bfront\b/.test(text) ? 'front' : /\b(rear|back)\b/.test(text) ? 'rear' : undefined;
    const side: PlanSide | undefined = /\bleft\b/.test(text) ? 'left' : /\bright\b/.test(text) ? 'right' : undefined;
    if (!other && floor === undefined && !band && !side) return null;
    return { understood: true, summary: `Moved ${target.name}${other ? ` next to ${other.name}` : ''}.`, tradeOffs: ['Neighbouring rooms shift to make room.'], ops: [{ op: 'move_room', target: target.id, nextTo: other?.id, floor, band, side }] };
  }

  const resize = /\b(bigger|larger|expand|enlarge|increase|spacious|wider|extend)\b/.test(text) ? 1 : /\b(smaller|reduce|shrink|decrease|compact)\b/.test(text) ? -1 : 0;
  if (resize !== 0 && !/\b(add|another|extra)\b/.test(text)) {
    const target = program.rooms.find((room) => room.type === type && (floor === undefined || room.floor === floor)) || (type === 'bedroom' ? program.rooms.find((room) => room.type === 'master_bedroom') : undefined);
    if (!target) return null;
    const percent = Number(text.match(/(\d+)\s*%/)?.[1]) || 20;
    const scale = resize > 0 ? 1 + percent / 100 : 1 - percent / 100;
    return { understood: true, summary: `${resize > 0 ? 'Enlarged' : 'Reduced'} ${target.name} by ${percent}%.`, tradeOffs: [resize > 0 ? 'The extra area comes out of the plot depth or neighbouring rooms.' : 'The freed area is shared among neighbouring rooms.'], ops: [{ op: 'resize_room', target: target.id, scale }] };
  }

  if (/\b(add|another|extra|one more|include|need|want)\b/.test(text)) {
    const countMatch = text.match(/\b(\d+|a|an|one|another|two|three|four|five|six|seven|eight|nine|ten)\b(?:\s+more)?\s+(?:\w+\s+){0,2}?(?:bed|bath|toilet|kitchen|living|dining|study|office|store|storage|puja|prayer|balcon|courtyard|utility|parking|car|lounge|terrace|guest)/);
    const quantity = Math.min(20, countMatch ? COUNT_WORDS[countMatch[1]] || Number(countMatch[1]) || 1 : 1);
    const attachTo = type === 'bathroom' && /attached|ensuite|en-suite/.test(text)
      ? program.rooms.find((room) => isBedroomType(room.type) && (floor === undefined || room.floor === floor) && !program.rooms.some((bath) => bath.type === 'bathroom' && bath.attachedTo === room.id))
      : undefined;
    const addType: RoomType = type === 'master_bedroom' && program.rooms.some((room) => room.type === 'master_bedroom') ? 'bedroom' : type;
    return {
      understood: true,
      summary: `Added ${quantity === 1 ? 'a' : quantity} ${addType.replace('_', ' ')}${quantity > 1 ? 's' : ''}${floor !== undefined ? ` on the ${floorName(floor).toLowerCase()}` : ''}.`,
      tradeOffs: ['Existing rooms keep their floor and zone; their sizes may adjust to make space.'],
      ops: Array.from({ length: quantity }, () => ({ op: 'add_room' as const, type: addType, floor, attachedTo: attachTo?.id }))
    };
  }
  return null;
}

/**
 * What-If pipeline: existing canonical design + request → delta → apply → re-layout → validate.
 * The stored design is never mutated; an infeasible or invalid change leaves it exactly as it was.
 */
export async function runWhatIf(design: StructuredDesignJSON, message: string): Promise<WhatIfOutcome> {
  const program = programFromDesign(design);
  const constraints = constraintsFromDesign(design);
  const site = siteFromDesign(design);
  const deadline = Date.now() + 150_000;

  let engine: EngineId | 'local-interpreter' = 'gemini';
  let modelId = '';
  let feedback: string[] | undefined;
  let lastFailure: WhatIfOutcome | null = null;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    let delta: ProgramDelta | null = null;

    if (engine === 'gemini' && geminiApiKey()) {
      const call = await callGeminiJson(SYSTEM_ARCHITECTURAL_PROMPT, buildWhatIfDeltaPrompt({ site, constraints, program, message, feedback }), deadline);
      if (call.ok) {
        modelId = call.modelId;
        const parsed = parseDelta(call.json);
        // When the planner returns no usable change (it sometimes declines a request it thinks will not
        // fit), a plainly worded request is still carried out, so the layout engine gives the real answer.
        const plain = !parsed.delta || !parsed.delta.understood ? interpretRequestLocally(message, program, constraints) : null;
        if (plain) {
          delta = plain;
          engine = 'local-interpreter';
          modelId = 'local-interpreter';
        } else if (!parsed.delta) {
          feedback = parsed.errors;
          lastFailure = { status: 'NOT_UNDERSTOOD', reason: `The AI planner's change could not be read: ${parsed.errors.join(' ')}` };
          continue;
        } else {
          delta = parsed.delta;
        }
      } else if (call.kind === 'BAD_RESPONSE') {
        feedback = [`${call.detail} Return one valid JSON object.`];
        lastFailure = { status: 'NOT_UNDERSTOOD', reason: call.detail };
        continue;
      } else {
        engine = 'local-interpreter';
      }
    } else {
      engine = 'local-interpreter';
    }

    if (engine === 'local-interpreter') {
      modelId = 'local-interpreter';
      delta = interpretRequestLocally(message, program, constraints);
      if (!delta) {
        return geminiApiKey()
          ? { status: 'ENGINE_UNAVAILABLE', reason: 'Gemini could not be reached and the request is not one the built-in interpreter understands. Nothing was changed.' }
          : { status: 'NOT_UNDERSTOOD', reason: 'I could not work out what to change. Try naming the room and the change, for example "add a bedroom upstairs", "make the kitchen 20% larger" or "move the study next to the living room".' };
      }
    }

    if (!delta) continue;
    if (!delta.understood) return { status: 'NOT_UNDERSTOOD', reason: delta.summary || 'The request was not clear enough to act on.' };

    const applied = applyProgramDelta(program, constraints, delta, design.appearance);
    const summary = delta.summary || applied.changes.join(' ');
    if (applied.errors.length) {
      lastFailure = { status: 'INFEASIBLE', reason: applied.errors.join(' '), violatedConstraints: applied.errors, summary, engine };
      if (engine === 'local-interpreter') return lastFailure;
      feedback = applied.errors;
      continue;
    }

    if (!applied.geometryChanged) {
      // Appearance only: geometry is byte-for-byte the existing design.
      const next: StructuredDesignJSON = JSON.parse(JSON.stringify(design));
      next.appearance = applied.appearance;
      if (next.program) next.program.appearance = applied.appearance;
      next.generationMetadata = { intent: 'MODIFY_CURRENT_DESIGN', engine: engine === 'gemini' ? 'gemini' : 'local-rule-engine', modelId, attempts: attempt, generatedAt: new Date().toISOString() };
      return { status: 'OK', design: next, summary, tradeOffs: delta.tradeOffs, changes: applied.changes, warnings: [], engine, modelId, geometryChanged: false };
    }

    const stage = realiseProgram(applied.program, site, applied.constraints);
    if (stage.design) {
      stage.design.conceptNumber = design.conceptNumber;
      stage.design.appearance = applied.appearance || design.appearance || stage.design.appearance;
      stage.design.layoutNotes = stage.notes;
      stage.design.generationMetadata = { intent: 'MODIFY_CURRENT_DESIGN', engine: engine === 'gemini' ? 'gemini' : 'local-rule-engine', modelId, attempts: attempt, generatedAt: new Date().toISOString() };
      return { status: 'OK', design: stage.design, summary, tradeOffs: [...delta.tradeOffs, ...stage.notes], changes: applied.changes, warnings: stage.warnings, engine, modelId, geometryChanged: true };
    }

    lastFailure = {
      status: 'INFEASIBLE',
      reason: stage.infeasible?.reason || `The change would produce an invalid plan: ${stage.errors.join(' ')}`,
      violatedConstraints: stage.infeasible?.violatedConstraints || stage.errors,
      summary,
      engine
    };
    // A capacity failure is a fact about the plot, not something a second AI answer can fix.
    if (stage.infeasible || engine === 'local-interpreter') return lastFailure;
    feedback = stage.errors;
  }

  return lastFailure || { status: 'NOT_UNDERSTOOD', reason: 'The request could not be turned into a change.' };
}
