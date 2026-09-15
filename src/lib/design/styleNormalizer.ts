export type NormalizedStyle =
  | 'kerala_traditional'
  | 'modern'
  | 'minimalist'
  | 'contemporary'
  | 'colonial'
  | 'tropical'
  | 'traditional_indian'
  | 'modern_luxury';

/**
 * Normalizes any architectural style string or feature description into a canonical style type.
 */
export function normalizeStyleName(
  styleName?: string,
  styleFeatures?: string[],
  rationale?: string
): NormalizedStyle {
  const combined = `${styleName || ''} ${(styleFeatures || []).join(' ')} ${rationale || ''}`.toLowerCase();

  if (combined.includes('kerala') || combined.includes('nadumuttam') || combined.includes('sit-out')) {
    return 'kerala_traditional';
  }
  if (combined.includes('minimalist') || combined.includes('compact core')) {
    return 'minimalist';
  }
  if (combined.includes('colonial') || combined.includes('colonnade')) {
    return 'colonial';
  }
  if (combined.includes('tropical') || combined.includes('eaves')) {
    return 'tropical';
  }
  if (combined.includes('traditional indian') || combined.includes('puja')) {
    return 'traditional_indian';
  }
  if (combined.includes('luxury') || combined.includes('double-height')) {
    return 'modern_luxury';
  }
  if (combined.includes('contemporary')) {
    return 'contemporary';
  }
  return 'modern'; // Default fallback
}
