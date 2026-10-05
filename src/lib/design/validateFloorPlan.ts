import { DesignConstraints, DesignIssue, RoomType, StructuredDesignJSON } from '@/types/architectural';
import { designCells, rectOverlapArea, sharedEdge } from '@/lib/geometry/planGeometry';
import { REQUIRED_SPACE_TYPES, ROOM_TYPE_SPECS, countBedrooms, countRoomsOfType, floorName, inferRoomType, isBedroomType } from './roomTypes';

export interface ValidationReport {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  issues: DesignIssue[]; // the errors, tagged with the validation stage that raised them
  score: number; // 0 to 100
}

export interface ExpectedRequirements {
  bedrooms?: number;
  bathrooms?: number;
  floors?: number;
  parkingCars?: number;
  plotWidth?: number;
  plotDepth?: number;
  familySize?: number;
  requiredSpaces?: string[] | Record<string, boolean | number>;
  modes?: DesignConstraints['modes'];
}

const OPEN_TYPES: RoomType[] = ['parking', 'courtyard', 'void', 'terrace', 'balcony'];
const PRIVATE_OFF_BEDROOM: RoomType[] = ['bathroom', 'dressing', 'balcony', 'terrace'];

/**
 * Validates a design before it may be saved or rendered. Stages run in order:
 * schema → requirements → geometry → spatial → feasibility.
 * Hard requirements are errors, never warnings: a 3-bedroom G+1 brief cannot pass as 2 bedrooms or one floor.
 */
export function validateFloorPlan(design: StructuredDesignJSON, expectedRequirements?: ExpectedRequirements): ValidationReport {
  const issues: DesignIssue[] = [];
  const warnings: string[] = [];
  const fail = (stage: DesignIssue['stage'], code: string, message: string) => issues.push({ stage, code, message });
  const finish = (): ValidationReport => {
    const errors = issues.map((issue) => issue.message);
    return { isValid: errors.length === 0, errors, warnings, issues, score: Math.max(0, 100 - errors.length * 25 - warnings.length * 5) };
  };

  // ---------- 1. Schema / renderability ----------
  if (!design || typeof design !== 'object') {
    fail('schema', 'NOT_AN_OBJECT', 'Design is not an object.');
    return finish();
  }
  if (!Array.isArray(design.rooms) || design.rooms.length === 0) {
    fail('schema', 'NO_ROOMS', 'Design contains no rooms.');
    return finish();
  }
  const plotWidth = Number(expectedRequirements?.plotWidth ?? design.plot?.width);
  const plotDepth = Number(expectedRequirements?.plotDepth ?? design.plot?.depth);
  if (!(plotWidth > 0) || !(plotDepth > 0)) {
    fail('schema', 'NO_PLOT', 'Design has no valid plot dimensions.');
    return finish();
  }
  const seenIds = new Set<string>();
  for (const room of design.rooms) {
    const p = room?.position;
    if (!room || typeof room.id !== 'string' || !room.id || typeof room.name !== 'string') {
      fail('schema', 'ROOM_FIELDS', 'A room is missing its id or name.');
      continue;
    }
    if (seenIds.has(room.id)) fail('schema', 'DUPLICATE_ID', `Room id "${room.id}" is used more than once.`);
    seenIds.add(room.id);
    if (!p || ![p.x, p.y, p.width, p.height].every((value) => typeof value === 'number' && Number.isFinite(value))) {
      fail('schema', 'ROOM_POSITION', `Room "${room.name}" has no numeric position.`);
    }
  }
  if (issues.length) return finish();

  const constraints = design.constraints;
  const expected = {
    bedrooms: expectedRequirements?.bedrooms ?? constraints?.bedrooms,
    bathrooms: expectedRequirements?.bathrooms ?? constraints?.bathrooms,
    floors: expectedRequirements?.floors ?? constraints?.floors,
    parkingCars: expectedRequirements?.parkingCars ?? constraints?.parkingCars,
    requiredSpaces: Array.isArray(expectedRequirements?.requiredSpaces)
      ? expectedRequirements!.requiredSpaces as string[]
      : expectedRequirements?.requiredSpaces
        ? Object.entries(expectedRequirements.requiredSpaces).filter(([, value]) => value === true).map(([key]) => key)
        : constraints?.requiredSpaces || [],
    modes: expectedRequirements?.modes ?? constraints?.modes ?? []
  };

  const rooms = design.rooms.map((room) => ({ room, type: inferRoomType(room), floor: room.position.floorLevel || 0 }));
  const cells = designCells({ ...design, plot: { ...design.plot, width: plotWidth, depth: plotDepth } });
  const cellById = new Map(cells.map((cell) => [cell.id, cell]));

  // ---------- 2. Hard requirements ----------
  const bedroomsCount = countBedrooms(design);
  if (typeof expected.bedrooms === 'number' && bedroomsCount !== expected.bedrooms) {
    fail('requirements', 'BEDROOM_COUNT', `Hard requirement mismatch: expected ${expected.bedrooms} bedrooms but design contains ${bedroomsCount}.`);
  }
  const bathroomsCount = countRoomsOfType(design, 'bathroom');
  if (typeof expected.bathrooms === 'number' && bathroomsCount < expected.bathrooms) {
    fail('requirements', 'BATHROOM_COUNT', `Hard requirement mismatch: expected at least ${expected.bathrooms} bathrooms but design contains ${bathroomsCount}.`);
  }
  const maxLevel = Math.max(...rooms.map((entry) => entry.floor));
  const floorsCount = Math.max(1, Number(design.floorsCount) || 1);
  if (typeof expected.floors === 'number' && floorsCount !== expected.floors) {
    fail('requirements', 'FLOOR_COUNT', `Hard requirement mismatch: expected ${expected.floors} floors but design proposes ${floorsCount}.`);
  }
  if (maxLevel + 1 > floorsCount) fail('requirements', 'FLOOR_LEVELS', `Rooms are placed on level ${maxLevel} but the design declares ${floorsCount} floor(s).`);
  for (let level = 0; level < floorsCount; level++) {
    const habitable = rooms.some((entry) => entry.floor === level && ROOM_TYPE_SPECS[entry.type].habitable);
    if (!habitable) fail('requirements', 'EMPTY_FLOOR', `${floorName(level)} has no habitable room, so the design does not really have ${floorsCount} floors.`);
  }
  if (!countRoomsOfType(design, 'living')) fail('requirements', 'NO_LIVING', 'Missing mandatory Living space.');
  if (!countRoomsOfType(design, 'kitchen')) fail('requirements', 'NO_KITCHEN', 'Missing mandatory Kitchen space.');
  if (bedroomsCount === 0) fail('requirements', 'NO_BEDROOM', 'Missing mandatory Bedroom space.');
  if (bathroomsCount === 0) fail('requirements', 'NO_BATHROOM', 'Missing mandatory Bathroom space.');
  if (typeof expected.parkingCars === 'number' && expected.parkingCars > 0 && !countRoomsOfType(design, 'parking')) {
    fail('requirements', 'NO_PARKING', `Required parking for ${expected.parkingCars} car(s) but no parking space was generated.`);
  }
  for (const space of expected.requiredSpaces) {
    const types = REQUIRED_SPACE_TYPES[space];
    if (types && !countRoomsOfType(design, ...types)) fail('requirements', 'MISSING_SPACE', `Required space "${space}" was not generated.`);
  }
  if (expected.requiredSpaces.includes('outdoorGarden')) {
    const groundArea = cells.filter((cell) => cell.floor === 0 && cell.type !== 'courtyard').reduce((sum, cell) => sum + cell.rect.w * cell.rect.d, 0);
    const openShare = 1 - groundArea / (plotWidth * plotDepth);
    if (openShare < 0.1) fail('requirements', 'NO_GARDEN', `A garden was requested but only ${Math.round(openShare * 100)}% of the plot is left open.`);
  }
  if (expected.modes.includes('life_stage')) {
    const groundBedroom = rooms.some((entry) => entry.floor === 0 && isBedroomType(entry.type));
    const groundBathroom = rooms.some((entry) => entry.floor === 0 && entry.type === 'bathroom');
    if (!groundBedroom || !groundBathroom) fail('requirements', 'LIFE_STAGE_GROUND', 'Life-Stage mode requires a bedroom and a bathroom on the ground floor.');
  }

  // ---------- 3. Geometry ----------
  const setbacks = design.plot?.setbacks;
  for (const { room, type } of rooms) {
    const cell = cellById.get(room.id)!;
    const p = room.position;
    if (p.width <= 0 || p.height <= 0) {
      fail('geometry', 'INVALID_SIZE', `Room "${room.name}" has invalid dimensions.`);
      continue;
    }
    if (p.x < -0.05 || p.y < -0.05 || p.x + p.width > 100.05 || p.y + p.height > 100.05) {
      fail('geometry', 'OUT_OF_PLOT', `Room "${room.name}" extends beyond the plot boundary.`);
    } else if (setbacks) {
      const t = 0.3;
      if (cell.rect.x < setbacks.left - t || cell.rect.y < setbacks.front - t || cell.rect.x + cell.rect.w > plotWidth - setbacks.right + t || cell.rect.y + cell.rect.d > plotDepth - setbacks.rear + t) {
        fail('geometry', 'OUT_OF_ENVELOPE', `Room "${room.name}" extends into the setback area outside the buildable envelope.`);
      }
    }
    if (type === 'void') continue;
    const typeSpec = ROOM_TYPE_SPECS[type];
    const area = cell.rect.w * cell.rect.d;
    const shortSide = Math.min(cell.rect.w, cell.rect.d);
    const longSide = Math.max(cell.rect.w, cell.rect.d);
    const tooSmall = area < typeSpec.minArea * 0.85 || shortSide < typeSpec.minSide - 0.5;
    if (tooSmall) {
      const message = `${room.name} is too small to use (${shortSide.toFixed(1)} ft x ${longSide.toFixed(1)} ft, ${Math.round(area)} sq ft; a ${type.replace('_', ' ')} needs at least ${typeSpec.minSide} ft and ${typeSpec.minArea} sq ft).`;
      if (room.derived) warnings.push(message);
      else fail('geometry', 'ROOM_TOO_SMALL', message);
    } else if (typeSpec.habitable && longSide / shortSide > 3.2) {
      warnings.push(`${room.name} is very elongated (${shortSide.toFixed(1)} ft x ${longSide.toFixed(1)} ft).`);
    }
    if (type === 'parking' && longSide < 14.5) fail('geometry', 'PARKING_TOO_SHORT', `${room.name} is only ${longSide.toFixed(1)} ft long; a car needs about 15 ft.`);
  }
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      if (cells[i].floor !== cells[j].floor) continue;
      const overlap = rectOverlapArea(cells[i].rect, cells[j].rect);
      if (overlap > 1) {
        fail('geometry', 'OVERLAP', `"${rooms[i].room.name}" and "${rooms[j].room.name}" overlap by ${Math.round(overlap)} sq ft on ${floorName(cells[i].floor)}.`);
      }
    }
  }

  // ---------- 4. Spatial relationships and circulation ----------
  const isCanonical = (design.schemaVersion || 1) >= 2;
  if (!isCanonical) {
    warnings.push('This design predates the canonical schema; door, adjacency and circulation checks were skipped.');
  } else {
    const doors = (design.openings || []).filter((op) => (op.connects || []).length === 2);
    const hasDoor = (a: string, b: string) => doors.some((op) => op.connects!.includes(a) && op.connects!.includes(b));
    const adjacent = (a: string, b: string) => {
      const ca = cellById.get(a);
      const cb = cellById.get(b);
      if (!ca || !cb || ca.floor !== cb.floor) return false;
      const edge = sharedEdge(ca.rect, cb.rect);
      return !!edge && edge.length >= 2.5;
    };
    const nameOf = (id: string) => design.rooms.find((room) => room.id === id)?.name || id;

    for (const { room } of rooms) {
      if (room.attachedTo) {
        if (!cellById.has(room.attachedTo)) fail('spatial', 'ATTACH_TARGET', `${room.name} is attached to a room that does not exist.`);
        else if (!adjacent(room.id, room.attachedTo)) fail('spatial', 'NOT_ATTACHED', `${room.name} must be attached to ${nameOf(room.attachedTo)} but they do not share a wall.`);
        else if (!hasDoor(room.id, room.attachedTo)) fail('spatial', 'NO_ATTACH_DOOR', `${room.name} is attached to ${nameOf(room.attachedTo)} but there is no door between them.`);
      }
      for (const rel of room.relationships || []) {
        if (!cellById.has(rel.target)) continue;
        if (['ADJACENT_TO', 'CONNECTED_TO', 'ATTACHED_TO'].includes(rel.type) && !adjacent(room.id, rel.target)) {
          warnings.push(`Requested relationship not achieved: ${room.name} ${rel.type.replace(/_/g, ' ').toLowerCase()} ${nameOf(rel.target)}.`);
        }
        if (rel.type === 'PRIVATE_FROM' && hasDoor(room.id, rel.target)) {
          warnings.push(`${room.name} opens directly onto ${nameOf(rel.target)} although privacy between them was requested.`);
        }
      }
    }

    // Stairs must exist on every floor and line up vertically.
    if (floorsCount > 1) {
      const stairCells = cells.filter((cell) => cell.type === 'stair');
      for (let level = 0; level < floorsCount; level++) {
        if (!stairCells.some((cell) => cell.floor === level)) fail('spatial', 'NO_STAIR', `${floorName(level)} has no staircase, so the floors are not connected.`);
      }
      const base = stairCells.find((cell) => cell.floor === 0);
      if (base && stairCells.some((cell) => Math.abs(cell.rect.x - base.rect.x) > 0.3 || Math.abs(cell.rect.y - base.rect.y) > 0.3 || Math.abs(cell.rect.w - base.rect.w) > 0.3 || Math.abs(cell.rect.d - base.rect.d) > 0.3)) {
        fail('spatial', 'STAIR_MISALIGNED', 'The staircase is not in the same position on every floor.');
      }
    }

    // Every room must be reachable on foot without crossing a bedroom or bathroom.
    for (let level = 0; level < floorsCount; level++) {
      const floorRooms = rooms.filter((entry) => entry.floor === level && entry.type !== 'void' && entry.type !== 'parking');
      if (!floorRooms.length) continue;
      const typeOf = new Map(floorRooms.map((entry) => [entry.room.id, entry.type]));
      const root = level === 0
        ? floorRooms.find((entry) => entry.type === 'entrance') || floorRooms.find((entry) => entry.type === 'living')
        : floorRooms.find((entry) => entry.type === 'stair');
      if (!root) {
        fail('spatial', 'NO_ENTRY_POINT', `${floorName(level)} has no ${level === 0 ? 'entrance or living room' : 'staircase'} to enter from.`);
        continue;
      }
      const reached = new Set<string>([root.room.id]);
      const queue = [root.room.id];
      const openAir = (type?: RoomType) => !!type && ['courtyard', 'terrace', 'balcony'].includes(type);
      while (queue.length) {
        const id = queue.shift()!;
        const fromType = typeOf.get(id)!;
        // Doors, plus open-air spaces that simply run into each other (no wall between them).
        const neighbours = doors.filter((door) => (door.floorLevel || 0) === level && door.connects!.includes(id)).map((door) => door.connects!.find((other) => other !== id)!);
        if (openAir(fromType)) floorRooms.filter((entry) => openAir(entry.type) && adjacent(id, entry.room.id)).forEach((entry) => neighbours.push(entry.room.id));
        for (const next of neighbours) {
          const nextType = typeOf.get(next);
          if (!nextType || reached.has(next)) continue;
          const passable = !!ROOM_TYPE_SPECS[fromType].hubPriority || ((isBedroomType(fromType) || fromType === 'guest_room') && PRIVATE_OFF_BEDROOM.includes(nextType));
          if (!passable) continue;
          reached.add(next);
          queue.push(next);
        }
      }
      for (const entry of floorRooms) {
        if (reached.has(entry.room.id)) continue;
        const message = `${entry.room.name} on ${floorName(level)} cannot be reached from the ${level === 0 ? 'entrance' : 'staircase'} without passing through a private room.`;
        if (entry.room.derived && OPEN_TYPES.includes(entry.type)) warnings.push(message);
        else fail('spatial', 'UNREACHABLE', message);
      }
    }

    if (!(design.openings || []).some((op) => op.isExterior && op.type === 'door' && (op.floorLevel || 0) === 0)) {
      fail('spatial', 'NO_MAIN_DOOR', 'The ground floor has no main entrance door.');
    }
    const openToAir = (id: string) => (design.openings || []).some((op) => (op.type === 'window' || op.type === 'sliding_glass') && (op.connects || []).includes(id));
    for (const { room, type } of rooms) {
      if (!ROOM_TYPE_SPECS[type].habitable || openToAir(room.id)) continue;
      // An open-plan room may borrow light through a wide opening from a neighbour that has windows.
      const arches = (design.openings || []).filter((op) => op.type === 'archway' && (op.connects || []).length === 2);
      const openPlan = (id: string) => arches.filter((op) => op.connects!.includes(id)).map((op) => op.connects!.find((other) => other !== id)!);
      // Directly, or across one open hall or passage in between.
      const borrows = openPlan(room.id).some((next) => openToAir(next) || openPlan(next).some((beyond) => beyond !== room.id && openToAir(beyond)));
      if (borrows) warnings.push(`${room.name} has no external wall; it borrows daylight through its opening to the adjoining room.`);
      else fail('spatial', 'NO_DAYLIGHT', `${room.name} has no window and no open connection to a room with daylight.`);
    }
  }

  // ---------- 5. Feasibility ----------
  if (setbacks) {
    const envelopeArea = (plotWidth - setbacks.left - setbacks.right) * (plotDepth - setbacks.front - setbacks.rear);
    for (let level = 0; level < floorsCount; level++) {
      const used = cells.filter((cell) => cell.floor === level && cell.type !== 'void').reduce((sum, cell) => sum + cell.rect.w * cell.rect.d, 0);
      if (used > envelopeArea * 1.01) fail('feasibility', 'OVER_ENVELOPE', `${floorName(level)} uses ${Math.round(used)} sq ft but the buildable envelope is ${Math.round(envelopeArea)} sq ft.`);
    }
  } else {
    const builtUp = cells.filter((cell) => !OPEN_TYPES.includes(cell.type)).reduce((sum, cell) => sum + cell.rect.w * cell.rect.d, 0);
    if (builtUp > plotWidth * plotDepth * floorsCount * 0.85) warnings.push(`Total built-up area (${Math.round(builtUp)} sq ft) exceeds 85% of the plot per floor.`);
  }

  return finish();
}
