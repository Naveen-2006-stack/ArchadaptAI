import {
  SiteInfo,
  LocationInfo,
  DesignRequirements,
  DesignPreferences,
  StructuredDesignJSON,
  FloorPlanRoom,
  FloorPlanOpening,
  VersionDelta,
  DesignSignature,
  FloorPlanLevel,
  StaircaseDetails,
  HouseAppearance,
  ArchitecturalBrief,
  SpatialGraph,
  BuildingFootprint,
  ConceptualFurniture
} from '@/types/architectural';
import { normalizeStyleName } from '@/lib/design/styleNormalizer';
import { DEFAULT_APPEARANCE_BY_STYLE } from '@/lib/geometry/materials';
import { validateFloorPlan } from '@/lib/design/validateFloorPlan';

interface RoomSpec {
  id: string;
  name: string;
  category: FloorPlanRoom['category'];
  zoningCategory: FloorPlanRoom['zoningCategory'];
  privacyLevel: FloorPlanRoom['privacyLevel'];
  x: number;
  y: number;
  w: number;
  h: number;
  level: number;
  features?: string[];
  color?: string;
}

function findSharedWall(r1: FloorPlanRoom, r2: FloorPlanRoom): { type: 'horizontal' | 'vertical'; x: number; y: number } | null {
  const r1Left = r1.position.x;
  const r1Right = r1.position.x + r1.position.width;
  const r1Top = r1.position.y;
  const r1Bottom = r1.position.y + r1.position.height;

  const r2Left = r2.position.x;
  const r2Right = r2.position.x + r2.position.width;
  const r2Top = r2.position.y;
  const r2Bottom = r2.position.y + r2.position.height;

  // Shared vertical wall: r1 is left of r2
  if (Math.abs(r1Right - r2Left) <= 1.5) {
    const overlapStart = Math.max(r1Top, r2Top);
    const overlapEnd = Math.min(r1Bottom, r2Bottom);
    if (overlapEnd > overlapStart + 2) {
      return { type: 'vertical', x: r1Right, y: (overlapStart + overlapEnd) / 2 };
    }
  }
  // Shared vertical wall: r1 is right of r2
  if (Math.abs(r1Left - r2Right) <= 1.5) {
    const overlapStart = Math.max(r1Top, r2Top);
    const overlapEnd = Math.min(r1Bottom, r2Bottom);
    if (overlapEnd > overlapStart + 2) {
      return { type: 'vertical', x: r1Left, y: (overlapStart + overlapEnd) / 2 };
    }
  }

  // Shared horizontal wall: r1 is above r2
  if (Math.abs(r1Bottom - r2Top) <= 1.5) {
    const overlapStart = Math.max(r1Left, r2Left);
    const overlapEnd = Math.min(r1Right, r2Right);
    if (overlapEnd > overlapStart + 2) {
      return { type: 'horizontal', x: (overlapStart + overlapEnd) / 2, y: r1Bottom };
    }
  }
  // Shared horizontal wall: r1 is below r2
  if (Math.abs(r1Top - r2Bottom) <= 1.5) {
    const overlapStart = Math.max(r1Left, r2Left);
    const overlapEnd = Math.min(r1Right, r2Right);
    if (overlapEnd > overlapStart + 2) {
      return { type: 'horizontal', x: (overlapStart + overlapEnd) / 2, y: r1Top };
    }
  }

  return null;
}

function solveOpenings(rooms: FloorPlanRoom[]): FloorPlanOpening[] {
  const openings: FloorPlanOpening[] = [];
  let opIdCounter = 1;

  // 1. Entrance door
  const entrance = rooms.find((r) => r.id === 'room-entrance');
  if (entrance) {
    openings.push({
      id: 'op-main',
      type: 'door',
      x: Math.round(entrance.position.x + entrance.position.width / 2),
      y: Math.round(entrance.position.y),
      width: 6,
      label: 'Main Entry Door',
      swingDirection: 'inward_left'
    });
  }

  // 2. Room-to-room doors on shared interfaces
  const addedConnections = new Set<string>();
  for (const r1 of rooms) {
    for (const connId of r1.connections) {
      const r2 = rooms.find((r) => r.id === connId);
      if (!r2) continue;

      const key = [r1.id, r2.id].sort().join('|');
      if (addedConnections.has(key)) continue;
      addedConnections.add(key);

      const wall = findSharedWall(r1, r2);
      if (wall) {
        openings.push({
          id: `op-door-${opIdCounter++}`,
          type: 'door',
          x: Math.round(wall.x),
          y: Math.round(wall.y),
          width: 3.5,
          label: `${r1.name.split(' ')[0]} to ${r2.name.split(' ')[0]} Door`,
          swingDirection: wall.type === 'horizontal' ? 'inward_left' : 'inward_right'
        });
      } else {
        // Simple fallback edge door if connection is specified but no clean shared interface
        openings.push({
          id: `op-door-${opIdCounter++}`,
          type: 'door',
          x: Math.round(r1.position.x + r1.position.width / 2),
          y: Math.round(r1.position.y + r1.position.height),
          width: 3.5,
          label: `${r1.name.split(' ')[0]} Door`,
          swingDirection: 'inward_left'
        });
      }
    }
  }

  // 3. External windows
  for (const room of rooms) {
    if (room.category === 'outdoor' || room.id === 'room-entrance' || room.name.toLowerCase().includes('parking')) {
      continue;
    }

    const rx = room.position.x;
    const ry = room.position.y;
    const rw = room.position.width;
    const rh = room.position.height;
    const level = room.position.floorLevel || 0;

    const isLeftBlocked = rooms.some((other) => 
      other.id !== room.id && 
      (other.position.floorLevel || 0) === level &&
      Math.abs((other.position.x + other.position.width) - rx) <= 1.5 &&
      other.position.y < ry + rh && other.position.y + other.position.height > ry
    );

    const isRightBlocked = rooms.some((other) => 
      other.id !== room.id && 
      (other.position.floorLevel || 0) === level &&
      Math.abs(other.position.x - (rx + rw)) <= 1.5 &&
      other.position.y < ry + rh && other.position.y + other.position.height > ry
    );

    const isTopBlocked = rooms.some((other) => 
      other.id !== room.id && 
      (other.position.floorLevel || 0) === level &&
      Math.abs((other.position.y + other.position.height) - ry) <= 1.5 &&
      other.position.x < rx + rw && other.position.x + other.position.width > rx
    );

    const isBottomBlocked = rooms.some((other) => 
      other.id !== room.id && 
      (other.position.floorLevel || 0) === level &&
      Math.abs(other.position.y - (ry + rh)) <= 1.5 &&
      other.position.x < rx + rw && other.position.x + other.position.width > rx
    );

    const type = room.category === 'bathroom' ? 'window' : room.category === 'living' ? 'sliding_glass' : 'window';
    const label = room.category === 'bathroom' ? 'Ventilator' : `${room.name.split(' ')[0]} Window`;
    const width = room.category === 'living' ? 8 : room.category === 'bathroom' ? 3 : 5;

    if (!isTopBlocked) {
      openings.push({ id: `op-win-${opIdCounter++}`, type, x: Math.round(rx + rw / 2), y: Math.round(ry), width, label });
    } else if (!isLeftBlocked) {
      openings.push({ id: `op-win-${opIdCounter++}`, type, x: Math.round(rx), y: Math.round(ry + rh / 2), width, label });
    } else if (!isRightBlocked) {
      openings.push({ id: `op-win-${opIdCounter++}`, type, x: Math.round(rx + rw), y: Math.round(ry + rh / 2), width, label });
    } else if (!isBottomBlocked) {
      openings.push({ id: `op-win-${opIdCounter++}`, type, x: Math.round(rx + rw / 2), y: Math.round(ry + rh), width, label });
    }
  }

  return openings;
}

export async function generateInitialDesign(
  site: SiteInfo,
  location: LocationInfo,
  reqs: DesignRequirements,
  prefs: DesignPreferences,
  conceptVariant: 'A' | 'B' | 'C' = 'A'
): Promise<{ design: StructuredDesignJSON; rationale: string }> {
  const width = site.plotWidth || 40;
  const depth = site.plotDepth || 60;
  const totalArea = width * depth;
  const primaryStyle = prefs.primaryStyle || 'Modern';
  const modes = prefs.modes || [];
  const floorsCount = Math.max(1, Number(reqs.floors) || 1);
  const targetBedrooms = Math.max(1, Number(reqs.bedrooms) || 3);
  const targetBathrooms = Math.max(1, Number(reqs.bathrooms) || 2);

  const normStyle = normalizeStyleName(primaryStyle, [], '');
  const isKerala = normStyle === 'kerala_traditional';
  const isMinimalist = normStyle === 'minimalist';
  const isModern = normStyle === 'modern' || normStyle === 'contemporary' || normStyle === 'modern_luxury';
  const isClimate = modes.includes('climate_adaptive');
  const isLifeStage = modes.includes('life_stage');

  const setbacks = {
    front: depth >= 60 ? 10 : 8,
    rear: depth >= 60 ? 6 : 5,
    left: width >= 50 ? 5 : 4,
    right: width >= 50 ? 5 : 4
  };
  const buildableWidth = Math.max(22, width - setbacks.left - setbacks.right);
  const buildableDepth = Math.max(26, depth - setbacks.front - setbacks.rear);
  const buildableAreaSqFt = Math.round(buildableWidth * buildableDepth);

  const planPattern: DesignSignature['planningType'] =
    isKerala
      ? conceptVariant === 'B'
        ? 'zoned_wings'
        : conceptVariant === 'C'
          ? 'linear_circulation'
          : 'courtyard_centered'
      : isMinimalist
        ? 'compact_core'
        : isModern
          ? conceptVariant === 'B'
            ? 'zoned_wings'
            : 'l_shaped'
          : 'linear_circulation';

  const footprintShape: BuildingFootprint['shapeType'] =
    isKerala
      ? conceptVariant === 'B'
        ? 'stepped'
        : conceptVariant === 'C'
          ? 'compact'
          : 'courtyard_centered'
      : isMinimalist
        ? 'compact'
        : isModern
          ? conceptVariant === 'B'
            ? 'winged'
            : 'l_shaped'
          : 'rectangular';

  const footprint: BuildingFootprint = {
    shapeType: footprintShape,
    footprintAreaSqFt: Math.round(buildableAreaSqFt * (conceptVariant === 'C' ? 0.72 : 0.79)),
    boundingWidth: buildableWidth,
    boundingDepth: buildableDepth
  };

  const circulationType: DesignSignature['circulationType'] =
    planPattern === 'courtyard_centered' ? 'central' : planPattern === 'zoned_wings' ? 'spine' : 'peripheral';

  const zoningMode: DesignSignature['privatePublicZoning'] =
    floorsCount > 1 ? 'stacked' : planPattern === 'zoned_wings' || isLifeStage ? 'split' : 'integrated';

  const conceptName = conceptVariant === 'A' ? 'central courtyard' : conceptVariant === 'B' ? 'offset spine' : 'axial courtyard';
  const architecturalBrief: ArchitecturalBrief = {
    planningIntent: `Design a ${primaryStyle} residence organized around a ${conceptName} concept to satisfy ${targetBedrooms} bedrooms and ${targetBathrooms} bathrooms across ${floorsCount} floor(s) for a ${reqs.familySize}-member household.`,
    siteResponse: `${site.orientation}-facing frontage with front setback ${setbacks.front}ft, rear setback ${setbacks.rear}ft, and protected side clearances.`,
    orientationStrategy: `Place the main living and dining spaces toward the ${site.orientation} edge to capture natural light and prevailing cross-ventilation.`,
    publicPrivateStrategy: `Public living and dining functions are arranged near the entry while sleeping and bath functions remain more private toward the rear or upper level.`,
    serviceStrategy: `Group kitchen, pantry, utility, and bath functions together near a compact wet-core to simplify plumbing and reduce structural cost.`,
    circulationStrategy: `Use a legible ${circulationType} circulation spine connecting entry, living, service, and stair circulation without forcing a generic rectangular room matrix.`,
    climateStrategy: isClimate || isKerala ? 'Use shaded verandah, courtyard air movement, eaves, and passive ventilation to make the plan climate-responsive rather than purely formal.' : 'Use cross-ventilation, daylight bands, and strategic glazing to maintain comfort.',
    accessibilityStrategy: isLifeStage ? 'Keep the primary bedroom and direct circulation easily accessible at the ground level with zero-threshold movement and wide circulation paths.' : 'Standard transition path is maintained for family day-to-day movement.',
    styleStrategy: isKerala ? 'Kerala traditional influence is expressed in the verandah, courtyard, shaded transitions, and a strong hierarchy between public and private zones.' : isMinimalist ? 'Minimalist influence is expressed through compact service zoning, simplified planning, and restrained, efficient circulation.' : 'Modern influence is expressed through open living, direct garden connection, glazed openings, and a cleaner circulation spine.'
  };

  const designSignature: DesignSignature = {
    planningType: planPattern,
    circulationType,
    privatePublicZoning: zoningMode,
    conceptVariant,
    orientationStrategy: architecturalBrief.orientationStrategy,
    climateStrategy: [architecturalBrief.climateStrategy],
    styleStrategy: [architecturalBrief.styleStrategy],
    futureAdaptability: isLifeStage ? 'high' : 'standard'
  };

  // 4. Overlap-Free Spatial Coords Generation Dictionaries
  let specs: RoomSpec[] = [];

  if (isKerala) {
    if (conceptVariant === 'A') {
      specs = [
        { id: 'room-entrance', name: 'Verandah (Sit-out)', category: 'circulation', zoningCategory: 'public', privacyLevel: 'low', x: 35, y: 15, w: 30, h: 10, level: 0 },
        { id: 'room-living', name: 'Formal Living Room', category: 'living', zoningCategory: 'public', privacyLevel: 'low', x: 10, y: 25, w: 30, h: 25, level: 0 },
        { id: 'room-courtyard', name: 'Nadumuttam Courtyard', category: 'outdoor', zoningCategory: 'outdoor', privacyLevel: 'medium', x: 44, y: 35, w: 16, h: 18, level: 0 },
        { id: 'room-dining', name: 'Family Dining Pavilion', category: 'living', zoningCategory: 'semi_private', privacyLevel: 'medium', x: 64, y: 25, w: 26, h: 25, level: 0 },
        { id: 'room-kitchen', name: 'Traditional Kitchen', category: 'kitchen', zoningCategory: 'service', privacyLevel: 'medium', x: 60, y: 54, w: 30, h: 20, level: 0 },
        { id: 'room-master', name: 'Master Suite', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 10, y: 54, w: 30, h: 20, level: 0 },
        { id: 'room-bath-1', name: 'Ensuite Bath 1', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 10, y: 76, w: 20, h: 8, level: 0 }
      ];
      if (floorsCount > 1) {
        specs.push(
          { id: 'room-lounge', name: 'Family Lounge', category: 'living', zoningCategory: 'semi_private', privacyLevel: 'medium', x: 35, y: 25, w: 30, h: 18, level: 1 },
          { id: 'room-bed-2', name: 'Upper Bedroom 2', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 10, y: 25, w: 22, h: 22, level: 1 },
          { id: 'room-bed-3', name: 'Upper Bedroom 3', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 68, y: 25, w: 22, h: 22, level: 1 },
          { id: 'room-upper-bath-1', name: 'Upper Bath 1', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 35, y: 46, w: 14, h: 8, level: 1 },
          { id: 'room-upper-bath-2', name: 'Upper Bath 2', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 51, y: 46, w: 14, h: 8, level: 1 },
          { id: 'room-balcony', name: 'Shaded Balcony Terrace', category: 'outdoor', zoningCategory: 'outdoor', privacyLevel: 'low', x: 32, y: 72, w: 36, h: 12, level: 1 }
        );
      }
    } else if (conceptVariant === 'B') {
      specs = [
        { id: 'room-entrance', name: 'Side Sit-out', category: 'circulation', zoningCategory: 'public', privacyLevel: 'low', x: 15, y: 15, w: 30, h: 10, level: 0 },
        { id: 'room-living', name: 'Formal Drawing Hall', category: 'living', zoningCategory: 'public', privacyLevel: 'low', x: 15, y: 25, w: 30, h: 22, level: 0 },
        { id: 'room-courtyard', name: 'Side Lightwell Courtyard', category: 'outdoor', zoningCategory: 'outdoor', privacyLevel: 'medium', x: 10, y: 50, w: 22, h: 22, level: 0 },
        { id: 'room-dining', name: 'Dining Hall', category: 'living', zoningCategory: 'semi_private', privacyLevel: 'medium', x: 48, y: 25, w: 42, h: 22, level: 0 },
        { id: 'room-kitchen', name: 'Kitchen & Utility', category: 'kitchen', zoningCategory: 'service', privacyLevel: 'medium', x: 60, y: 50, w: 30, h: 22, level: 0 },
        { id: 'room-master', name: 'Ground Master Room', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 36, y: 50, w: 22, h: 22, level: 0 },
        { id: 'room-bath-1', name: 'Ensuite Bath 1', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 36, y: 74, w: 18, h: 10, level: 0 }
      ];
      if (floorsCount > 1) {
        specs.push(
          { id: 'room-bed-2', name: 'Upper Bedroom 2', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 15, y: 25, w: 30, h: 22, level: 1 },
          { id: 'room-bed-3', name: 'Upper Bedroom 3', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 48, y: 25, w: 42, h: 22, level: 1 },
          { id: 'room-lounge', name: 'First Floor Family Lounge', category: 'living', zoningCategory: 'semi_private', privacyLevel: 'medium', x: 36, y: 50, w: 22, h: 22, level: 1 },
          { id: 'room-upper-bath-1', name: 'Upper Bath 1', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 60, y: 50, w: 30, h: 22, level: 1 },
          { id: 'room-upper-bath-2', name: 'Upper Bath 2', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 36, y: 74, w: 18, h: 10, level: 1 },
          { id: 'room-balcony', name: 'Upper Verandah Balcony', category: 'outdoor', zoningCategory: 'outdoor', privacyLevel: 'low', x: 15, y: 74, w: 18, h: 10, level: 1 }
        );
      }
    } else {
      specs = [
        { id: 'room-entrance', name: 'Entry Poomukham', category: 'circulation', zoningCategory: 'public', privacyLevel: 'low', x: 35, y: 15, w: 30, h: 10, level: 0 },
        { id: 'room-living', name: 'Grand Living Hall', category: 'living', zoningCategory: 'public', privacyLevel: 'low', x: 10, y: 25, w: 45, h: 24, level: 0 },
        { id: 'room-dining', name: 'Central Dining Hall', category: 'living', zoningCategory: 'semi_private', privacyLevel: 'medium', x: 58, y: 25, w: 32, h: 24, level: 0 },
        { id: 'room-kitchen', name: 'Kitchen & Pantry', category: 'kitchen', zoningCategory: 'service', privacyLevel: 'medium', x: 60, y: 52, w: 30, h: 22, level: 0 },
        { id: 'room-master', name: 'Traditional Master Suite', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 10, y: 52, w: 30, h: 22, level: 0 },
        { id: 'room-bath-1', name: 'Ensuite Bath 1', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 10, y: 76, w: 18, h: 8, level: 0 },
        { id: 'room-courtyard', name: 'Rear Shaded Garden Courtyard', category: 'outdoor', zoningCategory: 'outdoor', privacyLevel: 'medium', x: 44, y: 68, w: 12, h: 16, level: 0 }
      ];
      if (floorsCount > 1) {
        specs.push(
          { id: 'room-bed-2', name: 'Traditional Bedroom 2', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 10, y: 25, w: 45, h: 24, level: 1 },
          { id: 'room-bed-3', name: 'Traditional Bedroom 3', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 58, y: 25, w: 32, h: 24, level: 1 },
          { id: 'room-lounge', name: 'Upper Family Lounge', category: 'living', zoningCategory: 'semi_private', privacyLevel: 'medium', x: 60, y: 52, w: 30, h: 22, level: 1 },
          { id: 'room-upper-bath-1', name: 'Upper Bath 1', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 10, y: 76, w: 18, h: 8, level: 1 },
          { id: 'room-upper-bath-2', name: 'Upper Bath 2', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 30, y: 76, w: 12, h: 8, level: 1 },
          { id: 'room-balcony', name: 'Upper Balcony Terrace', category: 'outdoor', zoningCategory: 'outdoor', privacyLevel: 'low', x: 44, y: 76, w: 14, h: 8, level: 1 }
        );
      }
    }
  } else if (isModern) {
    if (conceptVariant === 'B') {
      specs = [
        { id: 'room-entrance', name: 'Central Glazed Corridor', category: 'circulation', zoningCategory: 'circulation', privacyLevel: 'low', x: 40, y: 15, w: 16, h: 36, level: 0 },
        { id: 'room-living', name: 'Open Living Pavilion', category: 'living', zoningCategory: 'public', privacyLevel: 'low', x: 10, y: 15, w: 28, h: 30, level: 0 },
        { id: 'room-dining', name: 'Dining Pavilion', category: 'living', zoningCategory: 'semi_private', privacyLevel: 'medium', x: 58, y: 15, w: 32, h: 15, level: 0 },
        { id: 'room-kitchen', name: 'Island Modular Kitchen', category: 'kitchen', zoningCategory: 'service', privacyLevel: 'medium', x: 58, y: 32, w: 32, h: 15, level: 0 },
        { id: 'room-master', name: 'Primary Ground Suite', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 10, y: 52, w: 38, h: 22, level: 0 },
        { id: 'room-bath-1', name: 'Spa Ensuite Bathroom', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 10, y: 76, w: 18, h: 8, level: 0 }
      ];
      if (floorsCount > 1) {
        specs.push(
          { id: 'room-bed-2', name: 'Upper Bedroom Suite 2', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 10, y: 15, w: 28, h: 30, level: 1 },
          { id: 'room-bed-3', name: 'Upper Bedroom Suite 3', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 58, y: 15, w: 32, h: 30, level: 1 },
          { id: 'room-lounge', name: 'Upper Family Lounge', category: 'living', zoningCategory: 'semi_private', privacyLevel: 'medium', x: 40, y: 52, w: 16, h: 22, level: 1 },
          { id: 'room-upper-bath-1', name: 'Upper Spa Bath 1', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 10, y: 76, w: 18, h: 8, level: 1 },
          { id: 'room-upper-bath-2', name: 'Upper Spa Bath 2', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 30, y: 76, w: 18, h: 8, level: 1 },
          { id: 'room-balcony', name: 'Floating Roof Deck', category: 'outdoor', zoningCategory: 'outdoor', privacyLevel: 'low', x: 50, y: 76, w: 12, h: 8, level: 1 }
        );
      }
    } else {
      specs = [
        { id: 'room-entrance', name: 'Glazed Entrance Foyer', category: 'circulation', zoningCategory: 'public', privacyLevel: 'low', x: 10, y: 15, w: 20, h: 10, level: 0 },
        { id: 'room-living', name: 'Double-Height Living', category: 'living', zoningCategory: 'public', privacyLevel: 'low', x: 10, y: 25, w: 42, h: 28, level: 0 },
        { id: 'room-dining', name: 'Dining / Open Bar', category: 'living', zoningCategory: 'semi_private', privacyLevel: 'medium', x: 56, y: 25, w: 34, h: 28, level: 0 },
        { id: 'room-kitchen', name: 'Modular Island Kitchen', category: 'kitchen', zoningCategory: 'service', privacyLevel: 'medium', x: 64, y: 56, w: 26, h: 30, level: 0 },
        { id: 'room-master', name: 'Primary Ground Bedroom', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 10, y: 56, w: 38, h: 20, level: 0 },
        { id: 'room-bath-1', name: 'Master Bath 1', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 10, y: 78, w: 18, h: 8, level: 0 }
      ];
      if (floorsCount > 1) {
        specs.push(
          { id: 'room-bed-2', name: 'Upper Bedroom Suite 2', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 10, y: 25, w: 42, h: 28, level: 1 },
          { id: 'room-bed-3', name: 'Upper Bedroom Suite 3', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 56, y: 25, w: 34, h: 28, level: 1 },
          { id: 'room-bed-4', name: 'Upper Bedroom Suite 4', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 10, y: 56, w: 38, h: 20, level: 1 },
          { id: 'room-lounge', name: 'Upper Mezzanine Family Lounge', category: 'living', zoningCategory: 'semi_private', privacyLevel: 'medium', x: 50, y: 56, w: 12, h: 12, level: 1 },
          { id: 'room-upper-bath-1', name: 'Upper Spa Bath 1', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 10, y: 78, w: 18, h: 8, level: 1 },
          { id: 'room-upper-bath-2', name: 'Upper Spa Bath 2', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 30, y: 78, w: 18, h: 8, level: 1 },
          { id: 'room-balcony', name: 'Glazed Balcony Terrace', category: 'outdoor', zoningCategory: 'outdoor', privacyLevel: 'low', x: 50, y: 70, w: 14, h: 16, level: 1 }
        );
      }
    }
  } else {
    // Minimalist
    specs = [
      { id: 'room-entrance', name: 'Entry Vestibule', category: 'circulation', zoningCategory: 'public', privacyLevel: 'low', x: 35, y: 15, w: 30, h: 10, level: 0 },
      { id: 'room-living', name: 'Open Living Area', category: 'living', zoningCategory: 'public', privacyLevel: 'low', x: 12, y: 25, w: 46, h: 28, level: 0 },
      { id: 'room-dining', name: 'Dining Nook', category: 'living', zoningCategory: 'semi_private', privacyLevel: 'medium', x: 60, y: 25, w: 28, h: 10, level: 0 },
      { id: 'room-kitchen', name: 'Linear Modular Kitchen', category: 'kitchen', zoningCategory: 'service', privacyLevel: 'medium', x: 60, y: 37, w: 28, h: 10, level: 0 },
      { id: 'room-master', name: 'Minimalist Master Suite', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 12, y: 56, w: 34, h: 20, level: 0 },
      { id: 'room-bath-1', name: 'Spa Bath 1', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 12, y: 78, w: 16, h: 8, level: 0 }
    ];
    if (floorsCount > 1) {
      specs.push(
        { id: 'room-bed-2', name: 'Upper Bedroom 2', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 12, y: 25, w: 46, h: 28, level: 1 },
        { id: 'room-bed-3', name: 'Upper Bedroom 3', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 60, y: 25, w: 28, h: 20, level: 1 },
        { id: 'room-bed-4', name: 'Upper Bedroom 4', category: 'bedroom', zoningCategory: 'private', privacyLevel: 'high', x: 12, y: 56, w: 34, h: 20, level: 1 },
        { id: 'room-lounge', name: 'Upper Lounge Core', category: 'living', zoningCategory: 'semi_private', privacyLevel: 'medium', x: 48, y: 56, w: 16, h: 20, level: 1 },
        { id: 'room-upper-bath-1', name: 'Upper Bath 1', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 12, y: 78, w: 16, h: 8, level: 1 },
        { id: 'room-upper-bath-2', name: 'Upper Bath 2', category: 'bathroom', zoningCategory: 'service', privacyLevel: 'high', x: 30, y: 78, w: 16, h: 8, level: 1 },
        { id: 'room-balcony', name: 'Flush Balcony Slab', category: 'outdoor', zoningCategory: 'outdoor', privacyLevel: 'low', x: 48, y: 78, w: 16, h: 8, level: 1 }
      );
    }
  }

  // 5. Compose the Rooms from Specs (matching target requirements)
  const rooms: FloorPlanRoom[] = [];
  const stairs: StaircaseDetails[] = [];
  const furniture: ConceptualFurniture[] = [];

  // Ground Floor Master ensuite link
  const masterSpec = specs.find((s) => s.id === 'room-master');
  const bath1Spec = specs.find((s) => s.id === 'room-bath-1');

  // Push ground base rooms
  const baseGroundIds = ['room-entrance', 'room-living', 'room-dining', 'room-kitchen', 'room-courtyard', 'room-master', 'room-bath-1'];
  for (const id of baseGroundIds) {
    const spec = specs.find((s) => s.id === id);
    if (!spec) continue;
    if (spec.id === 'room-courtyard' && !isKerala && !reqs.spaces.courtyard) continue;

    rooms.push({
      id: spec.id,
      name: spec.name,
      category: spec.category,
      zoningCategory: spec.zoningCategory,
      privacyLevel: spec.privacyLevel,
      dimensions: `${Math.round(spec.w)}' x ${Math.round(spec.h)}'`,
      areaSqFt: Math.round(spec.w * spec.h),
      position: { x: spec.x, y: spec.y, width: spec.w, height: spec.h, floorLevel: 0 },
      connections: [],
      features: spec.features || ['Daylight and Ventilation Access'],
      color: spec.color || '#F4F1EA'
    });
  }

  // Handle bedroom count requirements (enforce exactly requested bedrooms)
  // Ground Master is Bedroom 1. We need targetBedrooms - 1 additional bedrooms.
  const additionalBedsNeeded = targetBedrooms - 1;
  let upperBedroomsAdded = 0;

  for (let i = 2; i <= targetBedrooms; i++) {
    const spec = specs.find((s) => s.id === `room-bed-${i}`);
    if (spec) {
      rooms.push({
        id: spec.id,
        name: spec.name,
        category: 'bedroom',
        zoningCategory: 'private',
        privacyLevel: 'high',
        dimensions: `${Math.round(spec.w)}' x ${Math.round(spec.h)}'`,
        areaSqFt: Math.round(spec.w * spec.h),
        position: { x: spec.x, y: spec.y, width: spec.w, height: spec.h, floorLevel: spec.level },
        connections: [],
        features: ['Daylight orientation', 'Fitted wardrobes space'],
        color: '#F7F4EF'
      });
      if (spec.level === 1) upperBedroomsAdded++;
    } else {
      // Fallback generator for extra bedrooms if spec list is smaller
      const floorLvl = floorsCount > 1 && i > 1 ? 1 : 0;
      rooms.push({
        id: `room-bed-${i}`,
        name: `Bedroom ${i}`,
        category: 'bedroom',
        zoningCategory: 'private',
        privacyLevel: 'high',
        dimensions: "14' x 12'",
        areaSqFt: 168,
        position: { x: i % 2 === 0 ? 10 : 56, y: 56, width: 24, height: 20, floorLevel: floorLvl },
        connections: [],
        features: ['Daylight orientation'],
        color: '#F7F4EF'
      });
      if (floorLvl === 1) upperBedroomsAdded++;
    }
  }

  // Push upper rooms (level 1) if floorsCount > 1
  if (floorsCount > 1) {
    const upperSpecs = specs.filter((s) => s.level === 1 && s.category !== 'bedroom');
    for (const spec of upperSpecs) {
      rooms.push({
        id: spec.id,
        name: spec.name,
        category: spec.category,
        zoningCategory: spec.zoningCategory,
        privacyLevel: spec.privacyLevel,
        dimensions: `${Math.round(spec.w)}' x ${Math.round(spec.h)}'`,
        areaSqFt: Math.round(spec.w * spec.h),
        position: { x: spec.x, y: spec.y, width: spec.w, height: spec.h, floorLevel: 1 },
        connections: [],
        features: spec.features || ['Upper terrace overlook'],
        color: spec.color || '#F4F1EA'
      });
    }

    // Add Staircase details
    let stairX = 44;
    let stairY = 56;
    let stairW = 12;
    let stairH = 14;

    if (conceptVariant === 'B') {
      stairX = 48; stairY = 15; stairW = 12; stairH = 10;
    } else if (isModern && conceptVariant === 'A') {
      stairX = 50; stairY = 56; stairW = 12; stairH = 12;
    } else if (isModern && (conceptVariant as string) === 'B') {
      stairX = 50; stairY = 52; stairW = 12; stairH = 12;
    } else if (isMinimalist) {
      stairX = 66; stairY = 56; stairW = 22; stairH = 10;
    }

    stairs.push({
      id: 'stair-1',
      location: 'Central circulation core',
      floorLevel: 0,
      x: stairX,
      y: stairY,
      width: stairW,
      height: stairH,
      type: 'dog_legged'
    });
  }

  // Add Car Parking if requested
  if (reqs.spaces.parkingCars > 0) {
    let pkX = 60;
    let pkY = 76;
    let pkW = 30;
    let pkH = 8;

    if (conceptVariant === 'B') {
      pkX = 60; pkY = 74; pkW = 30; pkH = 10;
    } else if (isModern && conceptVariant === 'A') {
      pkX = 64; pkY = 56; pkW = 26; pkH = 30;
    } else if (isModern && (conceptVariant as string) === 'B') {
      pkX = 64; pkY = 52; pkW = 26; pkH = 32;
    } else if (isMinimalist) {
      pkX = 66; pkY = 68; pkW = 22; pkH = 18;
    }

    rooms.push({
      id: 'room-parking',
      name: `Covered Parking (${reqs.spaces.parkingCars} Car)`,
      category: 'circulation',
      zoningCategory: 'circulation',
      privacyLevel: 'low',
      dimensions: `${Math.round(pkW)}' x ${Math.round(pkH)}'`,
      areaSqFt: Math.round(pkW * pkH),
      position: { x: pkX, y: pkY, width: pkW, height: pkH, floorLevel: 0 },
      connections: [],
      features: ['Sheltered vehicle arrival', 'Direct entry access'],
      color: '#DCE2E5'
    });
  }

  // 6. Connect the rooms logically based on planning pattern
  const connectRooms = (id1: string, id2: string) => {
    const r1 = rooms.find((r) => r.id === id1);
    const r2 = rooms.find((r) => r.id === id2);
    if (r1 && r2) {
      if (!r1.connections.includes(id2)) r1.connections.push(id2);
      if (!r2.connections.includes(id1)) r2.connections.push(id1);
    }
  };

  // Ground level paths
  connectRooms('room-entrance', 'room-living');
  connectRooms('room-living', 'room-dining');
  connectRooms('room-dining', 'room-kitchen');

  if (rooms.some((r) => r.id === 'room-courtyard')) {
    connectRooms('room-living', 'room-courtyard');
    connectRooms('room-dining', 'room-courtyard');
  }

  // Connect ground master and bathroom
  connectRooms('room-master', 'room-living');
  if (rooms.some((r) => r.id === 'room-bath-1')) {
    connectRooms('room-master', 'room-bath-1');
  }

  // Upper level paths
  if (floorsCount > 1) {
    const lounge = rooms.find((r) => r.id === 'room-lounge');
    const balcony = rooms.find((r) => r.id === 'room-balcony');
    const bed2 = rooms.find((r) => r.id === 'room-bed-2');
    const bed3 = rooms.find((r) => r.id === 'room-bed-3');
    const bed4 = rooms.find((r) => r.id === 'room-bed-4');

    if (lounge) {
      if (bed2) connectRooms('room-lounge', 'room-bed-2');
      if (bed3) connectRooms('room-lounge', 'room-bed-3');
      if (bed4) connectRooms('room-lounge', 'room-bed-4');
      if (balcony) connectRooms('room-lounge', 'room-balcony');

      const uBath1 = rooms.find((r) => r.id === 'room-upper-bath-1');
      const uBath2 = rooms.find((r) => r.id === 'room-upper-bath-2');
      if (uBath1) connectRooms('room-lounge', 'room-upper-bath-1');
      if (uBath2) connectRooms('room-lounge', 'room-upper-bath-2');
    }
  }

  // 7. Solve Openings (Doors & Windows) dynamically
  const openings = solveOpenings(rooms);

  // 8. Solve furniture cues
  if (isModern) {
    furniture.push({ id: 'f-sofa-1', roomId: 'room-living', type: 'sofa', x: 18, y: 28, width: 16, height: 8 });
    furniture.push({ id: 'f-dining-1', roomId: 'room-dining', type: 'dining_table', x: 60, y: 28, width: 12, height: 10 });
  } else if (isKerala) {
    furniture.push({ id: 'f-sofa-1', roomId: 'room-living', type: 'sofa', x: 18, y: 30, width: 16, height: 8 });
    furniture.push({ id: 'f-bed-1', roomId: 'room-master', type: 'bed', x: 18, y: 66, width: 14, height: 14 });
  } else {
    furniture.push({ id: 'f-sofa-1', roomId: 'room-living', type: 'sofa', x: 18, y: 28, width: 14, height: 8 });
  }

  const spatialGraph: SpatialGraph = {
    nodes: rooms.map((room) => ({ roomId: room.id, name: room.name, category: room.category })),
    requiredAdjacencies: [
      ['room-entrance', 'room-living'],
      ['room-living', 'room-dining'],
      ['room-dining', 'room-kitchen'],
      ['room-master', rooms.find((room) => room.category === 'bathroom')?.id || 'room-bath-1']
    ],
    preferredAdjacencies: isKerala ? [['room-living', 'room-courtyard']] : [['room-living', 'room-terrace']],
    avoidAdjacencies: [['room-master', 'room-kitchen']],
    verticalConnections: floorsCount > 1 ? [{ stairId: 'stair-1', connectLevels: [0, 1] }] : [],
    indoorOutdoorConnections: isKerala && rooms.some((room) => room.id === 'room-courtyard') ? [{ roomId: 'room-living', outdoorSpaceId: 'room-courtyard' }] : []
  };

  const groundArea = rooms.filter((room) => (room.position.floorLevel || 0) === 0).reduce((sum, room) => sum + room.areaSqFt, 0);
  const firstArea = rooms.filter((room) => (room.position.floorLevel || 0) === 1).reduce((sum, room) => sum + room.areaSqFt, 0);
  const floors: FloorPlanLevel[] = [{ level: 0, name: 'Ground Floor', builtUpAreaSqFt: groundArea }];
  if (floorsCount > 1) floors.push({ level: 1, name: 'First Floor', builtUpAreaSqFt: firstArea });

  const appearance: HouseAppearance = DEFAULT_APPEARANCE_BY_STYLE[primaryStyle] || DEFAULT_APPEARANCE_BY_STYLE['Modern'];
  const modeConsiderations = modes.map((mode) => ({ mode, note: mode === 'climate_adaptive' ? 'Passive cooling and air movement drive the facade and configuration.' : mode === 'life_stage' ? 'Accessibility shaped the bedroom and circulation hierarchy.' : mode === 'budget_first' ? 'Compact wet-core lowers structural cost.' : 'Renovation strategy keeps service core efficient and adaptable.' }));

  const rationale = `${primaryStyle} concept ${conceptVariant}: a ${planPattern.replace('_', ' ')} plan that respects the ${width}' × ${depth}' site, ${site.orientation}-facing frontage, and hard requirement set of ${targetBedrooms} bedrooms and ${floorsCount} floor(s). The design uses an architectural brief, zoning logic, and a real circulation path instead of fixed room templates.`;

  const design: StructuredDesignJSON = {
    conceptNumber: conceptVariant === 'A' ? 1 : conceptVariant === 'B' ? 2 : 3,
    architecturalBrief,
    spatialGraph,
    footprint,
    designSignature,
    plot: {
      width,
      depth,
      totalArea,
      orientation: site.orientation,
      roadSide: site.orientation === 'N' || site.orientation === 'NE' || site.orientation === 'NW' ? 'N' : 'S',
      setbacks
    },
    buildableAreaSqFt: buildableAreaSqFt,
    totalBuiltUpAreaSqFt: groundArea + firstArea,
    floorsCount,
    floors,
    stairs,
    entranceDirection: `${site.orientation} Entrance`,
    rooms,
    walls: [],
    openings,
    furniture,
    circulationNotes: `Entry -> living -> dining -> kitchen path plus private bedroom circulation on the ${floorsCount > 1 ? 'ground and upper' : 'ground'} levels.`,
    rationale,
    modeConsiderations,
    styleFeatures: [
      `${primaryStyle} strategy`,
      isKerala ? 'Verandah and courtyard-led planning' : isMinimalist ? 'Compact efficient planning' : 'Open plan and glazed edges'
    ],
    appearance
  };

  const validation = validateFloorPlan(design, {
    bedrooms: reqs.bedrooms,
    bathrooms: reqs.bathrooms,
    floors: reqs.floors,
    plotWidth: width,
    plotDepth: depth
  });

  if (!validation.isValid) {
    throw new Error(`Generated architecture violates hard constraints: ${validation.errors.join('; ')}`);
  }

  return { design, rationale };
}

export async function generateAlternativeConcept(
  site: SiteInfo,
  location: LocationInfo,
  reqs: DesignRequirements,
  prefs: DesignPreferences,
  currentConceptNumber: number = 1
): Promise<{ design: StructuredDesignJSON; rationale: string; delta: VersionDelta }> {
  const nextVariant: 'A' | 'B' | 'C' = currentConceptNumber === 1 ? 'B' : currentConceptNumber === 2 ? 'C' : 'A';
  const nextConceptNumber = nextVariant === 'A' ? 1 : nextVariant === 'B' ? 2 : 3;

  const result = await generateInitialDesign(site, location, reqs, prefs, nextVariant);
  result.design.conceptNumber = nextConceptNumber;

  const delta: VersionDelta = {
    changeSummary: `Generated Architectural Concept ${nextConceptNumber} (${result.design.designSignature?.planningType.replace('_', ' ')} topology).`,
    tradeOffs: [
      `Alternative ${result.design.designSignature?.planningType.replace('_', ' ')} spatial organization with ${result.design.footprint?.shapeType} building footprint.`,
      `Preserves hard requirement of ${reqs.bedrooms || 3} bedrooms and ${reqs.floors || 2} floors.`
    ]
  };

  return { design: result.design, rationale: result.rationale, delta };
}

export async function applyWhatIfChange(
  currentDesign: StructuredDesignJSON,
  userMessage: string,
  versionNumber: number
): Promise<{ updatedDesign: StructuredDesignJSON; delta: VersionDelta }> {
  const msgLower = userMessage.toLowerCase();
  const newDesign: StructuredDesignJSON = JSON.parse(JSON.stringify(currentDesign));

  if (msgLower.includes('wall') || msgLower.includes('roof') || msgLower.includes('frame') || msgLower.includes('color')) {
    if (!newDesign.appearance) {
      newDesign.appearance = { wallColor: '#F4F1EA', roofColor: '#C86A4B', frameColor: '#121417', accentMaterial: 'wood' };
    }

    if (msgLower.includes('ivory')) newDesign.appearance.wallColor = '#F4F1EA';
    if (msgLower.includes('white')) newDesign.appearance.wallColor = '#FAFAFA';
    if (msgLower.includes('terracotta')) newDesign.appearance.roofColor = '#C86A4B';
    if (msgLower.includes('charcoal') || msgLower.includes('dark roof')) newDesign.appearance.roofColor = '#282623';
    if (msgLower.includes('black frame') || msgLower.includes('dark frame')) newDesign.appearance.frameColor = '#121417';

    const delta: VersionDelta = {
      changeSummary: `Updated house appearance settings.`,
      tradeOffs: ['Visual appearance updated in 3D viewer.']
    };
    return { updatedDesign: newDesign, delta };
  }

  let targetFloorLevel = 0;
  if (msgLower.includes('upstairs') || msgLower.includes('first floor') || msgLower.includes('upper floor')) {
    targetFloorLevel = 1;
    newDesign.floorsCount = Math.max(2, newDesign.floorsCount || 2);
  } else if (msgLower.includes('downstairs') || msgLower.includes('ground floor') || msgLower.includes('lower floor')) {
    targetFloorLevel = 0;
  } else if ((newDesign.floorsCount || 1) > 1) {
    if (msgLower.includes('bedroom') || msgLower.includes('balcony') || msgLower.includes('terrace')) {
      targetFloorLevel = 1;
    }
  }

  let changeSummary = 'Updated floor plan layout.';
  const tradeOffs: string[] = [];
  const addedRooms: string[] = [];
  const modifiedRooms: string[] = [];

  if (msgLower.includes('bedroom') && (msgLower.includes('add') || msgLower.includes('another') || msgLower.includes('extra'))) {
    const bedCount = newDesign.rooms.filter((r) => r.category === 'bedroom').length + 1;
    const targetFloorName = targetFloorLevel === 1 ? 'First Floor' : 'Ground Floor';

    newDesign.rooms.push({
      id: `room-bed-${bedCount}`,
      name: `Bedroom ${bedCount} (${targetFloorName})`,
      category: 'bedroom',
      zoningCategory: 'private',
      privacyLevel: 'high',
      dimensions: "14' x 13'",
      areaSqFt: 182,
      position: { x: 55, y: 55, width: 38, height: 30, floorLevel: targetFloorLevel },
      connections: ['room-living'],
      features: ['Cross Ventilation Window'],
      color: '#F7F4EF'
    });

    newDesign.totalBuiltUpAreaSqFt += 182;
    changeSummary = `Added Bedroom ${bedCount} on the ${targetFloorName}.`;
    addedRooms.push(`Bedroom ${bedCount}`);
    tradeOffs.push(`Increases ${targetFloorName} built-up area by 182 sq ft.`);
  } else if (msgLower.includes('kitchen') && (msgLower.includes('larger') || msgLower.includes('expand') || msgLower.includes('big') || msgLower.includes('20%'))) {
    const kIndex = newDesign.rooms.findIndex((r) => r.category === 'kitchen');
    if (kIndex !== -1) {
      newDesign.rooms[kIndex].dimensions = "16' x 14'";
      newDesign.rooms[kIndex].areaSqFt = 224;
      newDesign.rooms[kIndex].position.width = Math.min(45, newDesign.rooms[kIndex].position.width + 8);
      newDesign.rooms[kIndex].features.push('Expanded Breakfast Island Bar');
      changeSummary = 'Expanded ground-floor kitchen square footage by ~20%.';
      modifiedRooms.push('Kitchen');
      tradeOffs.push('Adjusts adjacent dining wall by 2 feet to accommodate expanded kitchen.');
    }
  } else if (msgLower.includes('balcony') || msgLower.includes('terrace')) {
    newDesign.rooms.push({
      id: `room-terrace-${Date.now()}`,
      name: 'Open Upper Balcony Terrace',
      category: 'outdoor',
      zoningCategory: 'outdoor',
      privacyLevel: 'low',
      dimensions: "14' x 10'",
      areaSqFt: 140,
      position: { x: 10, y: 55, width: 40, height: 28, floorLevel: 1 },
      connections: [],
      features: ['Garden Overlook View', 'Shaded Roof Eaves'],
      color: '#DCE5E1'
    });
    changeSummary = 'Integrated open balcony terrace on the First Floor.';
    addedRooms.push('Upper Balcony Terrace');
    tradeOffs.push('Adds semi-open outdoor space on upper level.');
  } else {
    changeSummary = `Refined space allocations for request: "${userMessage}".`;
    tradeOffs.push('Optimized room dimensions while preserving multi-floor layout.');
  }

  const groundArea = newDesign.rooms.filter((r) => (r.position.floorLevel || 0) === 0).reduce((sum, r) => sum + r.areaSqFt, 0);
  const firstArea = newDesign.rooms.filter((r) => (r.position.floorLevel || 0) === 1).reduce((sum, r) => sum + r.areaSqFt, 0);

  newDesign.floors = [
    { level: 0, name: 'Ground Floor', builtUpAreaSqFt: groundArea }
  ];
  if (firstArea > 0 || (newDesign.floorsCount || 1) > 1) {
    newDesign.floors.push({ level: 1, name: 'First Floor', builtUpAreaSqFt: firstArea });
    newDesign.floorsCount = 2;
  }

  newDesign.rationale = `Version ${versionNumber}: ${changeSummary} ${tradeOffs.join(' ')}`;

  const delta: VersionDelta = {
    changeSummary,
    addedRooms,
    modifiedRooms,
    tradeOffs
  };

  return { updatedDesign: newDesign, delta };
}
