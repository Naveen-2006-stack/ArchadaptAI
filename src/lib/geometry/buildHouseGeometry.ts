import { StructuredDesignJSON, FloorPlanRoom, HouseAppearance } from '@/types/architectural';
import { normalizeStyleName, NormalizedStyle } from '@/lib/design/styleNormalizer';

export interface RoomMesh3D {
  id: string;
  name: string;
  category: string;
  position: [number, number, number]; // [x, y, z]
  size: [number, number, number]; // [width, height, depth]
  color: string;
  isCourtyard: boolean;
  floorLevel: number;
}

export interface RoofMesh3D {
  type: 'sloped_hipped_gable' | 'flat_parapet' | 'minimal_slab';
  position: [number, number, number];
  size: [number, number, number]; // [width, height, depth]
  color: string;
  pitchAngle?: number;
  overhang: number;
}

export interface BalconyRail3D {
  position: [number, number, number];
  size: [number, number, number];
  type: 'glass' | 'timber' | 'metal';
}

export interface VerandahPillar3D {
  position: [number, number, number];
  height: number;
  radius: number;
}

export interface HouseGeometry3D {
  plinthSize: [number, number, number];
  plinthPosition: [number, number, number];
  lawnSize: [number, number, number];
  lawnPosition: [number, number, number];
  drivewaySize: [number, number, number];
  drivewayPosition: [number, number, number];
  floorSlabs: { position: [number, number, number]; size: [number, number, number] }[];
  rooms: RoomMesh3D[];
  roofs: RoofMesh3D[];
  balconyRailings: BalconyRail3D[];
  pillars: VerandahPillar3D[];
  totalFloors: number;
  normalizedStyle: NormalizedStyle;
  styleName: string;
  appearance: HouseAppearance;
  cameraTarget: [number, number, number];
  recommendedCameraDistance: number;
}

/**
 * Builds a deterministic, multi-floor 3D house representation from a StructuredDesignJSON object,
 * incorporating facade depth, balcony railings, verandah pillars, landscape grounds, and style-aware roof geometry.
 */
export function buildHouseGeometry(design: StructuredDesignJSON): HouseGeometry3D {
  const plotWidth = design.plot?.width || 40;
  const plotDepth = design.plot?.depth || 60;

  const SCALE_X = 14;
  const SCALE_Z = 14;
  const STORY_HEIGHT = 2.8;

  // Determine overall bounds across ALL floors
  let minX = 100, maxX = 0, minY = 100, maxY = 0;
  design.rooms.forEach((r) => {
    if (r.position.x < minX) minX = r.position.x;
    if (r.position.x + r.position.width > maxX) maxX = r.position.x + r.position.width;
    if (r.position.y < minY) minY = r.position.y;
    if (r.position.y + r.position.height > maxY) maxY = r.position.y + r.position.height;
  });

  if (minX > maxX) { minX = 10; maxX = 90; minY = 10; maxY = 90; }

  const boundWidthPct = Math.max(30, maxX - minX);
  const boundDepthPct = Math.max(30, maxY - minY);

  const plinthW = (boundWidthPct / 100) * SCALE_X + 0.8;
  const plinthD = (boundDepthPct / 100) * SCALE_Z + 0.8;
  const plinthCenterX = (((minX + maxX) / 2) / 100) * SCALE_X - SCALE_X / 2;
  const plinthCenterZ = (((minY + maxY) / 2) / 100) * SCALE_Z - SCALE_Z / 2;

  // Site Landscape: Lawn & Driveway
  const lawnW = plinthW + 6;
  const lawnD = plinthD + 8;
  const drivewayW = 3.5;
  const drivewayD = 5.5;

  // 1. Build Room Meshes
  const balconyRailings: BalconyRail3D[] = [];
  const pillars: VerandahPillar3D[] = [];

  const roomMeshes: RoomMesh3D[] = design.rooms.map((room) => {
    const width = (room.position.width / 100) * SCALE_X;
    const depth = (room.position.height / 100) * SCALE_Z;
    const posX = ((room.position.x + room.position.width / 2) / 100) * SCALE_X - SCALE_X / 2;
    const posZ = ((room.position.y + room.position.height / 2) / 100) * SCALE_Z - SCALE_Z / 2;
    
    const level = room.position.floorLevel || 0;
    const roomHeight = room.category === 'living' ? STORY_HEIGHT + 0.4 : STORY_HEIGHT;
    const posY = level * STORY_HEIGHT + roomHeight / 2 + 0.2;

    const isCourtyard = room.id === 'room-courtyard' || room.category === 'outdoor' || room.name.toLowerCase().includes('courtyard') || room.name.toLowerCase().includes('nadumuttam');

    let color = '#EAE6DF';
    if (isCourtyard) color = '#3F6253';
    else if (room.category === 'bedroom') color = '#F7F4EF';
    else if (room.category === 'living') color = '#F4F1EA';
    else if (room.category === 'kitchen') color = '#E0DDD7';
    else if (room.category === 'circulation') color = '#D6D1C7';

    // Balcony Railings on upper outdoor spaces
    if (level === 1 && (room.category === 'outdoor' || room.name.toLowerCase().includes('balcony') || room.name.toLowerCase().includes('terrace'))) {
      balconyRailings.push({
        position: [posX, posY - roomHeight / 2 + 0.5, posZ + depth / 2 - 0.05],
        size: [width, 0.9, 0.08],
        type: 'glass'
      });
    }

    // Verandah Pillars on ground entrance sit-out
    if (level === 0 && (room.name.toLowerCase().includes('verandah') || room.name.toLowerCase().includes('sit-out') || room.name.toLowerCase().includes('foyer'))) {
      pillars.push(
        { position: [posX - width / 2 + 0.3, posY - roomHeight / 2 + STORY_HEIGHT / 2, posZ + depth / 2 - 0.3], height: STORY_HEIGHT, radius: 0.12 },
        { position: [posX + width / 2 - 0.3, posY - roomHeight / 2 + STORY_HEIGHT / 2, posZ + depth / 2 - 0.3], height: STORY_HEIGHT, radius: 0.12 }
      );
    }

    return {
      id: room.id,
      name: room.name,
      category: room.category,
      position: [posX, posY, posZ],
      size: [width, roomHeight, depth],
      color,
      isCourtyard,
      floorLevel: level
    };
  });

  const maxFloorLevel = Math.max(0, ...design.rooms.map((r) => r.position.floorLevel || 0));
  const totalFloors = Math.max(design.floorsCount || 1, maxFloorLevel + 1);

  // Intermediate Floor Slabs
  const floorSlabs: { position: [number, number, number]; size: [number, number, number] }[] = [];
  for (let fl = 1; fl < totalFloors; fl++) {
    floorSlabs.push({
      position: [plinthCenterX, fl * STORY_HEIGHT + 0.1, plinthCenterZ],
      size: [plinthW, 0.15, plinthD]
    });
  }

  // Canonical Style Normalization
  const normStyle = normalizeStyleName(
    design.designSignature?.styleStrategy?.[0],
    design.styleFeatures,
    design.rationale
  );

  const roofY = totalFloors * STORY_HEIGHT + 0.25;
  const roofs: RoofMesh3D[] = [];

  let styleDisplayName = 'Modern Architectural';

  if (normStyle === 'kerala_traditional' || normStyle === 'tropical' || normStyle === 'traditional_indian') {
    styleDisplayName = 'Kerala Traditional (Pitched Sloped Roof)';
    roofs.push({
      type: 'sloped_hipped_gable',
      position: [plinthCenterX, roofY + 0.8, plinthCenterZ],
      size: [plinthW + 1.2, 1.4, plinthD + 1.2],
      color: design.appearance?.roofColor || '#C86A4B',
      pitchAngle: 38,
      overhang: 0.8
    });
  } else if (normStyle === 'minimalist') {
    styleDisplayName = 'Minimalist (Clean Slabs)';
    roofs.push({
      type: 'minimal_slab',
      position: [plinthCenterX, roofY, plinthCenterZ],
      size: [plinthW + 0.1, 0.2, plinthD + 0.1],
      color: design.appearance?.roofColor || '#282623',
      overhang: 0.1
    });
  } else {
    styleDisplayName = 'Modern Architectural (Flat Parapet)';
    roofs.push({
      type: 'flat_parapet',
      position: [plinthCenterX, roofY + 0.1, plinthCenterZ],
      size: [plinthW + 0.3, 0.4, plinthD + 0.3],
      color: design.appearance?.roofColor || '#D0C9BE',
      overhang: 0.2
    });
  }

  const appearance: HouseAppearance = design.appearance || {
    wallColor: '#F4F1EA',
    roofColor: roofs[0]?.color || '#C86A4B',
    frameColor: '#121417',
    accentMaterial: 'wood'
  };

  const cameraTarget: [number, number, number] = [plinthCenterX, (totalFloors * STORY_HEIGHT) / 2, plinthCenterZ];
  const recommendedCameraDistance = Math.max(18, Math.max(plinthW, plinthD) * 1.5 + totalFloors * 2);

  return {
    plinthSize: [plinthW, 0.2, plinthD],
    plinthPosition: [plinthCenterX, 0.1, plinthCenterZ],
    lawnSize: [lawnW, 0.05, lawnD],
    lawnPosition: [plinthCenterX, -0.02, plinthCenterZ],
    drivewaySize: [drivewayW, 0.06, drivewayD],
    drivewayPosition: [plinthCenterX, 0.01, plinthCenterZ + plinthD / 2 + drivewayD / 2],
    floorSlabs,
    rooms: roomMeshes,
    roofs,
    balconyRailings,
    pillars,
    totalFloors,
    normalizedStyle: normStyle,
    styleName: styleDisplayName,
    appearance,
    cameraTarget,
    recommendedCameraDistance
  };
}
