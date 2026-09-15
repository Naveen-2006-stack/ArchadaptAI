export type DesignRequestIntent =
  | 'MODIFY_CURRENT_DESIGN'
  | 'GENERATE_ALTERNATIVE_CONCEPT';

/**
 * Deliberately conservative: regeneration is destructive in intent even though
 * versions are preserved, so only explicit language creates a new concept.
 */
const ALTERNATIVE_PATTERNS = [
  /\bgenerate\s+(?:me\s+)?another\s+(?:concept|design|layout|plan|house(?:\s+design|\s+plan)?)\b/i,
  /\bgenerate\s+(?:a\s+)?different\s+(?:concept|design|layout|plan|house(?:\s+design|\s+plan)?)\b/i,
  /\b(?:give|show)\s+(?:me\s+)?another\s+(?:concept|design|layout|plan)\b/i,
  /\b(?:give|show)\s+(?:me\s+)?a\s+different\s+(?:concept|design|layout|plan)\b/i,
  /\bcreate\s+(?:an\s+)?alternative(?:\s+(?:concept|design|layout|plan|house\s+plan))?\b/i,
  /\btry\s+another\s+(?:concept|design|layout|plan)\b/i,
  /\b(?:another|alternative|different)\s+house\s+(?:concept|design|layout|plan)\b/i
];

export function classifyDesignRequestIntent(message: string): DesignRequestIntent {
  const normalized = message.trim().replace(/\s+/g, ' ');
  return ALTERNATIVE_PATTERNS.some((pattern) => pattern.test(normalized))
    ? 'GENERATE_ALTERNATIVE_CONCEPT'
    : 'MODIFY_CURRENT_DESIGN';
}
