import { StructuredDesignJSON } from '@/types/architectural';

export interface DesignSimilarityResult {
  similarityScore: number; // 0 to 100%
  isMateriallyDifferent: boolean; // True if similarity < 75%
  breakdown: {
    roomCountScore: number;
    spatialPositionScore: number;
    categoryOverlapScore: number;
    signatureMatchScore: number;
  };
  summary: string;
}

/**
 * Calculates architectural similarity between two floor plan designs (0% to 100%).
 * A score < 75% indicates material spatial differentiation.
 */
export function calculateDesignSimilarity(
  designA: StructuredDesignJSON,
  designB: StructuredDesignJSON
): DesignSimilarityResult {
  if (!designA || !designB) {
    return {
      similarityScore: 0,
      isMateriallyDifferent: true,
      breakdown: { roomCountScore: 0, spatialPositionScore: 0, categoryOverlapScore: 0, signatureMatchScore: 0 },
      summary: 'Invalid design comparison'
    };
  }

  // 1. Room Count Score
  const countA = designA.rooms.length;
  const countB = designB.rooms.length;
  const roomCountScore = 100 - Math.min(100, Math.abs(countA - countB) * 20);

  // 2. Spatial Position (Centroid Distance) Score
  // Calculate average distance between matching room centroids
  let totalDistSum = 0;
  let matchesCount = 0;

  designA.rooms.forEach((rA) => {
    const cAx = rA.position.x + rA.position.width / 2;
    const cAy = rA.position.y + rA.position.height / 2;

    const matchingB = designB.rooms.find((rB) => rB.category === rA.category || rB.name === rA.name);
    if (matchingB) {
      const cBx = matchingB.position.x + matchingB.position.width / 2;
      const cBy = matchingB.position.y + matchingB.position.height / 2;

      const dist = Math.sqrt(Math.pow(cAx - cBx, 2) + Math.pow(cAy - cBy, 2));
      totalDistSum += dist;
      matchesCount++;
    }
  });

  const avgCentroidShift = matchesCount > 0 ? totalDistSum / matchesCount : 50; // max shift is ~100
  // Centroid shift of 0% -> 100% position similarity; shift of 30%+ -> 0% similarity
  const spatialPositionScore = Math.max(0, Math.min(100, Math.round(100 - (avgCentroidShift / 35) * 100)));

  // 3. Category Overlap Score
  const catsAArray = Array.from(new Set(designA.rooms.map((r) => r.category)));
  const catsBSet = new Set(designB.rooms.map((r) => r.category));
  const intersectionCount = catsAArray.filter((x) => catsBSet.has(x)).length;
  const unionSet = new Set([...catsAArray, ...Array.from(catsBSet)]);
  const categoryOverlapScore = Math.round((intersectionCount / Math.max(1, unionSet.size)) * 100);

  // 4. Design Signature Match Score
  let signatureMatchScore = 50;
  const sigA = designA.designSignature;
  const sigB = designB.designSignature;

  if (sigA && sigB) {
    let matches = 0;
    let totalFields = 3;
    if (sigA.planningType === sigB.planningType) matches++;
    if (sigA.circulationType === sigB.circulationType) matches++;
    if (sigA.privatePublicZoning === sigB.privatePublicZoning) matches++;
    signatureMatchScore = Math.round((matches / totalFields) * 100);
  }

  // Weighted total similarity
  const similarityScore = Math.round(
    roomCountScore * 0.15 +
    spatialPositionScore * 0.50 +
    categoryOverlapScore * 0.15 +
    signatureMatchScore * 0.20
  );

  const isMateriallyDifferent = similarityScore < 75;

  const summary = isMateriallyDifferent
    ? `Designs are materially different (Similarity: ${similarityScore}% - Centroid Shift: ${Math.round(avgCentroidShift)}%)`
    : `Designs are highly similar (Similarity: ${similarityScore}% - Centroid Shift: ${Math.round(avgCentroidShift)}%)`;

  return {
    similarityScore,
    isMateriallyDifferent,
    breakdown: {
      roomCountScore,
      spatialPositionScore,
      categoryOverlapScore,
      signatureMatchScore
    },
    summary
  };
}
