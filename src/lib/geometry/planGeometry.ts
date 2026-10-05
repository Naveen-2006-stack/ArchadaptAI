import { FloorPlanRoom, FloorPlanWall, RoomType, StructuredDesignJSON } from '@/types/architectural';
import { inferRoomType } from '@/lib/design/roomTypes';

/** Rectangle in feet. x runs across the frontage, y runs from the road (front) to the rear. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface PlanCell {
  id: string;
  type: RoomType;
  floor: number;
  rect: Rect;
}

export interface SharedEdge {
  orientation: 'horizontal' | 'vertical'; // direction of the shared wall
  start: number;
  end: number;
  at: number; // the fixed coordinate of the wall line
  length: number;
  midX: number;
  midY: number;
}

export type PlanEdgeSide = 'front' | 'rear' | 'left' | 'right';

export interface ExteriorSegment {
  side: PlanEdgeSide;
  orientation: 'horizontal' | 'vertical';
  start: number;
  end: number;
  at: number;
  length: number;
  facesOpenSpace: boolean; // faces a courtyard / terrace / void rather than the plot edge
}

const TOL = 0.05;

/** Room types with no enclosing walls of their own. */
export const OPEN_TYPES: RoomType[] = ['courtyard', 'void', 'terrace', 'balcony', 'parking', 'entrance'];
/** Open-air types a window may look onto (an entrance verandah is a covered but open porch). */
export const OPEN_TO_SKY: RoomType[] = ['courtyard', 'void', 'terrace', 'balcony', 'entrance'];

export const round2 = (value: number) => Math.round(value * 100) / 100;

export function rectOverlapArea(a: Rect, b: Rect): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

export function sharedEdge(a: Rect, b: Rect): SharedEdge | null {
  const vertical = (at: number): SharedEdge | null => {
    const start = Math.max(a.y, b.y);
    const end = Math.min(a.y + a.d, b.y + b.d);
    return end - start > TOL ? { orientation: 'vertical', start, end, at, length: end - start, midX: at, midY: (start + end) / 2 } : null;
  };
  const horizontal = (at: number): SharedEdge | null => {
    const start = Math.max(a.x, b.x);
    const end = Math.min(a.x + a.w, b.x + b.w);
    return end - start > TOL ? { orientation: 'horizontal', start, end, at, length: end - start, midX: (start + end) / 2, midY: at } : null;
  };
  if (Math.abs(a.x + a.w - b.x) <= TOL) return vertical(b.x);
  if (Math.abs(b.x + b.w - a.x) <= TOL) return vertical(a.x);
  if (Math.abs(a.y + a.d - b.y) <= TOL) return horizontal(b.y);
  if (Math.abs(b.y + b.d - a.y) <= TOL) return horizontal(a.y);
  return null;
}

function subtractIntervals(start: number, end: number, covered: [number, number][]): [number, number][] {
  let free: [number, number][] = [[start, end]];
  for (const [cs, ce] of covered) {
    free = free.flatMap(([fs, fe]): [number, number][] => {
      if (ce <= fs + TOL || cs >= fe - TOL) return [[fs, fe]];
      const parts: [number, number][] = [];
      if (cs > fs + TOL) parts.push([fs, cs]);
      if (ce < fe - TOL) parts.push([ce, fe]);
      return parts;
    });
  }
  return free.filter(([fs, fe]) => fe - fs > TOL);
}

/** Portions of a cell's edges that face outside air: the plot, or an open-to-sky neighbour. */
export function exteriorSegments(cell: PlanCell, floorCells: PlanCell[]): ExteriorSegment[] {
  const { x, y, w, d } = cell.rect;
  const others = floorCells.filter((other) => other.id !== cell.id);
  const edges: { side: PlanEdgeSide; orientation: 'horizontal' | 'vertical'; at: number; start: number; end: number }[] = [
    { side: 'front', orientation: 'horizontal', at: y, start: x, end: x + w },
    { side: 'rear', orientation: 'horizontal', at: y + d, start: x, end: x + w },
    { side: 'left', orientation: 'vertical', at: x, start: y, end: y + d },
    { side: 'right', orientation: 'vertical', at: x + w, start: y, end: y + d }
  ];
  const segments: ExteriorSegment[] = [];
  for (const edge of edges) {
    const solid: [number, number][] = [];
    const open: [number, number][] = [];
    for (const other of others) {
      const shared = sharedEdge(cell.rect, other.rect);
      if (!shared || shared.orientation !== edge.orientation || Math.abs(shared.at - edge.at) > TOL) continue;
      (OPEN_TO_SKY.includes(other.type) ? open : solid).push([shared.start, shared.end]);
    }
    for (const [start, end] of subtractIntervals(edge.start, edge.end, [...solid, ...open])) {
      segments.push({ ...edge, start, end, length: end - start, facesOpenSpace: false });
    }
    for (const [start, end] of open) {
      segments.push({ ...edge, start, end, length: end - start, facesOpenSpace: true });
    }
  }
  return segments;
}

export interface WallSegment {
  orientation: 'horizontal' | 'vertical';
  at: number;
  start: number;
  end: number;
  isExterior: boolean;
  floor: number;
}

/**
 * Unique wall segments for one floor. Shared edges produce one interior wall, not two;
 * open spaces (courtyard, terrace, parking…) contribute no walls of their own.
 */
export function deriveWallSegments(floorCells: PlanCell[], floor: number): WallSegment[] {
  type Edge = { orientation: 'horizontal' | 'vertical'; at: number; start: number; end: number; enclosed: boolean };
  const edges: Edge[] = [];
  for (const cell of floorCells) {
    const { x, y, w, d } = cell.rect;
    const enclosed = !OPEN_TYPES.includes(cell.type);
    edges.push(
      { orientation: 'horizontal', at: y, start: x, end: x + w, enclosed },
      { orientation: 'horizontal', at: y + d, start: x, end: x + w, enclosed },
      { orientation: 'vertical', at: x, start: y, end: y + d, enclosed },
      { orientation: 'vertical', at: x + w, start: y, end: y + d, enclosed }
    );
  }
  const walls: WallSegment[] = [];
  for (const orientation of ['horizontal', 'vertical'] as const) {
    const lines = new Map<number, Edge[]>();
    for (const edge of edges.filter((e) => e.orientation === orientation)) {
      const key = Math.round(edge.at * 10) / 10;
      lines.set(key, [...(lines.get(key) || []), edge]);
    }
    lines.forEach((lineEdges, at) => {
      const points = Array.from(new Set(lineEdges.flatMap((e) => [round2(e.start), round2(e.end)]))).sort((a, b) => a - b);
      let current: WallSegment | null = null;
      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        const mid = (start + end) / 2;
        const covering = lineEdges.filter((e) => e.start - TOL <= mid && e.end + TOL >= mid);
        const enclosedCount = covering.filter((e) => e.enclosed).length;
        if (enclosedCount === 0) {
          current = null;
          continue;
        }
        const isExterior = enclosedCount === 1;
        if (current && current.isExterior === isExterior && Math.abs(current.end - start) <= TOL) {
          current.end = end;
        } else {
          current = { orientation, at, start, end, isExterior, floor };
          walls.push(current);
        }
      }
    });
  }
  return walls;
}

/** Converts a stored room (percent of plot) back to feet. */
export function roomRectFt(room: FloorPlanRoom, plot: { width: number; depth: number }): Rect {
  return {
    x: (room.position.x / 100) * plot.width,
    y: (room.position.y / 100) * plot.depth,
    w: (room.position.width / 100) * plot.width,
    d: (room.position.height / 100) * plot.depth
  };
}

export function designCells(design: StructuredDesignJSON): PlanCell[] {
  const plot = { width: design.plot?.width || 40, depth: design.plot?.depth || 60 };
  return (design.rooms || []).map((room) => ({
    id: room.id,
    type: inferRoomType(room),
    floor: room.position.floorLevel || 0,
    rect: roomRectFt(room, plot)
  }));
}

/** Canonical walls in percent-of-plot, as stored on the design. */
export function wallsToCanonical(segments: WallSegment[], plot: { width: number; depth: number }): FloorPlanWall[] {
  return segments.map((seg, index) => {
    const px = (v: number) => round2((v / plot.width) * 100);
    const py = (v: number) => round2((v / plot.depth) * 100);
    const horizontal = seg.orientation === 'horizontal';
    return {
      id: `wall-${seg.floor}-${index + 1}`,
      x1: horizontal ? px(seg.start) : px(seg.at),
      y1: horizontal ? py(seg.at) : py(seg.start),
      x2: horizontal ? px(seg.end) : px(seg.at),
      y2: horizontal ? py(seg.at) : py(seg.end),
      isExterior: seg.isExterior,
      thickness: seg.isExterior ? 0.75 : 0.4,
      floorLevel: seg.floor
    };
  });
}

/** Compass direction of each plan edge, given which way the plot faces (the road is always plan-front). */
export function planCompass(orientation: string): Record<PlanEdgeSide, string> {
  const ring = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.max(0, ring.indexOf(orientation));
  const at = (offset: number) => ring[(index + offset + 8) % 8];
  return { front: at(0), right: at(2), rear: at(4), left: at(-2) };
}
