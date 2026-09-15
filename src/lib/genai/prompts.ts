import { SiteInfo, LocationInfo, DesignRequirements, DesignPreferences, StructuredDesignJSON } from '@/types/architectural';

export const SYSTEM_ARCHITECTURAL_PROMPT = `
You are ArchAdapt AI — a Senior Principal Architectural Design Engine and Spatial Planning Consultant.
Your task is to derive an intelligent, constraint-driven, non-generic 2D conceptual residential floor plan (JSON).

CRITICAL ARCHITECTURAL DESIGN DIRECTIVES:

1. ARCHITECTURAL BRIEF & SITE RESPONSE:
   Derive an explicit architectural brief responding to plot orientation, climate zone, family needs, and architectural style.

2. SPATIAL GRAPH & ADJACENCY CONSTRAINTS:
   Formulate a spatial relationship graph defining:
   - Required Adjacencies (e.g. Foyer ↔ Living, Living ↔ Dining, Dining ↔ Kitchen, Kitchen ↔ Utility, Master Bedroom ↔ Ensuite Bath)
   - Preferred Adjacencies (e.g. Living ↔ Verandah/Courtyard, Bedroom ↔ Outdoor Terrace)
   - Avoid Adjacencies (e.g. Master Bedroom ↔ Kitchen, Formal Living ↔ Service Toilets)

3. BUILDING FOOTPRINT BEFORE ROOM PLACEMENT:
   Establish building footprint shape inside allowable setbacks (Front 8-10ft, Rear 5-6ft, Side 4-5ft). Shape options: courtyard_centered, l_shaped, compact_core, winged.

4. FUNCTIONAL ZONING & CIRCULATION:
   Organize spaces logically:
   - Public Zone (Verandah/Foyer, Formal Living)
   - Semi-Private Zone (Family Dining, Courtyard/Nadumuttam, Family Lounge)
   - Private Zone (Ground Accessible Master Suite, Upper Bedrooms)
   - Service Zone (Kitchen, Pantry, Utility, Bathrooms)
   - Outdoor & Circulation (Staircase, Verandah, Balcony Terrace, Parking Driveway)

5. MULTI-FLOOR SPATIAL ALLOCATION:
   If floorsCount > 1, place public/service/accessible master suite on Ground Floor (level 0) and secondary bedrooms/family lounge/terrace on First Floor (level 1), connected by an explicit dog-legged staircase.
   For G+1 specifically, ensure the final design contains explicit floor entries for both Ground Floor and First Floor and at least one bedroom on each relevant level as appropriate to the brief.

6. OPENINGS, ANNOTATIONS & LIGHTWEIGHT FURNITURE CUES:
   Include main entry door, room doors with swing directions, orientation-aware window sills, and lightweight conceptual furniture cues (sofa, dining_table, bed, kitchen_counter, bath_fixture).
`;

export function buildDesignPrompt(
  site: SiteInfo,
  location: LocationInfo,
  reqs: DesignRequirements,
  prefs: DesignPreferences,
  ragContext: string
): string {
  return `
GENERATE CONCEPTUAL RESIDENTIAL HOUSE DESIGN (ENGINE 2.0)

SITE & LOCATION CONSTRAINTS:
- Plot Dimensions: ${site.plotWidth} ft width × ${site.plotDepth} ft depth (Total: ${site.totalArea} sq ft)
- Road Facing Orientation: ${site.orientation}-facing road
- Location: ${location.name || location.city}, ${location.city}, ${location.country}

REQUIREMENTS & SPACES:
- HARD REQUIREMENTS: REQUIRED BEDROOMS = ${reqs.bedrooms}; REQUIRED FLOORS = ${reqs.floors}; REQUIRED BATHROOMS = ${reqs.bathrooms}; REQUIRED PARKING = ${reqs.spaces.parkingCars}
- Family Size: ${reqs.familySize} members
- Budget Tier: ${reqs.budgetRange}
- Requested Spaces: ${Object.entries(reqs.spaces).filter(([_, v]) => v).map(([k]) => k).join(', ')}
${reqs.customRequirements ? `- Custom Directives: ${reqs.customRequirements}` : ''}

CRITICAL CONSTRAINTS:
- You MUST generate exactly ${reqs.bedrooms} actual bedroom rooms in the final StructuralDesignJSON.
- You MUST generate ${reqs.floors} actual floors in the final design: ${reqs.floors > 1 ? 'Ground Floor and First Floor (or higher if required)' : 'single floor only'}.
- Do not silently reduce bedroom count or floor count to fit a template.
- Do not substitute a generic 1-bedroom / single-floor layout.
- If the brief conflicts with the site or family needs, return a generation error instead of silently downgrading the requirement.

SPECIAL DESIGN MODES:
- Active Modes: ${prefs.modes.join(', ') || 'Standard'}

ARCHITECTURAL STYLE:
- Primary Style: ${prefs.primaryStyle}
${prefs.secondaryStyle ? `- Secondary Style: ${prefs.secondaryStyle}` : ''}

RAG KNOWLEDGE GUIDELINES:
${ragContext}

OUTPUT INSTRUCTIONS:
Return strictly valid JSON matching the StructuredDesignJSON schema:
{
  "architecturalBrief": {
    "planningIntent": "string",
    "siteResponse": "string",
    "orientationStrategy": "string",
    "publicPrivateStrategy": "string",
    "serviceStrategy": "string",
    "circulationStrategy": "string",
    "climateStrategy": "string",
    "accessibilityStrategy": "string",
    "styleStrategy": "string"
  },
  "spatialGraph": {
    "nodes": [{ "roomId": "room-living", "name": "Formal Living", "category": "living" }],
    "requiredAdjacencies": [["room-entrance", "room-living"], ["room-living", "room-dining"], ["room-dining", "room-kitchen"], ["room-master", "room-master-bath"]],
    "preferredAdjacencies": [["room-living", "room-courtyard"]],
    "avoidAdjacencies": [["room-master", "room-kitchen"]],
    "verticalConnections": [{ "stairId": "stair-1", "connectLevels": [0, 1] }],
    "indoorOutdoorConnections": [{ "roomId": "room-living", "outdoorSpaceId": "room-courtyard" }]
  },
  "footprint": {
    "shapeType": "courtyard_centered | l_shaped | compact_core | winged",
    "footprintAreaSqFt": number,
    "boundingWidth": number,
    "boundingDepth": number
  },
  "designSignature": {
    "planningType": "courtyard_centered | linear_circulation | zoned_wings | compact_core | l_shaped",
    "circulationType": "central | peripheral | spine",
    "privatePublicZoning": "split | stacked | integrated",
    "orientationStrategy": "string",
    "climateStrategy": ["string"],
    "styleStrategy": ["string"],
    "futureAdaptability": "high | moderate | standard"
  },
  "plot": {
    "width": ${site.plotWidth},
    "depth": ${site.plotDepth},
    "totalArea": ${site.totalArea},
    "orientation": "${site.orientation}",
    "roadSide": "${site.orientation}",
    "setbacks": { "front": 8, "rear": 5, "left": 4, "right": 4 }
  },
  "buildableAreaSqFt": number,
  "totalBuiltUpAreaSqFt": number,
  "floorsCount": ${reqs.floors},
  "floors": [
    { "level": 0, "name": "Ground Floor", "builtUpAreaSqFt": number },
    { "level": 1, "name": "First Floor", "builtUpAreaSqFt": number }
  ],
  "stairs": [
    { "id": "stair-1", "location": "Circulation Spine", "floorLevel": 0, "x": 47, "y": 52, "width": 10, "height": 10, "type": "dog_legged" }
  ],
  "entranceDirection": "${site.orientation} Entrance",
  "rooms": [
    {
      "id": "string",
      "name": "string",
      "category": "living | bedroom | kitchen | bathroom | circulation | outdoor | utility | puja",
      "zoningCategory": "public | semi_private | private | service | circulation | outdoor",
      "privacyLevel": "high | medium | low",
      "dimensions": "string (e.g. 18' x 16')",
      "areaSqFt": number,
      "position": { "x": number, "y": number, "width": number, "height": number, "floorLevel": 0 },
      "connections": ["room_id"],
      "features": ["string"],
      "color": "hex_string"
    }
  ],
  "walls": [],
  "openings": [
    { "id": "op-main", "type": "door", "x": 45, "y": 10, "width": 6, "label": "Main Entrance Door", "swingDirection": "inward_left" }
  ],
  "furniture": [
    { "id": "f-sofa-1", "roomId": "room-living", "type": "sofa", "x": 12, "y": 28, "width": 16, "height": 8 }
  ],
  "circulationNotes": "string",
  "rationale": "Detailed architectural rationale explaining zoning, adjacencies, style, and multi-floor spatial planning.",
  "modeConsiderations": [{ "mode": "climate_adaptive", "note": "string" }],
  "styleFeatures": ["string"],
  "appearance": {
    "wallColor": "#F4F1EA",
    "roofColor": "#C86A4B",
    "frameColor": "#121417",
    "accentMaterial": "wood"
  }
}
`;
}

export function buildWhatIfPrompt(
  currentDesign: StructuredDesignJSON,
  userMessage: string,
  versionNumber: number
): string {
  return `
PERFORM WHAT-IF ARCHITECTURAL MODIFICATION (VERSION ${versionNumber})

CURRENT DESIGN (v${versionNumber - 1}):
${JSON.stringify(currentDesign, null, 2)}

USER WHAT-IF CHANGE REQUEST:
"${userMessage}"

INSTRUCTIONS:
1. Preserve active design signature (${currentDesign.designSignature?.planningType || 'custom'}) and overall style.
2. If request targets floorLevel (0 vs 1), modify ONLY rooms on that target floor.
3. If request is a visual color change (e.g. "change wall color to ivory", "use dark brown roof"), update "appearance" property in JSON without altering spatial geometry.
4. Output strictly valid JSON matching the StructuredDesignJSON schema.
`;
}

export function buildAlternativeConceptPrompt(
  site: SiteInfo,
  location: LocationInfo,
  reqs: DesignRequirements,
  prefs: DesignPreferences,
  ragContext: string,
  currentDesign: StructuredDesignJSON,
  attempt: number
): string {
  return `${buildDesignPrompt(site, location, reqs, prefs, ragContext)}

GENERATE A COMPLETELY NEW ALTERNATIVE ARCHITECTURAL CONCEPT (ATTEMPT ${attempt})

This is not a What-If modification. Generate a new valid house for the same site, requirements, style, and selected modes.
The current design below is comparison-only. Do NOT refine it, preserve its room coordinates, use its room arrangement as a template, or call it a starting plan.

CURRENT DESIGN FOR DIVERSITY COMPARISON ONLY:
${JSON.stringify({
  footprint: currentDesign.footprint,
  designSignature: currentDesign.designSignature,
  rooms: currentDesign.rooms.map((room) => ({ id: room.id, name: room.name, category: room.category, position: room.position, connections: room.connections }))
}, null, 2)}

First reason through a new ArchitecturalBrief, then a new SpatialGraph, BuildingFootprint, functional zoning, circulation, room placement, openings, stairs, and outdoor spaces. Preserve all hard site and user requirements. Reconsider footprint, entrance sequence, room adjacency, courtyard/verandah placement, staircase location, and floor allocation. Return only the complete StructuredDesignJSON object.`;
}
