import { StructuredDesignJSON } from '@/types/architectural';
import { validateFloorPlan } from '@/lib/design/validateFloorPlan';

export interface RequirementValidationInput {
  bedrooms?: number;
  bathrooms?: number;
  floors?: number;
  parkingCars?: number;
  plotWidth?: number;
  plotDepth?: number;
  familySize?: number;
  requiredSpaces?: Record<string, boolean | number>;
}

export interface RequirementValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  requestedBedrooms: number;
  requestedFloors: number;
  generatedBedrooms: number;
  generatedFloors: number;
  planValidation: ReturnType<typeof validateFloorPlan>;
}

function countBedrooms(design: StructuredDesignJSON): number {
  return (design.rooms || []).filter((room) => room.category === 'bedroom').length;
}

function countBathrooms(design: StructuredDesignJSON): number {
  return (design.rooms || []).filter((room) => room.category === 'bathroom').length;
}

function countFloors(design: StructuredDesignJSON): number {
  const explicitFloors = Number(design.floorsCount ?? 0);
  if (explicitFloors > 0) return explicitFloors;
  const floorArray = Array.isArray(design.floors) ? design.floors.length : 0;
  return floorArray > 0 ? floorArray : 1;
}

function hasParkingSpace(design: StructuredDesignJSON): boolean {
  return (design.rooms || []).some((room) => {
    const name = room.name.toLowerCase();
    return name.includes('parking') || name.includes('car porch') || name.includes('driveway') || name.includes('parking bay');
  });
}

export function validateRequirements(
  design: StructuredDesignJSON,
  expected?: RequirementValidationInput
): RequirementValidationResult {
  const requestedBedrooms = typeof expected?.bedrooms === 'number' ? expected.bedrooms : 0;
  const requestedFloors = typeof expected?.floors === 'number' ? expected.floors : countFloors(design);
  const generatedBedrooms = countBedrooms(design);
  const generatedFloors = countFloors(design);
  const generatedBathrooms = countBathrooms(design);

  const planValidation = validateFloorPlan(design, {
    bedrooms: expected?.bedrooms,
    bathrooms: expected?.bathrooms,
    floors: expected?.floors,
    parkingCars: expected?.parkingCars,
    plotWidth: expected?.plotWidth,
    plotDepth: expected?.plotDepth,
    familySize: expected?.familySize
  });

  const errors: string[] = [...planValidation.errors];
  const warnings: string[] = [...planValidation.warnings];

  if (typeof expected?.bedrooms === 'number' && generatedBedrooms !== expected.bedrooms) {
    errors.push(`Required ${expected.bedrooms} bedrooms but generated ${generatedBedrooms}.`);
  }

  if (typeof expected?.floors === 'number' && generatedFloors !== expected.floors) {
    errors.push(`Required ${expected.floors} floors but generated ${generatedFloors}.`);
  }

  if (typeof expected?.bathrooms === 'number' && generatedBathrooms < expected.bathrooms) {
    errors.push(`Required at least ${expected.bathrooms} bathrooms but generated ${generatedBathrooms}.`);
  }

  if (typeof expected?.parkingCars === 'number' && expected.parkingCars > 0 && !hasParkingSpace(design)) {
    errors.push(`Required ${expected.parkingCars} parking space(s) but no actual parking room or driveway was generated.`);
  }

  if (expected?.requiredSpaces) {
    const mandatorySpaces = Object.entries(expected.requiredSpaces).filter(([, value]) => value === true);
    for (const [spaceKey, value] of mandatorySpaces) {
      if (value !== true) continue;

      const hasSpace = (design.rooms || []).some((room) => {
        const name = room.name.toLowerCase();
        const key = spaceKey.toLowerCase();
        if (key === 'living') return name.includes('living');
        if (key === 'dining') return name.includes('dining');
        if (key === 'kitchen') return name.includes('kitchen');
        if (key === 'balcony') return name.includes('balcony') || name.includes('terrace');
        if (key === 'studyworkspace') return name.includes('study') || name.includes('office');
        if (key === 'storage') return name.includes('store') || name.includes('utility');
        if (key === 'courtyard') return name.includes('courtyard') || name.includes('nadumuttam');
        if (key === 'outdoorgarden') return name.includes('garden') || name.includes('courtyard');
        if (key === 'prayerroom') return name.includes('prayer') || name.includes('puja');
        if (key === 'guestroom') return name.includes('guest');
        return false;
      });

      if (!hasSpace) {
        errors.push(`Required mandatory space "${spaceKey}" was not generated.`);
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    requestedBedrooms,
    requestedFloors,
    generatedBedrooms,
    generatedFloors,
    planValidation
  };
}
