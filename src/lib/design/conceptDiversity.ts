import { StructuredDesignJSON } from '@/types/architectural';
import { calculateDesignSimilarity, DesignSimilarityResult } from './designSimilarity';

export interface ConceptDiversityResult {
  isMateriallyDifferent: boolean;
  overallScore: number; // 0–1 where 1 is highly different
  reasons: string[];
  similarity: DesignSimilarityResult;
  breakdown: {
    footprintDifference: number;
    spatialDifference: number;
    adjacencyDifference: number;
    circulationDifference: number;
    zoningDifference: number;
    entranceDifference: number;
    outdoorStrategyDifference: number;
    floorAllocationDifference: number;
  };
}

const edgeSet = (design: StructuredDesignJSON) => new Set(
  (design.spatialGraph?.requiredAdjacencies || []).map(([a, b]) => [a, b].sort().join('|'))
);

const jaccardDifference = (a: Set<string>, b: Set<string>) => {
  const union = new Set([...Array.from(a), ...Array.from(b)]);
  if (!union.size) return 0;
  const intersection = Array.from(a).filter((item) => b.has(item)).length;
  return 1 - intersection / union.size;
};

const centroid = (design: StructuredDesignJSON, category: string) => {
  const rooms = design.rooms.filter((room) => room.category === category);
  if (!rooms.length) return null;
  return rooms.reduce((result, room) => ({
    x: result.x + (room.position.x + room.position.width / 2) / rooms.length,
    y: result.y + (room.position.y + room.position.height / 2) / rooms.length
  }), { x: 0, y: 0 });
};

export function evaluateConceptDiversity(current: StructuredDesignJSON, alternative: StructuredDesignJSON): ConceptDiversityResult {
  const similarity = calculateDesignSimilarity(current, alternative);
  const reasons: string[] = [];
  const footprintDifference = current.footprint?.shapeType !== alternative.footprint?.shapeType ? 1 :
    Math.min(1, Math.abs((current.footprint?.footprintAreaSqFt || 0) - (alternative.footprint?.footprintAreaSqFt || 0)) / Math.max(1, current.footprint?.footprintAreaSqFt || 1));
  if (footprintDifference >= 0.4) reasons.push(`Building footprint changed from ${current.footprint?.shapeType || 'custom'} to ${alternative.footprint?.shapeType || 'custom'}.`);

  const spatialDifference = 1 - similarity.breakdown.spatialPositionScore / 100;
  const adjacencyDifference = jaccardDifference(edgeSet(current), edgeSet(alternative));
  const circulationDifference = current.designSignature?.circulationType === alternative.designSignature?.circulationType ? 0 : 1;
  const zoningDifference = current.designSignature?.privatePublicZoning === alternative.designSignature?.privatePublicZoning ? 0 : 1;
  const entranceDifference = current.entranceDirection === alternative.entranceDirection ? 0 : 1;
  const outdoorsA = centroid(current, 'outdoor');
  const outdoorsB = centroid(alternative, 'outdoor');
  const outdoorStrategyDifference = !outdoorsA || !outdoorsB ? Number(outdoorsA !== outdoorsB) : Math.min(1, Math.hypot(outdoorsA.x - outdoorsB.x, outdoorsA.y - outdoorsB.y) / 35);
  const upstairs = (design: StructuredDesignJSON) => design.rooms.filter((room) => (room.position.floorLevel || 0) > 0).map((room) => room.category).sort().join('|');
  const floorAllocationDifference = upstairs(current) === upstairs(alternative) ? 0 : 1;

  if (circulationDifference) reasons.push(`Circulation changed from ${current.designSignature?.circulationType || 'custom'} to ${alternative.designSignature?.circulationType || 'custom'}.`);
  if (zoningDifference) reasons.push(`Public/private zoning changed from ${current.designSignature?.privatePublicZoning || 'custom'} to ${alternative.designSignature?.privatePublicZoning || 'custom'}.`);
  if (adjacencyDifference >= 0.35) reasons.push('The required room-adjacency graph was reorganized.');
  if (outdoorStrategyDifference >= 0.35) reasons.push('The outdoor/courtyard strategy moved to a different part of the plan.');
  if (floorAllocationDifference) reasons.push('Room allocation between floors changed.');
  if (!reasons.length && spatialDifference >= 0.3) reasons.push('Primary room positions were materially reorganized.');

  const overallScore = Math.min(1, footprintDifference * 0.2 + spatialDifference * 0.25 + adjacencyDifference * 0.15 + circulationDifference * 0.1 + zoningDifference * 0.1 + entranceDifference * 0.05 + outdoorStrategyDifference * 0.1 + floorAllocationDifference * 0.05);
  return {
    isMateriallyDifferent: overallScore >= 0.4 && similarity.isMateriallyDifferent,
    overallScore: Number(overallScore.toFixed(2)),
    reasons,
    similarity,
    breakdown: { footprintDifference, spatialDifference, adjacencyDifference, circulationDifference, zoningDifference, entranceDifference, outdoorStrategyDifference, floorAllocationDifference }
  };
}
