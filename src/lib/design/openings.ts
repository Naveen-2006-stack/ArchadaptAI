import { FloorPlanOpening, RoomRelationship, RoomType, SpecialMode } from '@/types/architectural';
import { ExteriorSegment, PlanCell, exteriorSegments, planCompass, round2, sharedEdge } from '@/lib/geometry/planGeometry';
import { ROOM_TYPE_SPECS, isBedroomType } from './roomTypes';

export interface OpeningCell extends PlanCell {
  name: string;
  attachedTo?: string;
  relationships?: RoomRelationship[];
}

export interface SolvedOpening {
  id: string;
  type: FloorPlanOpening['type'];
  xFt: number;
  yFt: number;
  widthFt: number;
  orientation: 'horizontal' | 'vertical';
  floorLevel: number;
  connects: string[];
  label: string;
  swingDirection?: FloorPlanOpening['swingDirection'];
  isExterior: boolean;
}

export interface OpeningSolution {
  openings: SolvedOpening[];
  connections: Map<string, Set<string>>;
  features: Map<string, string[]>;
  unreachable: string[];
  notes: string[];
}

/** Rooms a bedroom may give private access to. */
const PRIVATE_OFF_BEDROOM: RoomType[] = ['bathroom', 'dressing', 'balcony', 'terrace'];
/** Never part of the walking graph. */
const NOT_ROOMS: RoomType[] = ['void', 'parking'];
const OPEN_PLAN_PAIRS: [RoomType, RoomType][] = [
  ['living', 'dining'], ['living', 'lounge'], ['lounge', 'stair'], ['living', 'stair'], ['dining', 'stair'],
  ['passage', 'living'], ['passage', 'dining'], ['passage', 'lounge'], ['passage', 'stair'], ['passage', 'passage']
];
const OUTDOOR: RoomType[] = ['courtyard', 'terrace', 'balcony'];
/** Compass preference for openings in warm climates: lower is cooler / better. */
const COMPASS_HEAT: Record<string, number> = { N: 0, NE: 0, E: 1, NW: 2, SE: 2, S: 3, W: 5, SW: 5 };

const hubPriority = (type: RoomType) => ROOM_TYPE_SPECS[type].hubPriority;
const pairIs = (a: RoomType, b: RoomType, list: [RoomType, RoomType][]) => list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/**
 * Derives doors, openings and windows from the placed rooms.
 * Doors follow the declared relationships first, then a reachability pass guarantees every room can
 * be walked to from the entrance (or the stair, on upper floors) without crossing a bedroom or bathroom.
 */
export function solveOpenings(
  cells: OpeningCell[],
  context: { floors: number; orientation: string; modes: SpecialMode[] }
): OpeningSolution {
  const openings: SolvedOpening[] = [];
  const connections = new Map<string, Set<string>>();
  const features = new Map<string, string[]>();
  const unreachable: string[] = [];
  const notes: string[] = [];
  const lifeStage = context.modes.includes('life_stage');
  const climate = context.modes.includes('climate_adaptive');
  const compass = planCompass(context.orientation);
  let counter = 0;

  const addFeature = (id: string, text: string) => features.set(id, [...(features.get(id) || []), text]);
  const link = (a: string, b: string) => {
    connections.set(a, (connections.get(a) || new Set()).add(b));
    connections.set(b, (connections.get(b) || new Set()).add(a));
  };

  for (let floor = 0; floor < context.floors; floor++) {
    const floorCells = cells.filter((cell) => cell.floor === floor);
    const walkable = floorCells.filter((cell) => !NOT_ROOMS.includes(cell.type));
    const byId = new Map(floorCells.map((cell) => [cell.id, cell]));
    const doorPairs = new Set<string>();
    const usedWallSpots: { orientation: string; at: number; pos: number }[] = [];

    const addDoor = (a: OpeningCell, b: OpeningCell): boolean => {
      const key = [a.id, b.id].sort().join('|');
      if (doorPairs.has(key)) return true;
      const edge = sharedEdge(a.rect, b.rect);
      if (!edge || edge.length < 2.5) return false;
      if (OUTDOOR.includes(a.type) && OUTDOOR.includes(b.type)) {
        // Two open-air spaces simply run into each other: there is no wall to put a door in.
        doorPairs.add(key);
        link(a.id, b.id);
        return true;
      }
      const outdoor = OUTDOOR.includes(a.type) || OUTDOOR.includes(b.type);
      const bath = a.type === 'bathroom' || b.type === 'bathroom';
      const type: SolvedOpening['type'] = outdoor ? 'sliding_glass' : pairIs(a.type, b.type, OPEN_PLAN_PAIRS) ? 'archway' : 'door';
      const wanted = type === 'sliding_glass' ? 5 : type === 'archway' ? 4 : bath ? (lifeStage ? 3 : 2.5) : lifeStage ? 3.5 : 3;
      const widthFt = round2(Math.min(wanted, edge.length - 0.5));
      openings.push({
        id: `op-${type === 'door' ? 'door' : type === 'archway' ? 'arch' : 'slide'}-${++counter}`,
        type,
        xFt: round2(edge.midX),
        yFt: round2(edge.midY),
        widthFt,
        orientation: edge.orientation,
        floorLevel: floor,
        connects: [a.id, b.id],
        label: `${a.name} ↔ ${b.name}`,
        swingDirection: type === 'door' ? 'inward_left' : type === 'sliding_glass' ? 'sliding' : undefined,
        isExterior: false
      });
      usedWallSpots.push({ orientation: edge.orientation, at: edge.at, pos: edge.orientation === 'horizontal' ? edge.midX : edge.midY });
      doorPairs.add(key);
      link(a.id, b.id);
      return true;
    };

    // 1. Doors the programme asks for: attachments and explicit connections.
    const privateLeaf = new Set<string>();
    for (const cell of walkable) {
      const anchor = cell.attachedTo ? byId.get(cell.attachedTo) : undefined;
      if (anchor && !NOT_ROOMS.includes(anchor.type)) {
        if (addDoor(anchor, cell)) {
          if (['bathroom', 'dressing', 'utility'].includes(cell.type)) privateLeaf.add(cell.id);
        } else {
          notes.push(`"${cell.name}" does not share enough wall with "${anchor.name}" for a door.`);
        }
      }
    }
    for (const cell of walkable) {
      for (const rel of cell.relationships || []) {
        if (rel.type !== 'CONNECTED_TO' && rel.type !== 'ACCESSIBLE_FROM') continue;
        const other = byId.get(rel.target);
        if (!other || NOT_ROOMS.includes(other.type) || privateLeaf.has(cell.id) || privateLeaf.has(other.id)) continue;
        // A requested connection between two sleeping/wet rooms would break privacy; leave it to the reachability pass.
        if (!hubPriority(cell.type) && !hubPriority(other.type)) continue;
        addDoor(cell, other);
      }
    }

    // 2. Reachability: grow the walking graph from the entry point through circulation rooms only.
    const root = floor === 0
      ? walkable.find((cell) => cell.type === 'entrance') || walkable.find((cell) => cell.type === 'living') || walkable[0]
      : walkable.find((cell) => cell.type === 'stair') || walkable[0];
    const reached = new Set<string>();
    const canPassThrough = (from: OpeningCell, to: OpeningCell) =>
      !!hubPriority(from.type) || ((isBedroomType(from.type) || from.type === 'guest_room') && PRIVATE_OFF_BEDROOM.includes(to.type));
    const flood = () => {
      let grew = true;
      while (grew) {
        grew = false;
        for (const id of Array.from(reached)) {
          const from = byId.get(id)!;
          for (const nextId of Array.from(connections.get(id) || [])) {
            const next = byId.get(nextId);
            if (!next || reached.has(nextId) || !canPassThrough(from, next)) continue;
            reached.add(nextId);
            grew = true;
          }
        }
      }
    };
    if (root) {
      reached.add(root.id);
      flood();
      for (let guard = 0; guard < walkable.length * 2; guard++) {
        let best: { from: OpeningCell; to: OpeningCell; score: number } | null = null;
        for (const to of walkable) {
          if (reached.has(to.id) || privateLeaf.has(to.id)) continue; // ensuites open only off their own room
          for (const from of walkable) {
            if (!reached.has(from.id) || !canPassThrough(from, to)) continue;
            const edge = sharedEdge(from.rect, to.rect);
            if (!edge || edge.length < 2.5) continue;
            let score = hubPriority(from.type) || 8;
            if (from.type === 'kitchen' && to.type !== 'utility' && to.type !== 'store') score += 6; // avoid walking through the kitchen
            if (to.type === 'bathroom' && (from.type === 'living' || from.type === 'dining')) score += 3; // prefer a passage or lobby
            if (to.type === 'kitchen' && from.type === 'living') score += 2; // the kitchen opens off the dining room where it can
            if ((isBedroomType(to.type) || to.type === 'guest_room') && from.type === 'living') score += 1.5;
            if (from.type === 'entrance' && to.type !== 'living' && to.type !== 'lounge') score += 3;
            if (OUTDOOR.includes(from.type)) score += 4;
            if (hubPriority(to.type)) score -= 0.5; // open up circulation first
            if (!best || score < best.score) best = { from, to, score };
          }
        }
        if (!best) break;
        addDoor(best.from, best.to);
        reached.add(best.to.id);
        flood();
      }
    }
    walkable.filter((cell) => !reached.has(cell.id)).forEach((cell) => unreachable.push(cell.id));

    // 3. Main entrance door (ground floor): the door from the entrance porch into the house, or,
    //    without a porch, a door in the entry room's outside wall.
    if (floor === 0 && root) {
      const porchDoor = root.type === 'entrance' ? openings.find((op) => op.floorLevel === 0 && op.connects.includes(root.id) && op.connects.length === 2) : undefined;
      if (porchDoor) {
        porchDoor.id = 'op-main';
        porchDoor.type = 'door';
        porchDoor.label = 'Main Entrance';
        porchDoor.isExterior = true;
        porchDoor.swingDirection = 'inward_left';
        porchDoor.widthFt = lifeStage ? 4 : 3.5;
        if (lifeStage) addFeature(root.id, 'Step-free 4 ft wide main entrance');
      } else {
        const ext = exteriorSegments(root, floorCells).filter((seg) => !seg.facesOpenSpace && seg.length >= 3.5);
        const front = ext.filter((seg) => seg.side === 'front').sort((x, y) => y.length - x.length)[0] || ext.sort((x, y) => y.length - x.length)[0];
        if (front) {
          const mid = (front.start + front.end) / 2;
          openings.push({
            id: 'op-main', type: 'door',
            xFt: round2(front.orientation === 'horizontal' ? mid : front.at),
            yFt: round2(front.orientation === 'horizontal' ? front.at : mid),
            widthFt: lifeStage ? 4 : 3.5, orientation: front.orientation, floorLevel: 0, connects: [root.id],
            label: 'Main Entrance', swingDirection: 'inward_left', isExterior: true
          });
          usedWallSpots.push({ orientation: front.orientation, at: front.at, pos: mid });
          if (lifeStage) addFeature(root.id, 'Step-free 4 ft wide main entrance');
        } else {
          notes.push('The entry room has no external wall for a main door.');
        }
      }
    }

    // 4. Windows on walls that face outside air.
    for (const cell of walkable) {
      const typeSpec = ROOM_TYPE_SPECS[cell.type];
      const wantsLight = typeSpec.habitable || cell.type === 'bathroom' || cell.type === 'stair';
      if (!wantsLight) continue;
      const free = (seg: ExteriorSegment) => !usedWallSpots.some((spot) => spot.orientation === seg.orientation && Math.abs(spot.at - seg.at) < 0.1 && spot.pos > seg.start && spot.pos < seg.end);
      const candidates = exteriorSegments(cell, floorCells).filter((seg) => seg.length >= 3 && free(seg));
      if (!candidates.length) continue; // reported by validation
      const heat = (seg: ExteriorSegment) => COMPASS_HEAT[compass[seg.side]] ?? 2;
      candidates.sort((a, b) => (climate ? heat(a) - heat(b) : 0) || b.length - a.length);
      const sidesUsed = new Set<string>();
      const wantedCount = !typeSpec.habitable ? 1 : climate || cell.type === 'living' ? 2 : 1;
      for (const seg of candidates) {
        if (sidesUsed.size >= wantedCount) break;
        if (sidesUsed.has(seg.side)) continue;
        sidesUsed.add(seg.side);
        const hot = climate && heat(seg) >= 5;
        const base = cell.type === 'bathroom' ? 2 : cell.type === 'living' ? 6 : cell.type === 'kitchen' || cell.type === 'stair' ? 3.5 : 4;
        const widthFt = round2(Math.min(hot ? Math.min(base, 2.5) : base, seg.length - 1));
        const mid = (seg.start + seg.end) / 2;
        const direction = compass[seg.side];
        openings.push({
          id: `op-win-${++counter}`, type: 'window',
          xFt: round2(seg.orientation === 'horizontal' ? mid : seg.at),
          yFt: round2(seg.orientation === 'horizontal' ? seg.at : mid),
          widthFt, orientation: seg.orientation, floorLevel: floor, connects: [cell.id],
          label: cell.type === 'bathroom' ? `${cell.name} ventilator (${direction})` : `${cell.name} window (${direction}${seg.facesOpenSpace ? ', courtyard side' : ''})`,
          isExterior: true
        });
        usedWallSpots.push({ orientation: seg.orientation, at: seg.at, pos: mid });
        if (hot) addFeature(cell.id, `Reduced ${direction} glazing to limit afternoon heat`);
      }
      if (climate && typeSpec.habitable) {
        addFeature(cell.id, sidesUsed.size >= 2 ? 'Cross-ventilated: openings on two sides' : 'Single-aspect room: ventilation relies on one wall');
      }
    }
  }

  return { openings, connections, features, unreachable, notes };
}
