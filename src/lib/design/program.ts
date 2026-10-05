import {
  ArchitecturalBrief,
  DesignConstraints,
  DesignPreferences,
  DesignProgram,
  DesignRequirements,
  DesignSignature,
  HouseAppearance,
  PlanBand,
  PlanSide,
  ProgramRoom,
  RelationshipType,
  RoomRelationship,
  RoomType,
  SpecialMode,
  StructuredDesignJSON
} from '@/types/architectural';
import { ROOM_TYPE_SPECS, countBedrooms, countRoomsOfType, inferRoomType, isBedroomType, normalizeRoomType } from './roomTypes';

const RELATIONSHIP_TYPES: RelationshipType[] = ['ADJACENT_TO', 'CONNECTED_TO', 'ATTACHED_TO', 'NEAR', 'PRIVATE_FROM', 'ACCESSIBLE_FROM'];
const BANDS: PlanBand[] = ['front', 'middle', 'rear'];
const SIDES: PlanSide[] = ['left', 'center', 'right'];
const PLANNING_TYPES: DesignSignature['planningType'][] = ['courtyard_centered', 'linear_circulation', 'zoned_wings', 'compact_core', 'l_shaped'];
const CIRCULATION_TYPES: DesignSignature['circulationType'][] = ['central', 'peripheral', 'spine'];
const MODES: SpecialMode[] = ['climate_adaptive', 'life_stage', 'budget_first', 'renovation'];

/** Types the layout engine creates itself; a planner must not author them. */
const ENGINE_OWNED: RoomType[] = ['stair', 'passage', 'void'];

export const DEFAULT_BAND: Record<RoomType, PlanBand> = {
  entrance: 'front', living: 'front', parking: 'front', balcony: 'front',
  dining: 'middle', kitchen: 'middle', utility: 'middle', courtyard: 'middle', lounge: 'middle', study: 'middle', store: 'middle', puja: 'middle', stair: 'middle',
  master_bedroom: 'rear', bedroom: 'rear', guest_room: 'rear', bathroom: 'rear', dressing: 'rear', terrace: 'rear', passage: 'rear', void: 'middle'
};

export interface ProgramParseResult {
  program: DesignProgram | null;
  errors: string[]; // schema-level problems that make the program unusable
  notes: string[]; // normalisations applied (reported, never hidden)
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown, fallback = '') => (typeof value === 'string' && value.trim() ? value.trim() : fallback);
const num = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const strList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && !!v.trim()).map((v) => v.trim()) : []);
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'room';

export function buildConstraints(requirements: DesignRequirements, preferences: DesignPreferences): DesignConstraints {
  const spaces = requirements.spaces || ({} as DesignRequirements['spaces']);
  return {
    bedrooms: Math.max(1, Math.round(Number(requirements.bedrooms) || 1)),
    bathrooms: Math.max(1, Math.round(Number(requirements.bathrooms) || 1)),
    floors: Math.max(1, Math.round(Number(requirements.floors) || 1)),
    parkingCars: Math.max(0, Math.round(Number(spaces.parkingCars) || 0)),
    requiredSpaces: Object.entries(spaces).filter(([key, value]) => key !== 'parkingCars' && value === true).map(([key]) => key),
    familySize: Math.max(1, Math.round(Number(requirements.familySize) || 4)),
    budgetRange: requirements.budgetRange || 'Moderate',
    modes: (preferences.modes || []).filter((mode) => MODES.includes(mode)),
    style: preferences.primaryStyle || 'Modern'
  };
}

/**
 * Schema-validates and normalises a raw planner response into a DesignProgram.
 * Nothing is invented here: unknown room types and malformed rooms are errors, not silently dropped rooms.
 */
export function parseProgram(raw: unknown, constraints: DesignConstraints): ProgramParseResult {
  const errors: string[] = [];
  const notes: string[] = [];
  if (!isRecord(raw)) return { program: null, errors: ['Response is not a JSON object.'], notes };
  if (!Array.isArray(raw.rooms) || raw.rooms.length === 0) return { program: null, errors: ['Response has no "rooms" array.'], notes };

  const usedIds = new Set<string>();
  const rooms: ProgramRoom[] = [];

  raw.rooms.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`rooms[${index}] is not an object.`);
      return;
    }
    const name = str(entry.name, str(entry.id, `Room ${index + 1}`));
    const type = normalizeRoomType(entry.type) || normalizeRoomType(entry.roomType) || normalizeRoomType(entry.category);
    if (!type) {
      errors.push(`Room "${name}" has an unknown type "${String(entry.type ?? entry.category)}".`);
      return;
    }
    if (ENGINE_OWNED.includes(type)) {
      notes.push(`"${name}" (${type}) is placed by the layout engine and was not taken from the planner.`);
      return;
    }

    let id = slug(str(entry.id, name));
    if (!id.startsWith('room-')) id = `room-${id}`;
    while (usedIds.has(id)) id = `${id}-${index}`;
    usedIds.add(id);

    const floorRaw = num(entry.floor ?? entry.floorLevel ?? (isRecord(entry.position) ? entry.position.floorLevel : undefined));
    const floor = floorRaw === null ? 0 : Math.round(floorRaw);
    if (floor < 0 || floor >= constraints.floors) {
      errors.push(`Room "${name}" is on floor ${floor} but the design has ${constraints.floors} floor(s) (levels 0–${constraints.floors - 1}).`);
      return;
    }

    const spec = ROOM_TYPE_SPECS[type];
    const width = num(entry.widthFt);
    const depth = num(entry.depthFt);
    let area = num(entry.areaSqFt) ?? (width && depth ? width * depth : null);
    if (area === null || area <= 0) {
      area = spec.targetArea;
      notes.push(`"${name}" had no usable area; the ${type} standard of ${area} sq ft was used.`);
    }
    if (area < spec.minArea) {
      notes.push(`"${name}" was requested at ${Math.round(area)} sq ft, below the ${spec.minArea} sq ft minimum for a ${type}; raised to the minimum.`);
      area = spec.minArea;
    }
    const maxArea = Math.max(spec.targetArea * 3, 450);
    if (area > maxArea) {
      notes.push(`"${name}" was requested at ${Math.round(area)} sq ft; capped at ${maxArea} sq ft.`);
      area = maxArea;
    }

    const band = BANDS.includes(entry.band as PlanBand) ? (entry.band as PlanBand) : DEFAULT_BAND[type];
    const side = SIDES.includes(entry.side as PlanSide) ? (entry.side as PlanSide) : 'center';
    const relationships: RoomRelationship[] = Array.isArray(entry.relationships)
      ? entry.relationships
          .filter(isRecord)
          .map((rel) => ({ type: str(rel.type).toUpperCase() as RelationshipType, target: str(rel.target) }))
          .filter((rel) => RELATIONSHIP_TYPES.includes(rel.type) && !!rel.target)
      : [];

    rooms.push({
      id,
      name,
      type,
      floor,
      areaSqFt: Math.round(area),
      band,
      side,
      required: entry.required !== false,
      attachedTo: str(entry.attachedTo) || undefined,
      relationships,
      features: strList(entry.features),
      accessible: entry.accessible === true || undefined
    });
  });

  if (errors.length) return { program: null, errors, notes };

  // Resolve references by id or by the id the planner originally wrote.
  const rawIdMap = new Map<string, string>();
  (raw.rooms as unknown[]).forEach((entry) => {
    if (!isRecord(entry)) return;
    const original = str(entry.id);
    const normalised = original ? (slug(original).startsWith('room-') ? slug(original) : `room-${slug(original)}`) : '';
    if (original && rooms.some((room) => room.id === normalised)) rawIdMap.set(original, normalised);
  });
  const resolve = (ref: string) => (rooms.some((room) => room.id === ref) ? ref : rawIdMap.get(ref) || rooms.find((room) => room.name.toLowerCase() === ref.toLowerCase())?.id);

  for (const room of rooms) {
    room.relationships = room.relationships
      .map((rel) => ({ ...rel, target: resolve(rel.target) || '' }))
      .filter((rel) => rel.target && rel.target !== room.id);
    if (room.attachedTo) {
      const anchorId = resolve(room.attachedTo);
      if (!anchorId || anchorId === room.id) {
        notes.push(`"${room.name}" was attached to unknown room "${room.attachedTo}"; the attachment was ignored.`);
        room.attachedTo = undefined;
      } else {
        room.attachedTo = anchorId;
      }
    }
    if (!room.attachedTo) {
      const attached = room.relationships.find((rel) => rel.type === 'ATTACHED_TO');
      if (attached && ROOM_TYPE_SPECS[room.type].placement !== 'major') room.attachedTo = attached.target;
    }
  }

  const program: DesignProgram = {
    rooms,
    stairSide: raw.stairSide === 'left' ? 'left' : 'right',
    planningType: PLANNING_TYPES.includes(raw.planningType as DesignSignature['planningType']) ? (raw.planningType as DesignSignature['planningType']) : 'linear_circulation',
    circulationType: CIRCULATION_TYPES.includes(raw.circulationType as DesignSignature['circulationType']) ? (raw.circulationType as DesignSignature['circulationType']) : 'spine',
    architecturalBrief: parseBrief(raw.architecturalBrief),
    rationale: str(raw.rationale),
    circulationNotes: str(raw.circulationNotes),
    styleFeatures: strList(raw.styleFeatures),
    modeConsiderations: Array.isArray(raw.modeConsiderations)
      ? raw.modeConsiderations.filter(isRecord).map((item) => ({ mode: item.mode as SpecialMode, note: str(item.note) })).filter((item) => MODES.includes(item.mode) && !!item.note)
      : [],
    appearance: parseAppearance(raw.appearance)
  };

  normalizeProgram(program, notes);
  return { program, errors, notes };
}

function parseBrief(value: unknown): ArchitecturalBrief | undefined {
  if (!isRecord(value)) return undefined;
  const keys: (keyof ArchitecturalBrief)[] = ['planningIntent', 'siteResponse', 'orientationStrategy', 'publicPrivateStrategy', 'serviceStrategy', 'circulationStrategy', 'climateStrategy', 'accessibilityStrategy', 'styleStrategy'];
  const brief = {} as ArchitecturalBrief;
  keys.forEach((key) => { brief[key] = str(value[key]); });
  return brief;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
export function parseAppearance(value: unknown): HouseAppearance | undefined {
  if (!isRecord(value)) return undefined;
  if (!HEX.test(str(value.wallColor)) || !HEX.test(str(value.roofColor)) || !HEX.test(str(value.frameColor))) return undefined;
  const accent = str(value.accentMaterial);
  return {
    wallColor: str(value.wallColor),
    roofColor: str(value.roofColor),
    frameColor: str(value.frameColor),
    accentMaterial: (['wood', 'stone', 'concrete', 'neutral'].includes(accent) ? accent : 'wood') as HouseAppearance['accentMaterial']
  };
}

/**
 * Makes attachments structurally consistent (same floor and band as the anchor) and fills the
 * attachments that are architectural givens: entrance → living, utility → kitchen.
 */
export function normalizeProgram(program: DesignProgram, notes: string[] = []): DesignProgram {
  const byId = new Map(program.rooms.map((room) => [room.id, room]));
  for (const room of program.rooms) {
    const placement = ROOM_TYPE_SPECS[room.type].placement;
    if (placement === 'major') {
      room.attachedTo = undefined;
      continue;
    }
    let anchor = room.attachedTo ? byId.get(room.attachedTo) : undefined;
    if (anchor && ROOM_TYPE_SPECS[anchor.type].placement !== 'major') anchor = undefined;
    if (!anchor) {
      const sameFloor = program.rooms.filter((other) => other.floor === room.floor && other.id !== room.id);
      if (room.type === 'entrance') anchor = sameFloor.find((other) => other.type === 'living') || sameFloor.find((other) => other.type === 'lounge');
      if (room.type === 'utility') anchor = sameFloor.find((other) => other.type === 'kitchen');
      if (room.type === 'dressing') anchor = sameFloor.find((other) => isBedroomType(other.type));
    }
    if (anchor) {
      if (anchor.floor !== room.floor) {
        notes.push(`"${room.name}" was moved to floor ${anchor.floor} to stay attached to "${anchor.name}".`);
        room.floor = anchor.floor;
      }
      room.attachedTo = anchor.id;
      room.band = anchor.band;
      room.side = anchor.side;
    } else {
      room.attachedTo = undefined;
    }
  }
  return program;
}

/** Hard-requirement check on the program itself, before any geometry is produced. */
export function validateProgramRequirements(program: DesignProgram, constraints: DesignConstraints): string[] {
  const errors: string[] = [];
  const count = (...types: RoomType[]) => program.rooms.filter((room) => types.includes(room.type)).length;
  const bedrooms = count('master_bedroom', 'bedroom');
  if (bedrooms !== constraints.bedrooms) errors.push(`Requested ${constraints.bedrooms} bedrooms but the program contains ${bedrooms}.`);
  const bathrooms = count('bathroom');
  if (bathrooms < constraints.bathrooms) errors.push(`Requested at least ${constraints.bathrooms} bathrooms but the program contains ${bathrooms}.`);
  for (let floor = 0; floor < constraints.floors; floor++) {
    if (!program.rooms.some((room) => room.floor === floor && ROOM_TYPE_SPECS[room.type].habitable)) {
      errors.push(`Requested ${constraints.floors} floors but floor level ${floor} has no habitable room.`);
    }
  }
  if (!count('living')) errors.push('The program has no living room.');
  if (!count('kitchen')) errors.push('The program has no kitchen.');
  if (constraints.parkingCars > 0 && !count('parking')) errors.push(`Requested parking for ${constraints.parkingCars} car(s) but the program has no parking space.`);
  const spaceTypes: Record<string, RoomType[]> = {
    dining: ['dining'], balcony: ['balcony', 'terrace'], studyWorkspace: ['study'], storage: ['store', 'utility'], prayerRoom: ['puja'], courtyard: ['courtyard'], guestRoom: ['guest_room']
  };
  for (const space of constraints.requiredSpaces) {
    const types = spaceTypes[space];
    if (types && !count(...types)) errors.push(`Requested space "${space}" is missing from the program.`);
  }
  if (constraints.modes.includes('life_stage')) {
    const groundBed = program.rooms.some((room) => room.floor === 0 && isBedroomType(room.type));
    const groundBath = program.rooms.some((room) => room.floor === 0 && room.type === 'bathroom');
    if (!groundBed || !groundBath) errors.push('Life-Stage mode requires a bedroom and a bathroom on the ground floor.');
  }
  return errors;
}

/**
 * Recovers an editable program from a stored design. schemaVersion 2 designs carry their program;
 * older designs are reverse-engineered from their rooms so What-If can still edit them.
 */
export function programFromDesign(design: StructuredDesignJSON): DesignProgram {
  if (design.program?.rooms?.length) return JSON.parse(JSON.stringify(design.program));

  const rooms: ProgramRoom[] = [];
  const floors = Array.from(new Set(design.rooms.map((room) => room.position.floorLevel || 0)));
  for (const floor of floors) {
    const onFloor = design.rooms.filter((room) => (room.position.floorLevel || 0) === floor);
    const minX = Math.min(...onFloor.map((room) => room.position.x));
    const maxX = Math.max(...onFloor.map((room) => room.position.x + room.position.width));
    const minY = Math.min(...onFloor.map((room) => room.position.y));
    const maxY = Math.max(...onFloor.map((room) => room.position.y + room.position.height));
    for (const room of onFloor) {
      const type = inferRoomType(room);
      if (ENGINE_OWNED.includes(type)) continue;
      const cx = (room.position.x + room.position.width / 2 - minX) / Math.max(1, maxX - minX);
      const cy = (room.position.y + room.position.height / 2 - minY) / Math.max(1, maxY - minY);
      const spec = ROOM_TYPE_SPECS[type];
      rooms.push({
        id: room.id,
        name: room.name,
        type,
        floor,
        areaSqFt: Math.round(Math.max(spec.minArea, Math.min(room.areaSqFt || spec.targetArea, Math.max(spec.targetArea * 3, 450)))),
        band: cy < 0.34 ? 'front' : cy < 0.67 ? 'middle' : 'rear',
        side: cx < 0.34 ? 'left' : cx < 0.67 ? 'center' : 'right',
        required: true,
        attachedTo: room.attachedTo,
        relationships: room.relationships || [],
        features: room.features || []
      });
    }
  }
  const program: DesignProgram = {
    rooms,
    stairSide: 'right',
    planningType: design.designSignature?.planningType || 'linear_circulation',
    circulationType: design.designSignature?.circulationType || 'spine',
    architecturalBrief: design.architecturalBrief,
    rationale: design.rationale || '',
    circulationNotes: design.circulationNotes || '',
    styleFeatures: design.styleFeatures || [],
    modeConsiderations: design.modeConsiderations || [],
    appearance: design.appearance
  };
  return normalizeProgram(program);
}

/** Constraints for a stored design: the recorded ones, or what the design itself demonstrates. */
export function constraintsFromDesign(design: StructuredDesignJSON): DesignConstraints {
  if (design.constraints) return JSON.parse(JSON.stringify(design.constraints));
  const maxLevel = Math.max(0, ...design.rooms.map((room) => room.position.floorLevel || 0));
  return {
    bedrooms: Math.max(1, countBedrooms(design)),
    bathrooms: Math.max(1, countRoomsOfType(design, 'bathroom')),
    floors: Math.max(design.floorsCount || 1, maxLevel + 1),
    parkingCars: countRoomsOfType(design, 'parking'),
    requiredSpaces: [],
    familySize: 4,
    budgetRange: 'Moderate',
    modes: (design.modeConsiderations || []).map((item) => item.mode).filter((mode) => MODES.includes(mode)),
    style: design.styleFeatures?.[0] || 'Modern'
  };
}
