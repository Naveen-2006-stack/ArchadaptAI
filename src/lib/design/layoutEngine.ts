import {
  BuildingFootprint,
  ConceptualFurniture,
  DesignConstraints,
  DesignProgram,
  FloorPlanLevel,
  FloorPlanOpening,
  FloorPlanRoom,
  PlanBand,
  PlanSide,
  ProgramRoom,
  RoomType,
  SiteInfo,
  SiteSetbacks,
  StaircaseDetails,
  StructuredDesignJSON
} from '@/types/architectural';
import { DEFAULT_APPEARANCE_BY_STYLE } from '@/lib/geometry/materials';
import { PlanCell, Rect, deriveWallSegments, round2, wallsToCanonical } from '@/lib/geometry/planGeometry';
import { ROOM_TYPE_SPECS, floorName, isBedroomType } from './roomTypes';
import { solveOpenings } from './openings';

export interface LayoutSuccess {
  ok: true;
  design: StructuredDesignJSON;
  notes: string[];
  unreachable: string[]; // ids of rooms the door solver could not connect
}

export interface LayoutFailure {
  ok: false;
  reason: string;
  violatedConstraints: string[];
}

export type LayoutResult = LayoutSuccess | LayoutFailure;

const BANDS: PlanBand[] = ['front', 'middle', 'rear'];
const SIDE_RANK: Record<PlanSide, number> = { left: 0, center: 1, right: 2 };
const STAIR_WIDTH = 7.5;
const STAIR_MIN_DEPTH = 10;
const MAX_BAND_DEPTH = 80;

interface WorkRoom extends ProgramRoom {
  area: number; // working area after any compression
  derived?: boolean;
  order: number;
}

interface Unit {
  kind: 'major' | 'stack';
  rooms: WorkRoom[]; // major: [major, ...inline rooms]; stack: rooms stacked front-to-rear
  anchor?: WorkRoom;
}

interface PlacedRoom {
  room: WorkRoom;
  rect: Rect;
}

export function defaultSetbacks(plotWidth: number, plotDepth: number): SiteSetbacks {
  return {
    front: plotDepth >= 60 ? 10 : plotDepth >= 40 ? 8 : 5,
    rear: plotDepth >= 60 ? 6 : plotDepth >= 40 ? 5 : 3,
    left: plotWidth >= 50 ? 5 : plotWidth >= 30 ? 4 : 3,
    right: plotWidth >= 50 ? 5 : plotWidth >= 30 ? 4 : 3
  };
}

export function buildableEnvelope(site: SiteInfo) {
  const setbacks = site.setbacks || defaultSetbacks(site.plotWidth, site.plotDepth);
  return {
    setbacks,
    width: site.plotWidth - setbacks.left - setbacks.right,
    depth: site.plotDepth - setbacks.front - setbacks.rear
  };
}

const spec = (room: { type: RoomType }) => ROOM_TYPE_SPECS[room.type];
const isMajor = (room: WorkRoom) => spec(room).placement === 'major' || (!room.attachedTo && room.area >= 45 && spec(room).placement === 'inline_front');
const isHub = (room: WorkRoom) => ['living', 'dining', 'lounge'].includes(room.type);
/** Rooms that cannot borrow daylight through an open-plan connection. */
const needsOwnWindow = (room: WorkRoom) => ['kitchen', 'study', 'bedroom', 'master_bedroom', 'guest_room'].includes(room.type);
const fmtFt = (value: number) => `${Math.round(value * 2) / 2}'`;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

function unitMinWidth(unit: Unit): number {
  if (unit.rooms[0].type === 'stair') return STAIR_WIDTH;
  if (unit.kind === 'stack') return Math.max(...unit.rooms.map((room) => Math.max(spec(room).minSide, 4)));
  return spec(unit.rooms[0]).minSide;
}

function unitMinDepth(unit: Unit): number {
  if (unit.rooms[0].type === 'stair') return STAIR_MIN_DEPTH;
  return sum(unit.rooms.map((room) => spec(room).minSide));
}

function unitWidth(unit: Unit, depth: number): number {
  const major = unit.rooms[0];
  if (major.type === 'stair') return STAIR_WIDTH;
  const area = sum(unit.rooms.map((room) => room.area));
  if (unit.kind === 'major' && major.type === 'parking') {
    // A car needs roughly 9 ft x 15 ft in one orientation or the other.
    return depth >= 15 ? Math.max(area / depth, 9) : Math.max(area / depth, 15);
  }
  return Math.max(area / depth, unitMinWidth(unit));
}

/** Depth at which a unit's main room is comfortably proportioned (slightly deeper than wide). */
function unitPreferredDepth(unit: Unit): number {
  const [major, ...inline] = unit.rooms;
  if (major.type === 'parking') return 17;
  if (major.type === 'stair') return 12;
  return Math.min(19, Math.sqrt(major.area * 1.25) + sum(inline.map((room) => spec(room).minSide)));
}

/** Groups a zone's rooms into side-by-side units: a major room (with anything sharing its column) or a stack of small rooms. */
function buildUnits(rooms: WorkRoom[]): Unit[] {
  // The stair takes one end of its zone so the rooms beside it stay next to each other.
  // The car porch also belongs at an end, so it never separates living, dining and kitchen.
  const rank = (room: WorkRoom) => (room.type === 'stair' ? (room.side === 'left' ? -1 : 3) : room.type === 'parking' ? (room.side === 'left' ? -0.5 : 2.5) : SIDE_RANK[room.side]);
  const majors = rooms.filter(isMajor).sort((a, b) => rank(a) - rank(b) || a.order - b.order);
  // In the circulation zone only the two ends have an outside wall. Rooms that need their own window
  // take the free ends, so living/dining/lounge stay next to each other in between. A courtyard in the
  // zone lights the rooms beside it, so no reordering is needed then.
  if (majors[0]?.band === 'middle' && !majors.some((room) => room.type === 'courtyard')) {
    const stair = majors.find((room) => room.type === 'stair');
    const movable = majors.filter(needsOwnWindow);
    const leftFree = stair?.side !== 'left';
    const rightFree = stair?.side !== 'right';
    // The kitchen keeps to its own side where that end is free; any other such room takes the end left over.
    const kitchen = movable.find((room) => room.type === 'kitchen');
    const others = movable.filter((room) => room !== kitchen);
    let toLeft: WorkRoom | undefined;
    let toRight: WorkRoom | undefined;
    if (kitchen) {
      if ((kitchen.side === 'left' && leftFree) || !rightFree) toLeft = kitchen;
      else toRight = kitchen;
    }
    if (!toRight && rightFree) toRight = others.pop();
    if (!toLeft && leftFree) toLeft = others.shift();
    const middle = majors.filter((room) => room !== toLeft && room !== toRight && room !== stair);
    majors.splice(0, majors.length, ...(stair?.side === 'left' ? [stair] : []), ...(toLeft ? [toLeft] : []), ...middle, ...(toRight ? [toRight] : []), ...(stair?.side === 'right' ? [stair] : []));
  }
  const majorIds = new Set(majors.map((room) => room.id));
  const rest = rooms.filter((room) => !majorIds.has(room.id));
  const inline = rest.filter((room) => spec(room).placement === 'inline_front' && room.attachedTo && majorIds.has(room.attachedTo));
  const inlineIds = new Set(inline.map((room) => room.id));
  const minors = rest.filter((room) => !inlineIds.has(room.id));

  const chunk = (list: WorkRoom[], anchor?: WorkRoom): Unit[] => {
    const stacks: Unit[] = [];
    for (let i = 0; i < list.length; i += 2) stacks.push({ kind: 'stack', rooms: list.slice(i, i + 2), anchor });
    return stacks;
  };

  const units: Unit[] = [];
  majors.forEach((major, index) => {
    const unit: Unit = { kind: 'major', rooms: [major, ...inline.filter((room) => room.attachedTo === major.id)] };
    const stacks = chunk(minors.filter((room) => room.attachedTo === major.id), major);
    // Keep the wet stack on the inner side so the room itself keeps its outside wall.
    if (index > 0 && index === majors.length - 1) units.push(...stacks, unit);
    else units.push(unit, ...stacks);
  });

  // A free-standing small room needs its own way in, so each gets a column reaching the zone's front edge.
  const isFree = (room: WorkRoom) => !room.attachedTo || !majorIds.has(room.attachedTo);
  const unanchored: Unit[] = minors.filter(isFree).map((room) => ({ kind: 'stack', rooms: [room] }));
  if (unanchored.length) {
    // Shared small rooms must not split the circulation rooms apart: beside the stair on its outer
    // side, otherwise at the end away from the kitchen; between bedrooms in a sleeping zone.
    const stair = majors.find((room) => room.type === 'stair');
    const hasHub = majors.some((room) => ['living', 'dining', 'lounge', 'kitchen'].includes(room.type));
    let at = Math.min(1, units.length);
    if (stair) at = stair.side === 'left' ? 0 : units.length;
    else if (hasHub) at = majors[majors.length - 1].type === 'kitchen' ? 0 : units.length;
    units.splice(at, 0, ...unanchored);
  }

  // Two neighbouring single-room stacks share one wet wall.
  for (let i = 0; i < units.length - 1; i++) {
    const a = units[i];
    const b = units[i + 1];
    const free = [a, b].filter((unit) => unit.rooms.some(isFree)).length;
    if (a.kind === 'stack' && b.kind === 'stack' && a.rooms.length + b.rooms.length <= 2 && free < 2) {
      // The free-standing room goes first (front of the zone, where it can be entered); the ensuite sits behind it.
      const ordered = [...a.rooms, ...b.rooms].sort((x, y) => Number(!isFree(x)) - Number(!isFree(y)));
      units.splice(i, 2, { kind: 'stack', rooms: ordered, anchor: a.anchor || b.anchor });
      i--;
    }
  }
  return units;
}

/** Smallest zone depth at which the units fit side by side in the available width. */
function solveBandDepth(units: Unit[], width: number, strip: number, floorDepth: number): number {
  if (!units.length) return floorDepth;
  const lower = Math.max(floorDepth, strip + Math.max(...units.map(unitMinDepth)));
  const widthAt = (depth: number) => sum(units.map((unit) => unitWidth(unit, depth - strip)));
  if (widthAt(lower) <= width + 1e-6) return lower;
  if (widthAt(MAX_BAND_DEPTH) > width + 1e-6) return Infinity;
  let lo = lower;
  let hi = MAX_BAND_DEPTH;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (widthAt(mid) <= width) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Splits an ordered list of units across free segments, keeping order and wasting as little width as possible. */
function partitionUnits(widths: number[], segments: number[], mustFill = -1): number[][] {
  const n = widths.length;
  const k = segments.length;
  let best: { cuts: number[]; cost: number } | null = null;
  const visit = (cuts: number[]) => {
    if (cuts.length === k - 1) {
      const bounds = [0, ...cuts, n];
      let cost = 0;
      for (let s = 0; s < k; s++) {
        const used = sum(widths.slice(bounds[s], bounds[s + 1]));
        cost += Math.max(0, used - segments[s]) * 100 + (bounds[s] === bounds[s + 1] ? (s === mustFill ? 5000 : 40) : 0) + Math.abs(segments[s] - used);
      }
      if (!best || cost < best.cost) best = { cuts: [...cuts], cost };
      return;
    }
    for (let cut = cuts.length ? cuts[cuts.length - 1] : 0; cut <= n; cut++) visit([...cuts, cut]);
  };
  visit([]);
  const bounds = [0, ...best!.cuts, n];
  return segments.map((_, s) => Array.from({ length: bounds[s + 1] - bounds[s] }, (_, i) => bounds[s] + i));
}

/**
 * Deterministic geometry stage. Turns a room program (what rooms, how big, which zone, what must
 * touch what) into non-overlapping rectangles inside the buildable envelope, then derives stairs,
 * doors, windows and walls from that geometry. No randomness and no fixed coordinates: the result
 * is a pure function of the program, the site and the constraints.
 *
 * The plan is organised in three zones from the road to the rear. Zone depths are shared by all
 * floors so walls and the staircase line up vertically; within a zone, rooms sit side by side and
 * small rooms are stacked into shared wet columns next to the room they serve.
 */
export function layoutProgram(program: DesignProgram, site: SiteInfo, constraints: DesignConstraints): LayoutResult {
  // A rear passage costs area, so it is only added where needed. If a room would otherwise be
  // reachable only through another room, lay out again with a passage rather than accept that.
  // Arrangements are tried from the most generous to the leanest; the first that fits is used and
  // every concession is written to the notes. If none fits, the first failure (the full brief) is reported.
  const attempts: { twoZone: boolean; policy: number; lean: boolean; note?: string }[] = [
    { twoZone: false, policy: 0, lean: false },
    { twoZone: true, policy: 0, lean: false, note: 'The buildable depth is too shallow for three zones, so the plan uses two: living, dining and kitchen across the front, bedrooms behind.' },
    { twoZone: false, policy: -1, lean: true, note: 'To fit the plot, rooms the planner marked as optional were left out and the bedroom passage was omitted where two rooms can open off the dining area.' },
    { twoZone: true, policy: -1, lean: true, note: 'To fit the plot, the plan uses two zones, and rooms the planner marked as optional were left out.' }
  ];
  let chosen = attempts[0];
  let result = layoutOnce(program, site, constraints, chosen.policy, chosen.twoZone, chosen.lean);
  const firstFailure = result;
  for (let i = 1; i < attempts.length && !result.ok; i++) {
    const next = layoutOnce(program, site, constraints, attempts[i].policy, attempts[i].twoZone, attempts[i].lean);
    if (next.ok) {
      next.notes.unshift(attempts[i].note!);
      next.design.layoutNotes = next.notes;
      result = next;
      chosen = attempts[i];
    }
  }
  if (!result.ok) return firstFailure;

  // A rear passage costs area, so it is only added where needed. If a room would otherwise be
  // reachable only through another room, lay out again with a passage rather than accept that.
  for (let policy = Math.max(1, chosen.policy + 1); policy <= 3 && result.ok && result.unreachable.length > 0; policy++) {
    const retry = layoutOnce(program, site, constraints, policy, chosen.twoZone, chosen.lean);
    if (!retry.ok) continue;
    if (retry.unreachable.length < result.unreachable.length) {
      retry.notes.unshift(...result.notes.filter((note) => note === chosen.note));
      retry.notes.push('A passage was added so every room can be reached without walking through another room.');
      retry.design.layoutNotes = retry.notes;
      result = retry;
    }
  }
  return result;
}

function layoutOnce(program: DesignProgram, site: SiteInfo, constraints: DesignConstraints, passagePolicy: number, twoZone: boolean, lean = false): LayoutResult {
  /** The zone that carries the stair and runs the full width of the house. */
  const circulationBand: PlanBand = twoZone ? 'front' : 'middle';
  const notes: string[] = [];
  const plotWidth = Number(site.plotWidth);
  const plotDepth = Number(site.plotDepth);
  if (!(plotWidth > 0) || !(plotDepth > 0)) {
    return { ok: false, reason: 'Plot dimensions are missing or invalid.', violatedConstraints: ['site.plotWidth', 'site.plotDepth'] };
  }
  const envelope = buildableEnvelope({ ...site, plotWidth, plotDepth });
  const { setbacks } = envelope;
  const envWidth = envelope.width;
  const envDepth = envelope.depth;
  if (envWidth < 16 || envDepth < 20) {
    return {
      ok: false,
      reason: `After setbacks the buildable envelope is only ${fmtFt(envWidth)} x ${fmtFt(envDepth)}, which is too small for a house.`,
      violatedConstraints: ['Buildable envelope']
    };
  }

  const floors = constraints.floors;
  const multiStorey = floors > 1;
  const lifeStage = constraints.modes.includes('life_stage');
  const budgetFirst = constraints.modes.includes('budget_first');
  const passageDepth = lifeStage ? 4.5 : 3.5;

  // ---- Working copy of the program, plus the rooms only the engine may add ----
  // A lean attempt leaves out rooms the planner marked as not required (and whatever was attached to them).
  const kept = lean ? program.rooms.filter((room) => room.required !== false) : program.rooms;
  const targets: WorkRoom[] = kept.filter((room) => !room.attachedTo || kept.some((other) => other.id === room.attachedTo)).map((room, order) => ({ ...room, area: room.areaSqFt, order }));
  if (twoZone) {
    const publicTypes: RoomType[] = ['living', 'dining', 'lounge', 'kitchen', 'courtyard', 'entrance', 'parking'];
    targets.forEach((room) => { if (room.band === 'middle') room.band = publicTypes.includes(room.type) ? 'front' : 'rear'; });
    targets.forEach((room) => {
      const anchor = room.attachedTo ? targets.find((other) => other.id === room.attachedTo) : undefined;
      if (anchor) room.band = anchor.band;
    });
  }
  let derivedOrder = 1000;
  const derivedRoom = (id: string, name: string, type: RoomType, floor: number, band: PlanBand, side: PlanSide, area: number, features: string[] = []): WorkRoom => ({
    id, name, type, floor, areaSqFt: Math.round(area), area, band, side, required: false, relationships: [], features, derived: true, order: derivedOrder++
  });
  if (multiStorey) {
    // The stair is planned on the ground floor and reserved at the same position on every floor above.
    targets.push(derivedRoom('room-stair-0', 'Staircase', 'stair', 0, circulationBand, program.stairSide, STAIR_WIDTH * 12, ['Dog-legged stair']));
    for (let floor = 0; floor < floors; floor++) {
      const middle = targets.filter((room) => room.floor === floor && room.band === circulationBand && isMajor(room));
      const needsLobby = floor === 0 ? !middle.some((room) => room.type !== 'courtyard' && room.type !== 'stair') : !middle.some(isHub);
      if (needsLobby) {
        targets.push(derivedRoom(`room-lobby-${floor}`, floor === 0 ? 'Stair Lobby' : 'Upper Lobby', 'lounge', floor, circulationBand, 'center', 70, ['Landing connecting the stair to the rooms on this floor']));
      }
    }
  }

  const roomsIn = (floor: number, band: PlanBand) => targets.filter((room) => room.floor === floor && room.band === band);
  const courtyards = targets.filter((room) => room.floor === 0 && room.type === 'courtyard');
  /** Width taken on upper floors by the stair and by voids over ground-floor courtyards. */
  const reservedWidth = (floor: number, band: PlanBand) => {
    if (floor === 0) return 0;
    const stair = multiStorey && band === circulationBand ? STAIR_WIDTH : 0;
    return stair + sum(courtyards.filter((c) => c.band === band).map((c) => Math.max(c.area / 12, spec(c).minSide)));
  };

  // ---- Rebalance: a zone cannot hold more rooms side by side than the envelope is wide ----
  const MOVE_FIRST: RoomType[] = ['study', 'guest_room', 'bedroom', 'lounge', 'master_bedroom', 'dining', 'kitchen'];
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let floor = 0; floor < floors && !moved; floor++) {
      for (const band of BANDS) {
        const here = roomsIn(floor, band);
        const minWidth = sum(buildUnits(here).map(unitMinWidth)) + reservedWidth(floor, band);
        // The circulation zone has outside walls only at its ends, and the end beside the living room is
        // needed for dining, so only the kitchen is planned there; other rooms needing a window move out.
        const windowSeekers = band === 'middle' && !here.some((room) => room.type === 'courtyard') ? here.filter((room) => isMajor(room) && needsOwnWindow(room)) : [];
        if (windowSeekers.length > 1) {
          const extra = windowSeekers.filter((room) => room.type !== 'kitchen').sort((a, b) => MOVE_FIRST.indexOf(a.type) - MOVE_FIRST.indexOf(b.type) || b.order - a.order)[0];
          const loadOf = (other: PlanBand) => sum(buildUnits(roomsIn(floor, other)).map(unitMinWidth)) + reservedWidth(floor, other);
          const target = (['rear', 'front'] as PlanBand[]).filter((other) => other !== band).sort((a, b) => loadOf(a) - loadOf(b))[0];
          if (extra && target && loadOf(target) + spec(extra).minSide + 4.5 <= envWidth) {
            targets.filter((room) => room.id === extra.id || room.attachedTo === extra.id).forEach((room) => { room.band = target; });
            notes.push(`"${extra.name}" was placed in the ${target} zone of the ${floorName(floor).toLowerCase()} so it has an outside wall for a window.`);
            moved = true;
            break;
          }
        }
        if (minWidth <= envWidth) continue;

        const majorIds = new Set(here.filter(isMajor).map((room) => room.id));
        // Free-standing small rooms move first, then whole rooms in order of how little they belong here.
        const movable = here.filter((room) => !isMajor(room) && !room.derived && (!room.attachedTo || !majorIds.has(room.attachedTo)))[0]
          || here.filter((room) => isMajor(room) && MOVE_FIRST.includes(room.type) && !room.derived)
            .sort((a, b) => MOVE_FIRST.indexOf(a.type) - MOVE_FIRST.indexOf(b.type) || b.order - a.order)[0];
        if (!movable) continue;
        const load = (other: PlanBand) => sum(buildUnits(roomsIn(floor, other)).map(unitMinWidth)) + reservedWidth(floor, other);
        const destination = BANDS.filter((other) => Math.abs(BANDS.indexOf(other) - BANDS.indexOf(band)) === 1).sort((a, b) => load(a) - load(b))[0];
        if (load(destination) + spec(movable).minSide > envWidth) continue;
        targets.filter((room) => room.id === movable.id || room.attachedTo === movable.id).forEach((room) => { room.band = destination; });
        notes.push(`"${movable.name}" was placed in the ${destination} zone of the ${floorName(floor).toLowerCase()} because the ${band} zone cannot hold that many rooms side by side on a ${fmtFt(envWidth)} wide envelope.`);
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }

  // ---- Zone depths ----
  const stripFor = (floor: number, band: PlanBand) => {
    const majors = roomsIn(floor, band).filter(isMajor).length;
    // Last resort: a hall across the front of the circulation zone, on every floor so the stair lines up.
    if (band === 'middle') return passagePolicy >= 3 && targets.some((room) => room.band === 'middle' && isMajor(room)) ? passageDepth : 0;
    if (band !== 'rear') return 0;
    if (majors >= 3 || (majors >= 1 && passagePolicy >= 2)) return passageDepth;
    if (majors === 2 && passagePolicy >= 0 && (!budgetFirst || passagePolicy >= 1)) return passageDepth;
    return 0;
  };
  const applyCompression = (s: number) => {
    targets.forEach((room) => {
      const min = spec(room).minArea;
      const target = Math.max(min, room.areaSqFt);
      room.area = min + (target - min) * s;
    });
  };
  /** Minimum depth per zone at which every floor's rooms fit across the envelope width. */
  const fitDepths = (): Record<PlanBand, number> => {
    const depths = { front: 0, middle: 0, rear: 0 } as Record<PlanBand, number>;
    for (const band of BANDS) {
      for (let floor = 0; floor < floors; floor++) {
        const available = envWidth - reservedWidth(floor, band);
        const floorMin = multiStorey && band === circulationBand ? STAIR_MIN_DEPTH : 0;
        if (available <= 0) return { front: Infinity, middle: Infinity, rear: Infinity };
        depths[band] = Math.max(depths[band], solveBandDepth(buildUnits(roomsIn(floor, band)), available, stripFor(floor, band), floorMin));
      }
    }
    return depths;
  };
  const totalOf = (d: Record<PlanBand, number>) => d.front + d.middle + d.rear;

  applyCompression(1);
  if (totalOf(fitDepths()) > envDepth + 1e-6) {
    // Targets do not fit: shrink rooms toward their minimum usable size, never below it.
    applyCompression(0);
    const needDepth = totalOf(fitDepths());
    if (needDepth > envDepth + 1e-6) {
      const perFloor = Array.from({ length: floors }, (_, floor) => Math.round(sum(targets.filter((room) => room.floor === floor).map((room) => spec(room).minArea))));
      return {
        ok: false,
        reason: `The requested rooms cannot fit on this plot with a zoned layout. Even at minimum room sizes the layout needs ${Number.isFinite(needDepth) ? `${Math.ceil(needDepth)} ft of depth` : 'more width than is available'}, but the buildable envelope is ${fmtFt(envWidth)} wide x ${fmtFt(envDepth)} deep (${Math.round(envWidth * envDepth)} sq ft per floor; the fullest floor needs at least ${Math.max(...perFloor)} sq ft of rooms plus circulation).`,
        violatedConstraints: [
          `Buildable envelope ${fmtFt(envWidth)} x ${fmtFt(envDepth)} after setbacks`,
          `${constraints.bedrooms} bedroom(s), ${constraints.bathrooms} bathroom(s) on ${floors} floor(s)`
        ]
      };
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      applyCompression(mid);
      if (totalOf(fitDepths()) <= envDepth) lo = mid;
      else hi = mid;
    }
    applyCompression(lo);
    const reduction = Math.round((1 - sum(targets.map((room) => room.area)) / sum(targets.map((room) => Math.max(spec(room).minArea, room.areaSqFt)))) * 100);
    notes.push(`Target room sizes were reduced by about ${reduction}% overall so the programme fits the ${fmtFt(envWidth)} x ${fmtFt(envDepth)} buildable envelope. No room is below its minimum usable size.`);
  }

  // Deepen zones toward comfortable room proportions while the plot depth allows it.
  const depths = fitDepths();
  const slack = envDepth - totalOf(depths);
  const wish = { front: 0, middle: 0, rear: 0 } as Record<PlanBand, number>;
  for (const band of BANDS) {
    const majorUnits = Array.from({ length: floors }, (_, floor) => buildUnits(roomsIn(floor, band)).filter((unit) => unit.kind === 'major')).flat();
    if (!majorUnits.length) continue;
    const weights = majorUnits.map((unit) => sum(unit.rooms.map((room) => room.area)));
    const preferred = sum(majorUnits.map((unit, i) => unitPreferredDepth(unit) * weights[i])) / sum(weights) + Math.max(...Array.from({ length: floors }, (_, floor) => stripFor(floor, band)));
    wish[band] = Math.max(0, preferred - depths[band]);
  }
  const lambda = totalOf(wish) > 0 ? Math.min(1, Math.max(0, slack) / totalOf(wish)) : 0;
  for (const band of BANDS) depths[band] += wish[band] * lambda;

  // ---- Widths: the circulation zone runs the full width; front and rear zones may be narrower ----
  const naturalWidth = (floor: number, band: PlanBand) => {
    const units = buildUnits(roomsIn(floor, band));
    if (!units.length) return 0;
    return sum(units.map((unit) => unitWidth(unit, depths[band] - stripFor(floor, band)))) + reservedWidth(floor, band);
  };
  const footprintWidth = Math.min(envWidth, Math.max(18, Math.ceil(Math.max(...BANDS.flatMap((band) => Array.from({ length: floors }, (_, floor) => naturalWidth(floor, band)))) * 2) / 2));
  const bandRange = {} as Record<PlanBand, [number, number]>;
  for (const band of BANDS) {
    let extent = Math.max(...Array.from({ length: floors }, (_, floor) => naturalWidth(floor, band)));
    const hasReserved = Array.from({ length: floors }, (_, floor) => reservedWidth(floor, band)).some((w) => w > 0);
    if (band === circulationBand || hasReserved || footprintWidth - extent < 4) extent = footprintWidth;
    extent = Math.min(extent, footprintWidth);
    const reference = Array.from({ length: floors }, (_, floor) => roomsIn(floor, band).filter(isMajor)).find((list) => list.length) || [];
    const alignRight = reference.filter((room) => room.side === 'right').length > reference.filter((room) => room.side === 'left').length;
    bandRange[band] = alignRight ? [footprintWidth - extent, footprintWidth] : [0, extent];
  }

  const originX = setbacks.left + (envWidth - footprintWidth) / 2;
  const originY = setbacks.front;
  const bandY: Record<PlanBand, number> = { front: 0, middle: depths.front, rear: depths.front + depths.middle };

  // ---- Place every floor ----
  const placed: PlacedRoom[] = [];
  const reservedBlocks: { band: PlanBand; rect: Rect; kind: 'stair' | 'void'; name: string }[] = [];
  let stairRect: Rect | null = null;
  let derivedCount = 0;
  const addDerived = (type: RoomType, name: string, floor: number, band: PlanBand, rect: Rect, extra: Partial<WorkRoom> = {}) => {
    if (rect.w < 0.5 || rect.d < 0.5) return;
    placed.push({ room: { ...derivedRoom(`room-${type}-${floor}-${++derivedCount}`, name, type, floor, band, 'center', rect.w * rect.d), ...extra }, rect });
  };

  const sleeps = (room?: WorkRoom) => !!room && (isBedroomType(room.type) || room.type === 'guest_room');
  const placeUnit = (unit: Unit, floor: number, band: PlanBand, x: number, y: number, width: number, depth: number, neighbours: (WorkRoom | undefined)[] = []) => {
    if (unit.kind === 'major') {
      const [major, ...inline] = unit.rooms;
      let remaining = depth;
      let cursorTop = y;
      let cursorBottom = y + depth;
      for (const room of inline) {
        const roomDepth = Math.min(Math.max(room.area / width, spec(room).minSide), (depth * 0.4) / inline.length);
        // Entrances and balconies face the road; service rooms and rear sit-outs face the back.
        const atFront = band !== 'rear' && room.type !== 'utility' && room.type !== 'store';
        if (atFront) {
          placed.push({ room, rect: { x, y: cursorTop, w: width, d: roomDepth } });
          cursorTop += roomDepth;
        } else {
          cursorBottom -= roomDepth;
          placed.push({ room, rect: { x, y: cursorBottom, w: width, d: roomDepth } });
        }
        remaining -= roomDepth;
      }
      placed.push({ room: major, rect: { x, y: cursorTop, w: width, d: remaining } });
      return;
    }

    const total = sum(unit.rooms.map((room) => room.area));
    let roomDepths = unit.rooms.map((room) => (depth * room.area) / total);
    let fillerDepth = 0;
    // Leftover depth behind a lone small room becomes a dressing area, but only for a bedroom that can open onto it.
    const dressingOwner = sleeps(unit.anchor) ? unit.anchor : neighbours.find(sleeps);
    if (unit.rooms.length === 1 && dressingOwner) {
      const natural = Math.max(unit.rooms[0].area / width, spec(unit.rooms[0]).minSide);
      if (depth / width > 2.2 && depth - natural >= 3) {
        fillerDepth = depth - natural;
        roomDepths = [natural];
      }
    } else {
      unit.rooms.forEach((room, index) => {
        const shortfall = spec(room).minSide - roomDepths[index];
        if (shortfall > 0) {
          const donor = roomDepths.indexOf(Math.max(...roomDepths));
          roomDepths[donor] -= shortfall;
          roomDepths[index] += shortfall;
        }
      });
    }
    // Real rooms take the end nearest the circulation zone; any filler goes behind them.
    let cursor = y;
    unit.rooms.forEach((room, index) => {
      placed.push({ room, rect: { x, y: cursor, w: width, d: roomDepths[index] } });
      cursor += roomDepths[index];
    });
    if (fillerDepth > 0 && dressingOwner) {
      addDerived('dressing', 'Dressing', floor, band, { x, y: cursor, w: width, d: fillerDepth }, { attachedTo: dressingOwner.id });
    }
  };

  for (let floor = 0; floor < floors; floor++) {
    for (const band of BANDS) {
      const depth = depths[band];
      if (depth <= 0) continue;
      const units = buildUnits(roomsIn(floor, band));
      const strip = units.length ? stripFor(floor, band) : 0;
      const effDepth = depth - strip;
      const y0 = bandY[band];
      const [rangeStart, rangeEnd] = bandRange[band];

      // Upper floors: the stair and courtyard voids keep the positions fixed on the ground floor.
      const blocks = floor > 0 ? reservedBlocks.filter((block) => block.band === band).sort((a, b) => a.rect.x - b.rect.x) : [];
      for (const block of blocks) {
        if (block.kind === 'stair') placed.push({ room: derivedRoom(`room-stair-${floor}`, 'Stair Landing', 'stair', floor, band, program.stairSide, block.rect.w * block.rect.d, ['Dog-legged stair']), rect: { ...block.rect } });
        else addDerived('void', `Open to ${block.name} Below`, floor, band, { ...block.rect });
      }
      const segments: [number, number][] = [];
      let cursor = rangeStart;
      for (const block of blocks) {
        if (block.rect.x - cursor > 0.5) segments.push([cursor, block.rect.x]);
        cursor = Math.max(cursor, block.rect.x + block.rect.w);
      }
      if (rangeEnd - cursor > 0.5) segments.push([cursor, rangeEnd]);

      if (!units.length) {
        // Nothing planned here on this floor: upstairs it is roof terrace over the room below.
        if (floor > 0) segments.forEach(([start, end]) => addDerived('terrace', 'Open Terrace', floor, band, { x: start, y: y0, w: end - start, d: depth }));
        continue;
      }
      if (!segments.length) continue;

      const natural = units.map((unit) => unitWidth(unit, effDepth));
      // The landing room must sit against the stair, so the segment touching the stair is filled first.
      const stairBlock = blocks.find((block) => block.kind === 'stair');
      const touchesStair = ([start, end]: [number, number]) => !!stairBlock && (Math.abs(start - (stairBlock.rect.x + stairBlock.rect.w)) < 0.1 || Math.abs(end - stairBlock.rect.x) < 0.1);
      const besideStair = segments.reduce((best, seg, index) => (touchesStair(seg) && (best < 0 || seg[1] - seg[0] > segments[best][1] - segments[best][0]) ? index : best), -1);
      const assignment = segments.length === 1 ? [units.map((_, i) => i)] : partitionUnits(natural, segments.map(([start, end]) => end - start), besideStair);
      const alignRight = rangeStart > 0.01;
      let occupiedStart = Infinity;
      let occupiedEnd = -Infinity;

      segments.forEach(([segStart, segEnd], index) => {
        const indices = assignment[index];
        const segWidth = segEnd - segStart;
        if (!indices.length) {
          if (floor > 0) addDerived('terrace', 'Open Terrace', floor, band, { x: segStart, y: y0, w: segWidth, d: depth });
          return;
        }
        const widths = indices.map((i) => natural[i]);
        const used = sum(widths);
        const majorUsed = sum(indices.map((i, j) => (units[i].kind === 'major' && units[i].rooms[0].type !== 'stair' ? widths[j] : 0)));
        const leftover = segWidth - used;
        // Ground floors are built out to carry the floor above; upstairs a real leftover becomes terrace.
        const fill = floor === 0 || leftover < 4 || (band === circulationBand && majorUsed > 0);
        // Ground rooms may grow to carry the floor above, but not beyond 1.6x; the rest stays an open, covered sit-out.
        const stretchLimit = floor === 0 && band !== circulationBand && majorUsed > 0 && leftover > majorUsed * 0.6 ? majorUsed * 0.6 : leftover;
        let final = widths;
        if (used > segWidth) final = widths.map((w) => (w * segWidth) / used);
        else if (fill && majorUsed > 0) final = widths.map((w, j) => (units[indices[j]].kind === 'major' && units[indices[j]].rooms[0].type !== 'stair' ? w + (stretchLimit * w) / majorUsed : w));
        else if (fill) final = widths.map((w) => (w * segWidth) / used);
        const finalUsed = sum(final);
        const gap = segWidth - finalUsed;
        let x = alignRight && segments.length === 1 ? segStart + gap : segStart;
        if (gap >= 4) {
          addDerived('terrace', floor > 0 ? 'Open Terrace' : 'Covered Sit-out', floor, band, { x: alignRight && segments.length === 1 ? segStart : segStart + finalUsed, y: y0, w: gap, d: depth });
        }
        occupiedStart = Math.min(occupiedStart, x);
        indices.forEach((unitIndex, j) => {
          const beside = [units[unitIndex - 1], units[unitIndex + 1]].map((unit) => (unit?.kind === 'major' ? unit.rooms[0] : undefined));
          placeUnit(units[unitIndex], floor, band, x, y0 + strip, final[j], effDepth, beside);
          x += final[j];
        });
        occupiedEnd = Math.max(occupiedEnd, x);
      });

      if (strip > 0 && occupiedEnd > occupiedStart) {
        addDerived('passage', 'Passage', floor, band, { x: occupiedStart, y: y0, w: occupiedEnd - occupiedStart, d: strip });
      }

      if (floor === 0) {
        for (const p of placed.filter((entry) => entry.room.floor === 0 && entry.room.band === band)) {
          if (p.room.type === 'stair' && !stairRect) {
            stairRect = { ...p.rect };
            reservedBlocks.push({ band, rect: { ...p.rect }, kind: 'stair', name: p.room.name });
          }
          if (p.room.type === 'courtyard' && multiStorey && !reservedBlocks.some((block) => block.name === p.room.name)) {
            reservedBlocks.push({ band, rect: { ...p.rect }, kind: 'void', name: p.room.name });
          }
        }
      }
    }
  }

  // A room squeezed below a usable size means the programme does not fit: say so rather than draw it.
  const squeezed = placed.filter((p) => !p.room.derived && p.room.type !== 'void' && (Math.min(p.rect.w, p.rect.d) < spec(p.room).minSide - 0.5 || p.rect.w * p.rect.d < spec(p.room).minArea * 0.85));
  if (squeezed.length) {
    return {
      ok: false,
      reason: `The requested rooms cannot fit on this plot at a usable size. On a ${fmtFt(envWidth)} x ${fmtFt(envDepth)} buildable envelope, ${squeezed.slice(0, 3).map((p) => `${p.room.name} would be only ${p.rect.w.toFixed(1)} ft x ${p.rect.d.toFixed(1)} ft`).join('; ')}.`,
      violatedConstraints: [
        `Buildable envelope ${fmtFt(envWidth)} x ${fmtFt(envDepth)} after setbacks`,
        ...squeezed.map((p) => `${p.room.name} needs at least ${spec(p.room).minSide} ft on its short side and ${spec(p.room).minArea} sq ft`)
      ]
    };
  }

  // ---- Canonical design object ----
  const cells: PlanCell[] = placed.map((p) => ({
    id: p.room.id,
    type: p.room.type,
    floor: p.room.floor,
    rect: { x: round2(originX + p.rect.x), y: round2(originY + p.rect.y), w: round2(p.rect.w), d: round2(p.rect.d) }
  }));
  const cellById = new Map(cells.map((cell) => [cell.id, cell]));
  const pctX = (ft: number) => round2((ft / plotWidth) * 100);
  const pctY = (ft: number) => round2((ft / plotDepth) * 100);

  const opened = solveOpenings(
    placed.map((p) => ({ ...cellById.get(p.room.id)!, name: p.room.name, attachedTo: p.room.attachedTo, relationships: p.room.relationships })),
    { floors, orientation: site.orientation, modes: constraints.modes }
  );
  notes.push(...opened.notes);

  const rooms: FloorPlanRoom[] = placed.map((p) => {
    const cell = cellById.get(p.room.id)!;
    const typeSpec = spec(p.room);
    return {
      id: p.room.id,
      name: p.room.name,
      category: typeSpec.category,
      roomType: p.room.type,
      zoningCategory: typeSpec.zoning,
      privacyLevel: typeSpec.privacy,
      dimensions: `${fmtFt(cell.rect.w)} x ${fmtFt(cell.rect.d)}`,
      areaSqFt: Math.round(cell.rect.w * cell.rect.d),
      position: { x: pctX(cell.rect.x), y: pctY(cell.rect.y), width: pctX(cell.rect.w), height: pctY(cell.rect.d), floorLevel: p.room.floor },
      connections: Array.from(opened.connections.get(p.room.id) || []),
      features: [...p.room.features, ...(opened.features.get(p.room.id) || [])],
      color: typeSpec.color,
      required: p.room.required,
      derived: p.room.derived || undefined,
      attachedTo: p.room.attachedTo,
      relationships: p.room.relationships
    };
  });

  const walls = Array.from({ length: floors }, (_, floor) => deriveWallSegments(cells.filter((cell) => cell.floor === floor), floor)).flatMap((segments) => wallsToCanonical(segments, { width: plotWidth, depth: plotDepth }));
  const openings: FloorPlanOpening[] = opened.openings.map((op) => {
    const x = pctX(op.xFt);
    const y = pctY(op.yFt);
    const wall = walls.find((w) => w.floorLevel === op.floorLevel && (op.orientation === 'horizontal'
      ? Math.abs(w.y1 - y) < 0.05 && Math.abs(w.y2 - y) < 0.05 && Math.min(w.x1, w.x2) - 0.05 <= x && Math.max(w.x1, w.x2) + 0.05 >= x
      : Math.abs(w.x1 - x) < 0.05 && Math.abs(w.x2 - x) < 0.05 && Math.min(w.y1, w.y2) - 0.05 <= y && Math.max(w.y1, w.y2) + 0.05 >= y));
    return {
      id: op.id, type: op.type, wallId: wall?.id, x, y, width: op.widthFt, label: op.label, swingDirection: op.swingDirection,
      floorLevel: op.floorLevel, orientation: op.orientation, connects: op.connects, isExterior: op.isExterior
    };
  });

  const enclosed = (room: FloorPlanRoom) => !['parking', 'courtyard', 'void', 'terrace', 'balcony'].includes(room.roomType || '');
  const floorLevels: FloorPlanLevel[] = Array.from({ length: floors }, (_, level) => ({
    level,
    name: floorName(level),
    builtUpAreaSqFt: rooms.filter((room) => room.position.floorLevel === level && enclosed(room)).reduce((sum, room) => sum + room.areaSqFt, 0)
  }));

  const stairBase = stairRect as Rect | null;
  const stairs: StaircaseDetails[] = stairBase
    ? [{
        id: 'stair-1', location: `${program.stairSide === 'left' ? 'Left' : 'Right'} side of the circulation zone`, floorLevel: 0, topFloorLevel: floors - 1,
        x: pctX(originX + stairBase.x), y: pctY(originY + stairBase.y), width: pctX(stairBase.w), height: pctY(stairBase.d), type: 'dog_legged'
      }]
    : [];

  const buildingDepth = depths.front + depths.middle + depths.rear;
  const steppedUpper = rooms.some((room) => room.roomType === 'terrace' && room.derived);
  const footprint: BuildingFootprint = {
    shapeType: courtyards.length ? 'courtyard_centered' : steppedUpper ? 'stepped' : footprintWidth < envWidth - 1 || budgetFirst ? 'compact' : 'rectangular',
    footprintAreaSqFt: Math.round(footprintWidth * buildingDepth),
    boundingWidth: round2(footprintWidth),
    boundingDepth: round2(buildingDepth)
  };

  const furniture: ConceptualFurniture[] = [];
  const cue = (room: FloorPlanRoom, type: ConceptualFurniture['type'], fx: number, fy: number, fw: number, fh: number) => {
    const { x, y, width, height } = room.position;
    furniture.push({ id: `f-${type}-${room.id}`, roomId: room.id, type, x: round2(x + width * fx), y: round2(y + height * fy), width: round2(width * fw), height: round2(height * fh) });
  };
  for (const room of rooms) {
    if (room.roomType === 'living' || room.roomType === 'lounge') cue(room, 'sofa', 0.12, 0.62, 0.5, 0.2);
    else if (room.roomType === 'dining') cue(room, 'dining_table', 0.3, 0.55, 0.4, 0.3);
    else if (room.category === 'bedroom') cue(room, 'bed', 0.3, 0.58, 0.4, 0.34);
    else if (room.roomType === 'kitchen') cue(room, 'kitchen_counter', 0.1, 0.68, 0.8, 0.2);
    else if (room.roomType === 'bathroom') cue(room, 'bath_fixture', 0.2, 0.6, 0.6, 0.25);
    else if (room.roomType === 'study') cue(room, 'study_desk', 0.2, 0.6, 0.6, 0.22);
  }

  const style = constraints.style;
  const design: StructuredDesignJSON = {
    schemaVersion: 2,
    program: { ...program, rooms: program.rooms.map((room) => ({ ...room })) },
    constraints: { ...constraints },
    layoutNotes: notes,
    architecturalBrief: program.architecturalBrief,
    spatialGraph: {
      nodes: rooms.map((room) => ({ roomId: room.id, name: room.name, category: room.roomType || room.category })),
      requiredAdjacencies: rooms.flatMap((room): [string, string][] => [
        ...(room.attachedTo ? [[room.id, room.attachedTo] as [string, string]] : []),
        ...(room.relationships || []).filter((rel) => ['ATTACHED_TO', 'CONNECTED_TO', 'ADJACENT_TO', 'ACCESSIBLE_FROM'].includes(rel.type)).map((rel) => [room.id, rel.target] as [string, string])
      ]),
      preferredAdjacencies: rooms.flatMap((room) => (room.relationships || []).filter((rel) => rel.type === 'NEAR').map((rel) => [room.id, rel.target] as [string, string])),
      avoidAdjacencies: rooms.flatMap((room) => (room.relationships || []).filter((rel) => rel.type === 'PRIVATE_FROM').map((rel) => [room.id, rel.target] as [string, string])),
      verticalConnections: Array.from({ length: Math.max(0, floors - 1) }, (_, level) => ({ stairId: 'stair-1', connectLevels: [level, level + 1] as [number, number] })),
      indoorOutdoorConnections: openings.filter((op) => op.type === 'sliding_glass' && (op.connects || []).length === 2).map((op) => ({ roomId: op.connects![0], outdoorSpaceId: op.connects![1] }))
    },
    footprint,
    plot: {
      width: plotWidth,
      depth: plotDepth,
      totalArea: Math.round(plotWidth * plotDepth),
      orientation: site.orientation,
      roadSide: (['N', 'S', 'E', 'W'].includes(site.orientation) ? site.orientation : site.orientation.charAt(0)) as 'N' | 'S' | 'E' | 'W',
      setbacks
    },
    buildableAreaSqFt: Math.round(envWidth * envDepth),
    totalBuiltUpAreaSqFt: floorLevels.reduce((sum, level) => sum + level.builtUpAreaSqFt, 0),
    floorsCount: floors,
    floors: floorLevels,
    stairs,
    entranceDirection: `${site.orientation} Entrance`,
    rooms,
    walls,
    openings,
    furniture,
    circulationNotes: program.circulationNotes || 'Entry leads to the living room; the circulation zone and passages connect every room without passing through a bedroom.',
    rationale: program.rationale,
    modeConsiderations: program.modeConsiderations,
    styleFeatures: program.styleFeatures.length ? program.styleFeatures : [`${style} style`],
    designSignature: {
      planningType: program.planningType,
      circulationType: program.circulationType,
      privatePublicZoning: multiStorey ? 'stacked' : rooms.some((room) => room.roomType === 'passage') ? 'split' : 'integrated',
      orientationStrategy: program.architecturalBrief?.orientationStrategy || `${site.orientation}-facing frontage`,
      climateStrategy: program.architecturalBrief?.climateStrategy ? [program.architecturalBrief.climateStrategy] : [],
      styleStrategy: [`${style}`, ...(program.architecturalBrief?.styleStrategy ? [program.architecturalBrief.styleStrategy] : [])],
      futureAdaptability: lifeStage ? 'high' : 'standard'
    },
    appearance: program.appearance || DEFAULT_APPEARANCE_BY_STYLE[style] || DEFAULT_APPEARANCE_BY_STYLE['Modern']
  };

  const required = new Set(placed.filter((p) => !(p.room.derived && ["terrace", "balcony"].includes(p.room.type))).map((p) => p.room.id));
  return { ok: true, design, notes, unreachable: opened.unreachable.filter((id) => required.has(id)) };
}
