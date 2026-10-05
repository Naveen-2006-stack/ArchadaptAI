import { FloorPlanOpening, HouseAppearance, RoomType, StructuredDesignJSON } from '@/types/architectural';
import { normalizeStyleName, NormalizedStyle } from '@/lib/design/styleNormalizer';
import { ROOM_TYPE_SPECS, countBedrooms, inferRoomType } from '@/lib/design/roomTypes';
import { OPEN_TYPES, PlanCell, WallSegment, deriveWallSegments, designCells, exteriorSegments } from './planGeometry';

type Vec3 = [number, number, number];

export interface Box3D {
  position: Vec3; // centre
  size: Vec3; // x, y, z extents
  floorLevel: number;
}

export interface RoomMesh3D extends Box3D {
  id: string;
  name: string;
  category: string;
  roomType: RoomType;
  color: string;
  isOpen: boolean; // courtyard, terrace, balcony, parking: no walls or ceiling of its own
  widthFt: number;
  depthFt: number;
}

export interface WallPiece3D extends Box3D {
  isExterior: boolean;
}

export interface OpeningMesh3D extends Box3D {
  id: string;
  kind: 'window' | 'door' | 'sliding_glass';
}

export interface RoofMesh3D {
  type: 'sloped_hipped_gable' | 'flat_parapet' | 'minimal_slab';
  position: Vec3;
  size: Vec3;
  color: string;
  overhang: number;
}

export interface HouseGeometry3D {
  plotSize: Vec3;
  plotPosition: Vec3;
  drivewaySize: Vec3;
  drivewayPosition: Vec3;
  rooms: RoomMesh3D[]; // one floor plate per room: the same rooms, floors and footprints as the 2D plan
  ceilings: Box3D[];
  walls: WallPiece3D[];
  openings: OpeningMesh3D[];
  stairSteps: Box3D[];
  railings: Box3D[];
  pillars: { position: Vec3; height: number; radius: number; floorLevel: number }[];
  roofs: RoofMesh3D[];
  totalFloors: number;
  normalizedStyle: NormalizedStyle;
  styleName: string;
  appearance: HouseAppearance;
  cameraTarget: Vec3;
  recommendedCameraDistance: number;
  /** What the model contains, for the 2D ↔ 3D consistency check. */
  summary: { roomIds: string[]; bedrooms: number; floors: number };
}

export const FT = 0.3048; // metres per foot
export const STORY_HEIGHT = 3.0;
const PLINTH = 0.3;
const SLAB = 0.12;
const DOOR_HEAD = 2.1;
const SILL = 0.9;

/**
 * Builds the 3D model from the canonical design and nothing else: every room plate, wall, door,
 * window and stair flight comes from the same rooms, walls, openings and stairs the 2D plan draws.
 * The road (plan front) faces -Z; one world unit is one metre.
 */
export function buildHouseGeometry(design: StructuredDesignJSON): HouseGeometry3D {
  const plotWidth = design.plot?.width || 40;
  const plotDepth = design.plot?.depth || 60;
  const cells = designCells(design);
  const X = (ft: number) => (ft - plotWidth / 2) * FT;
  const Z = (ft: number) => (ft - plotDepth / 2) * FT;
  const baseY = (level: number) => PLINTH + level * STORY_HEIGHT;
  const maxLevel = Math.max(0, ...cells.map((cell) => cell.floor));
  const totalFloors = Math.max(design.floorsCount || 1, maxLevel + 1);
  const enclosed = (cell: PlanCell) => !OPEN_TYPES.includes(cell.type);

  // ---- Rooms: one floor plate each ----
  const rooms: RoomMesh3D[] = [];
  const ceilings: Box3D[] = [];
  for (const cell of cells) {
    if (cell.type === 'void') continue;
    const source = design.rooms.find((room) => room.id === cell.id)!;
    const cx = X(cell.rect.x + cell.rect.w / 2);
    const cz = Z(cell.rect.y + cell.rect.d / 2);
    const size: Vec3 = [cell.rect.w * FT, SLAB, cell.rect.d * FT];
    rooms.push({
      id: cell.id,
      name: source.name,
      category: source.category,
      roomType: cell.type,
      color: cell.type === 'courtyard' ? '#4A6B5D' : source.color || ROOM_TYPE_SPECS[cell.type].color,
      isOpen: !enclosed(cell),
      position: [cx, baseY(cell.floor) - SLAB / 2, cz],
      size,
      floorLevel: cell.floor,
      widthFt: cell.rect.w,
      depthFt: cell.rect.d
    });
    if (enclosed(cell) && cell.type !== 'stair') {
      ceilings.push({ position: [cx, baseY(cell.floor) + STORY_HEIGHT - SLAB * 1.5, cz], size, floorLevel: cell.floor });
    }
  }

  // ---- Walls, cut by the canonical openings ----
  const canonicalWalls = (design.walls || []).some((wall) => typeof wall.floorLevel === 'number');
  const segments: WallSegment[] = canonicalWalls
    ? design.walls.map((wall) => {
        const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
        return {
          orientation: horizontal ? ('horizontal' as const) : ('vertical' as const),
          at: horizontal ? (wall.y1 / 100) * plotDepth : (wall.x1 / 100) * plotWidth,
          start: horizontal ? (Math.min(wall.x1, wall.x2) / 100) * plotWidth : (Math.min(wall.y1, wall.y2) / 100) * plotDepth,
          end: horizontal ? (Math.max(wall.x1, wall.x2) / 100) * plotWidth : (Math.max(wall.y1, wall.y2) / 100) * plotDepth,
          isExterior: wall.isExterior,
          floor: wall.floorLevel || 0
        };
      })
    : Array.from({ length: totalFloors }, (_, floor) => deriveWallSegments(cells.filter((cell) => cell.floor === floor), floor)).flat();

  const walls: WallPiece3D[] = [];
  const openings: OpeningMesh3D[] = [];
  const located = (design.openings || [])
    .filter((op): op is FloorPlanOpening & { orientation: 'horizontal' | 'vertical' } => !!op.orientation)
    .map((op) => ({ op, xFt: (op.x / 100) * plotWidth, yFt: (op.y / 100) * plotDepth, floor: op.floorLevel || 0 }));

  const cut = new Set<string>(); // each opening is cut into exactly one wall
  for (const seg of segments) {
    const thickness = seg.isExterior ? 0.23 : 0.115;
    const y0 = baseY(seg.floor);
    const height = STORY_HEIGHT - SLAB;
    const piece = (from: number, to: number, bottom: number, top: number) => {
      if (to - from < 0.02 || top - bottom < 0.02) return;
      const mid = (from + to) / 2;
      const length = (to - from) * FT;
      walls.push({
        position: seg.orientation === 'horizontal' ? [X(mid), y0 + (bottom + top) / 2, Z(seg.at)] : [X(seg.at), y0 + (bottom + top) / 2, Z(mid)],
        size: seg.orientation === 'horizontal' ? [length, top - bottom, thickness] : [thickness, top - bottom, length],
        floorLevel: seg.floor,
        isExterior: seg.isExterior
      });
    };
    const onWall = located
      .filter(({ op, xFt, yFt, floor }) => !cut.has(op.id) && floor === seg.floor && op.orientation === seg.orientation
        && Math.abs((seg.orientation === 'horizontal' ? yFt : xFt) - seg.at) < 0.15
        && (seg.orientation === 'horizontal' ? xFt : yFt) > seg.start - 0.05 && (seg.orientation === 'horizontal' ? xFt : yFt) < seg.end + 0.05)
      .map(({ op, xFt, yFt }) => ({ op, pos: seg.orientation === 'horizontal' ? xFt : yFt }))
      .sort((a, b) => a.pos - b.pos);

    let cursor = seg.start;
    for (const { op, pos } of onWall) {
      const from = Math.max(cursor, pos - op.width / 2);
      const to = Math.min(seg.end, pos + op.width / 2);
      if (to <= from) continue;
      cut.add(op.id);
      piece(cursor, from, 0, height);
      const head = op.type === 'archway' ? 2.4 : op.type === 'sliding_glass' ? 2.2 : DOOR_HEAD;
      piece(from, to, head, height); // lintel
      const mid = (from + to) / 2;
      const span = (to - from) * FT;
      const at = (bottom: number, top: number, depth: number): Box3D => ({
        position: seg.orientation === 'horizontal' ? [X(mid), y0 + (bottom + top) / 2, Z(seg.at)] : [X(seg.at), y0 + (bottom + top) / 2, Z(mid)],
        size: seg.orientation === 'horizontal' ? [span, top - bottom, depth] : [depth, top - bottom, span],
        floorLevel: seg.floor
      });
      if (op.type === 'window') {
        piece(from, to, 0, SILL);
        openings.push({ id: op.id, kind: 'window', ...at(SILL, head, 0.05) });
      } else if (op.type === 'sliding_glass') {
        openings.push({ id: op.id, kind: 'sliding_glass', ...at(0, head, 0.05) });
      } else if (op.type === 'door') {
        openings.push({ id: op.id, kind: 'door', ...at(0, head, 0.06) });
      }
      cursor = to;
    }
    piece(cursor, seg.end, 0, height);
  }

  // ---- Stairs: a dog-legged flight between each pair of floors, inside the stair cell ----
  const stairSteps: Box3D[] = [];
  const stairCells = cells.filter((cell) => cell.type === 'stair').sort((a, b) => a.floor - b.floor);
  for (const cell of stairCells) {
    if (cell.floor >= totalFloors - 1) continue;
    const steps = 16;
    const rise = STORY_HEIGHT / steps;
    const landing = Math.min(3.5, cell.rect.d * 0.25);
    const run = (cell.rect.d - landing) / (steps / 2);
    const half = cell.rect.w / 2;
    for (let i = 0; i < steps; i++) {
      const firstFlight = i < steps / 2;
      const index = firstFlight ? i : steps - 1 - i;
      const yFt = cell.rect.y + cell.rect.d - (index + 0.5) * run; // first flight climbs toward the road, second returns
      const xFt = cell.rect.x + (firstFlight ? half / 2 : half + half / 2);
      const top = baseY(cell.floor) + (i + 1) * rise;
      stairSteps.push({ position: [X(xFt), top - rise / 2, Z(yFt)], size: [half * FT * 0.92, rise, run * FT], floorLevel: cell.floor });
    }
    stairSteps.push({
      position: [X(cell.rect.x + half), baseY(cell.floor) + STORY_HEIGHT / 2 - 0.05, Z(cell.rect.y + landing / 2)],
      size: [cell.rect.w * FT * 0.96, 0.1, landing * FT],
      floorLevel: cell.floor
    });
  }

  // ---- Railings on balcony / terrace edges, pillars under entrance and car porch ----
  const railings: Box3D[] = [];
  const pillars: HouseGeometry3D['pillars'] = [];
  for (let floor = 0; floor < totalFloors; floor++) {
    const floorCells = cells.filter((cell) => cell.floor === floor);
    for (const cell of floorCells) {
      if ((cell.type === 'balcony' || cell.type === 'terrace') && floor > 0) {
        for (const seg of exteriorSegments(cell, floorCells).filter((s) => !s.facesOpenSpace)) {
          const mid = (seg.start + seg.end) / 2;
          railings.push({
            position: seg.orientation === 'horizontal' ? [X(mid), baseY(floor) + 0.5, Z(seg.at)] : [X(seg.at), baseY(floor) + 0.5, Z(mid)],
            size: seg.orientation === 'horizontal' ? [seg.length * FT, 1, 0.05] : [0.05, 1, seg.length * FT],
            floorLevel: floor
          });
        }
      }
      if (floor === 0 && (cell.type === 'entrance' || cell.type === 'parking')) {
        const inset = 0.4;
        const corners: [number, number][] = [[cell.rect.x + inset, cell.rect.y + inset], [cell.rect.x + cell.rect.w - inset, cell.rect.y + inset]];
        if (cell.type === 'parking') corners.push([cell.rect.x + inset, cell.rect.y + cell.rect.d - inset], [cell.rect.x + cell.rect.w - inset, cell.rect.y + cell.rect.d - inset]);
        corners.forEach(([px, py]) => pillars.push({ position: [X(px), baseY(0) + (STORY_HEIGHT - SLAB) / 2, Z(py)], height: STORY_HEIGHT - SLAB, radius: 0.12, floorLevel: 0 }));
        // Open porches still carry a roof slab.
        ceilings.push({ position: [X(cell.rect.x + cell.rect.w / 2), baseY(0) + STORY_HEIGHT - SLAB * 1.5, Z(cell.rect.y + cell.rect.d / 2)], size: [cell.rect.w * FT, SLAB, cell.rect.d * FT], floorLevel: 0 });
      }
    }
  }

  // ---- Roof over the enclosed rooms of the top floor ----
  const normStyle = normalizeStyleName(design.constraints?.style || design.designSignature?.styleStrategy?.[0], design.styleFeatures, design.constraints ? '' : design.rationale);
  const topCells = cells.filter((cell) => cell.floor === totalFloors - 1 && enclosed(cell));
  const roofCells = topCells.length ? topCells : cells.filter(enclosed);
  const minX = Math.min(...roofCells.map((cell) => cell.rect.x));
  const maxX = Math.max(...roofCells.map((cell) => cell.rect.x + cell.rect.w));
  const minY = Math.min(...roofCells.map((cell) => cell.rect.y));
  const maxY = Math.max(...roofCells.map((cell) => cell.rect.y + cell.rect.d));
  const roofW = (maxX - minX) * FT;
  const roofD = (maxY - minY) * FT;
  const roofCentre: [number, number] = [X((minX + maxX) / 2), Z((minY + maxY) / 2)];
  const roofY = baseY(totalFloors - 1) + STORY_HEIGHT;
  const roofs: RoofMesh3D[] = [];
  let styleName: string;
  if (normStyle === 'kerala_traditional' || normStyle === 'tropical' || normStyle === 'traditional_indian' || normStyle === 'colonial') {
    styleName = 'Pitched Tiled Roof';
    const height = Math.max(1.2, Math.min(roofW, roofD) * 0.28);
    roofs.push({ type: 'sloped_hipped_gable', position: [roofCentre[0], roofY + height / 2, roofCentre[1]], size: [roofW + 1.4, height, roofD + 1.4], color: design.appearance?.roofColor || '#C86A4B', overhang: 0.7 });
  } else if (normStyle === 'minimalist') {
    styleName = 'Minimal Flat Slab';
    roofs.push({ type: 'minimal_slab', position: [roofCentre[0], roofY + 0.08, roofCentre[1]], size: [roofW + 0.2, 0.16, roofD + 0.2], color: design.appearance?.roofColor || '#282623', overhang: 0.1 });
  } else {
    styleName = 'Flat Roof with Parapet';
    roofs.push({ type: 'flat_parapet', position: [roofCentre[0], roofY + 0.15, roofCentre[1]], size: [roofW + 0.4, 0.3, roofD + 0.4], color: design.appearance?.roofColor || '#D0C9BE', overhang: 0.2 });
  }

  // ---- Site ----
  const parking = cells.find((cell) => cell.floor === 0 && cell.type === 'parking');
  const entry = parking || cells.find((cell) => cell.floor === 0 && cell.type === 'entrance') || cells.find((cell) => cell.floor === 0);
  const driveWidthFt = parking ? Math.min(parking.rect.w, 10) : 4;
  const driveDepthFt = entry ? Math.max(1, entry.rect.y) : 1;
  const appearance: HouseAppearance = design.appearance || { wallColor: '#F4F1EA', roofColor: roofs[0].color, frameColor: '#121417', accentMaterial: 'wood' };
  const span = Math.max(plotWidth, plotDepth) * FT;

  return {
    plotSize: [plotWidth * FT, 0.06, plotDepth * FT],
    plotPosition: [0, -0.03, 0],
    drivewaySize: [driveWidthFt * FT, 0.04, driveDepthFt * FT],
    drivewayPosition: [entry ? X(entry.rect.x + entry.rect.w / 2) : 0, 0.02, Z(driveDepthFt / 2)],
    rooms,
    ceilings,
    walls,
    openings,
    stairSteps,
    railings,
    pillars,
    roofs,
    totalFloors,
    normalizedStyle: normStyle,
    styleName,
    appearance,
    cameraTarget: [roofCentre[0], (totalFloors * STORY_HEIGHT) / 2, roofCentre[1]],
    recommendedCameraDistance: Math.max(14, span * 1.15 + totalFloors * 2),
    summary: {
      roomIds: rooms.map((room) => room.id),
      bedrooms: rooms.filter((room) => room.roomType === 'master_bedroom' || room.roomType === 'bedroom').length,
      floors: new Set(rooms.map((room) => room.floorLevel)).size
    }
  };
}

/**
 * 2D ↔ 3D consistency check. Both renderers read the same canonical design; this proves the 3D
 * model actually contains the same rooms, on the same floors, with the same footprints.
 */
export function checkRenderConsistency(design: StructuredDesignJSON): { consistent: boolean; problems: string[] } {
  const problems: string[] = [];
  const geometry = buildHouseGeometry(design);
  const plot = { width: design.plot?.width || 40, depth: design.plot?.depth || 60 };
  const planRooms = design.rooms.filter((room) => inferRoomType(room) !== 'void');
  if (planRooms.length !== geometry.rooms.length) problems.push(`2D plan has ${planRooms.length} rooms but the 3D model has ${geometry.rooms.length}.`);
  for (const room of planRooms) {
    const mesh = geometry.rooms.find((m) => m.id === room.id);
    if (!mesh) {
      problems.push(`${room.name} is on the 2D plan but missing from the 3D model.`);
      continue;
    }
    if (mesh.floorLevel !== (room.position.floorLevel || 0)) problems.push(`${room.name} is on a different floor in 3D.`);
    const widthFt = (room.position.width / 100) * plot.width;
    const depthFt = (room.position.height / 100) * plot.depth;
    if (Math.abs(mesh.size[0] / FT - widthFt) > 0.05 || Math.abs(mesh.size[2] / FT - depthFt) > 0.05) problems.push(`${room.name} has different dimensions in 2D and 3D.`);
    const cxFt = (room.position.x / 100) * plot.width + widthFt / 2;
    const czFt = (room.position.y / 100) * plot.depth + depthFt / 2;
    if (Math.abs(mesh.position[0] / FT + plot.width / 2 - cxFt) > 0.05 || Math.abs(mesh.position[2] / FT + plot.depth / 2 - czFt) > 0.05) problems.push(`${room.name} is in a different position in 2D and 3D.`);
  }
  if (geometry.summary.bedrooms !== countBedrooms(design)) problems.push(`2D plan has ${countBedrooms(design)} bedrooms but the 3D model has ${geometry.summary.bedrooms}.`);
  const planFloors = new Set(planRooms.map((room) => room.position.floorLevel || 0)).size;
  if (geometry.summary.floors !== planFloors) problems.push(`2D plan has ${planFloors} floors but the 3D model has ${geometry.summary.floors}.`);
  const planOpenings = (design.openings || []).filter((op) => op.orientation && op.type !== 'archway').length;
  if (planOpenings !== geometry.openings.length) problems.push(`2D plan has ${planOpenings} doors/windows but the 3D model has ${geometry.openings.length}.`);
  return { consistent: problems.length === 0, problems };
}
