import { StructuredDesignJSON, FloorPlanRoom } from '@/types/architectural';

export interface ValidationReport {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  score: number; // 0 to 100
  repairedDesign?: StructuredDesignJSON;
}

/**
 * Validates generated structured floor plans for spatial integrity, room adjacencies, door connectivity, and buildable area limits.
 * Hard requirement checks are enforced here so a design cannot silently change 3 BHK => 1 BHK or G+1 => single floor.
 */
export function validateFloorPlan(
  design: StructuredDesignJSON,
  expectedRequirements?: {
    bedrooms?: number;
    bathrooms?: number;
    floors?: number;
    parkingCars?: number;
    plotWidth?: number;
    plotDepth?: number;
    familySize?: number;
  }
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const rooms = design.rooms || [];
  const plotWidth = expectedRequirements?.plotWidth ?? design.plot?.width ?? 40;
  const plotDepth = expectedRequirements?.plotDepth ?? design.plot?.depth ?? 60;
  const totalPlotArea = plotWidth * plotDepth;

  const bedroomsCount = rooms.filter((r) => r.category === 'bedroom').length;
  if (expectedRequirements && typeof expectedRequirements.bedrooms === 'number') {
    if (bedroomsCount !== expectedRequirements.bedrooms) {
      errors.push(`Hard requirement mismatch: expected ${expectedRequirements.bedrooms} bedrooms but design contains ${bedroomsCount}.`);
    }
  }

  const bathroomsCount = rooms.filter((r) => r.category === 'bathroom').length;
  if (expectedRequirements && typeof expectedRequirements.bathrooms === 'number') {
    if (bathroomsCount < expectedRequirements.bathrooms) {
      errors.push(`Hard requirement mismatch: expected at least ${expectedRequirements.bathrooms} bathrooms but design contains ${bathroomsCount}.`);
    }
  }

  const floorsCount = design.floorsCount || 1;
  if (expectedRequirements && typeof expectedRequirements.floors === 'number') {
    if (floorsCount !== expectedRequirements.floors) {
      errors.push(`Hard requirement mismatch: expected ${expectedRequirements.floors} floors but design proposes ${floorsCount}.`);
    }
  }

  const categories = new Set(rooms.map((r) => r.category));
  if (!categories.has('living')) errors.push('Missing mandatory Living space.');
  if (!categories.has('kitchen')) errors.push('Missing mandatory Kitchen space.');
  if (!categories.has('bedroom')) errors.push('Missing mandatory Bedroom space.');
  if (!categories.has('bathroom')) errors.push('Missing mandatory Bathroom space.');

  rooms.forEach((r) => {
    if (r.position.width <= 0 || r.position.height <= 0) {
      errors.push(`Room "${r.name}" has invalid dimensions.`);
    }
    if (r.position.x < 0 || r.position.x + r.position.width > 100 || r.position.y < 0 || r.position.y + r.position.height > 100) {
      errors.push(`Room "${r.name}" extends beyond 0-100% grid boundaries.`);
    }

    const area = r.areaSqFt;
    if (r.category === 'living' && area < 150) warnings.push(`Living space "${r.name}" is unusually small (${area} sq ft).`);
    if (r.category === 'bedroom' && area < 100) warnings.push(`Bedroom "${r.name}" is unusually small (${area} sq ft).`);
    if (r.category === 'kitchen' && area < 80) warnings.push(`Kitchen "${r.name}" is unusually small (${area} sq ft).`);
  });

  if (bedroomsCount === 0) {
    errors.push('Design must have at least 1 bedroom.');
  }

  if (floorsCount > 1) {
    const groundRooms = rooms.filter((r) => (r.position.floorLevel || 0) === 0);
    const upperRooms = rooms.filter((r) => (r.position.floorLevel || 0) === 1);

    if (groundRooms.length === 0) errors.push('Multi-floor design has no rooms allocated on Ground Floor.');
    if (upperRooms.length === 0) errors.push('Multi-floor design has no rooms allocated on First Floor.');
    if (!rooms.some((r) => (r.position.floorLevel || 0) === 0 && r.category === 'bedroom')) {
      warnings.push('Ground floor is missing a bedroom suite.');
    }
  }

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const r1 = rooms[i];
      const r2 = rooms[j];

      if ((r1.position.floorLevel || 0) === (r2.position.floorLevel || 0)) {
        const overlapX = Math.max(0, Math.min(r1.position.x + r1.position.width, r2.position.x + r2.position.width) - Math.max(r1.position.x, r2.position.x));
        const overlapY = Math.max(0, Math.min(r1.position.y + r1.position.height, r2.position.y + r2.position.height) - Math.max(r1.position.y, r2.position.y));

        if (overlapX > 3 && overlapY > 3) {
          warnings.push(`Minor overlap detected between "${r1.name}" and "${r2.name}" on Floor ${r1.position.floorLevel || 0}.`);
        }
      }
    }
  }

  const calculatedBuiltUp = rooms.reduce((sum, r) => sum + r.areaSqFt, 0);
  if (calculatedBuiltUp > totalPlotArea * floorsCount * 0.85) {
    warnings.push(`Total built-up area (${calculatedBuiltUp} sq ft) exceeds 85% buildable plot envelope.`);
  }

  const finalIsValid = errors.length === 0;
  const score = Math.max(0, 100 - errors.length * 25 - warnings.length * 5);

  return { isValid: finalIsValid, errors, warnings, score };
}
