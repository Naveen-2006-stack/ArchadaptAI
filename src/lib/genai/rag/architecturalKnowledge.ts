export interface ArchitecturalKnowledgeItem {
  topic: string;
  category: 'climate' | 'lifestage' | 'budget' | 'renovation' | 'style' | 'circulation';
  guidelines: string[];
}

export const ARCHITECTURAL_KNOWLEDGE_BASE: ArchitecturalKnowledgeItem[] = [
  {
    topic: 'Climate-Adaptive Design (Tropical & Warm Humid)',
    category: 'climate',
    guidelines: [
      'Orient major living areas toward North/East to maximize soft morning light while minimizing harsh West solar heat gain.',
      'Incorporate central courtyards (Nadumuttam in Kerala architecture) to create a stack effect for natural passive ventilation.',
      'Utilize wide overhangs (sloped roofs with 30-45 degree pitch) to shade windows and protect against heavy monsoon downpours.',
      'Place high operable windows (clerestory) near roof ridges to vent trapped hot air.'
    ]
  },
  {
    topic: 'Life-Stage Adaptability & Aging in Place',
    category: 'lifestage',
    guidelines: [
      'Provide at least one full Master Bedroom with ensuite bathroom on the Ground Floor for elderly family members.',
      'Ensure zero-step thresholds at main entrances and wider 36-inch (3-foot) door openings for wheelchair/walker accessibility.',
      'Design flex-rooms near the entrance that can transition from a home office/study into a nursery or senior bedroom over time.',
      'Group plumbing stacks vertically to enable simple future floor additions or upper-level suite conversion.'
    ]
  },
  {
    topic: 'Budget-First Optimization',
    category: 'budget',
    guidelines: [
      'Maintain a compact, efficient building perimeter footprint (rectilinear or L-shape) to minimize costly wall surface area.',
      'Consolidate wet zones (kitchen, bathrooms, utility) back-to-back or vertically to reduce plumbing and drainage pipe runs.',
      'Prioritize high-impact double-height living spaces over excess unused square footage.',
      'Design modular expansion zones so second-floor additions can be completed in later financial phases without structural teardowns.'
    ]
  },
  {
    topic: 'Kerala & Modern Tropical Architectural Style',
    category: 'style',
    guidelines: [
      'Combine traditional terracotta sloped roof profiles with crisp modern concrete render and timber louvers.',
      'Verandahs (Sit-outs) provide a sheltered transition between outdoor landscape and private indoor living.',
      'Exposed laterite stone accent walls paired with polished cement floors create a quiet, tactile architectural aesthetic.'
    ]
  }
];

const MODE_CATEGORY: Record<string, ArchitecturalKnowledgeItem['category']> = {
  climate_adaptive: 'climate',
  life_stage: 'lifestage',
  budget_first: 'budget',
  renovation: 'renovation'
};

export function getRelevantKnowledge(query: string, modes: string[]): string {
  const wanted = new Set<string>(modes.map((mode) => MODE_CATEGORY[mode] || mode));
  wanted.add('style');
  const matching = ARCHITECTURAL_KNOWLEDGE_BASE.filter(item =>
    wanted.has(item.category) || query.toLowerCase().includes(item.category)
  );

  if (matching.length === 0) {
    return ARCHITECTURAL_KNOWLEDGE_BASE.map(k => `${k.topic}:\n- ${k.guidelines.join('\n- ')}`).join('\n\n');
  }

  return matching.map(k => `${k.topic}:\n- ${k.guidelines.join('\n- ')}`).join('\n\n');
}
