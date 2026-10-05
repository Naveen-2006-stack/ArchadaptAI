export type SpecialMode = 
  | 'climate_adaptive'
  | 'life_stage'
  | 'budget_first'
  | 'renovation';

export type ArchitecturalStyle = 
  | 'Kerala Traditional'
  | 'Modern'
  | 'Minimalist'
  | 'Contemporary'
  | 'Colonial'
  | 'Tropical'
  | 'Traditional Indian'
  | 'Modern Luxury';

export interface SiteSetbacks {
  front: number; // feet
  rear: number;
  left: number;
  right: number;
}

export interface SiteInfo {
  plotWidth: number; // feet
  plotDepth: number; // feet
  totalArea: number; // sq ft
  orientation: 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';
  setbacks?: SiteSetbacks;
  fileUrl?: string;
  notes?: string;
}

export interface LocationInfo {
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  climateZone?: 'Tropical' | 'Warm & Humid' | 'Hot & Dry' | 'Moderate' | 'Cold';
}

export interface DesignRequirements {
  familySize: number;
  bedrooms: number;
  bathrooms: number;
  floors: number;
  budgetRange: 'Economy' | 'Moderate' | 'Premium' | 'Luxury';
  spaces: {
    living: boolean;
    dining: boolean;
    kitchen: boolean;
    parkingCars: number;
    balcony: boolean;
    studyWorkspace: boolean;
    storage: boolean;
    prayerRoom: boolean;
    courtyard: boolean;
    guestRoom: boolean;
    outdoorGarden: boolean;
  };
  customRequirements?: string;
}

export interface DesignPreferences {
  modes: SpecialMode[];
  primaryStyle: ArchitecturalStyle;
  secondaryStyle?: ArchitecturalStyle | string;
  customStyleNotes?: string;
}

/**
 * Canonical coordinate contract (schemaVersion 2):
 * x / width are a percentage of the PLOT WIDTH, y / height a percentage of the PLOT DEPTH.
 * y = 0 is the road-facing (front) plot boundary. Feet are recovered as pct / 100 * plot dimension.
 */
export interface RoomPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  floorLevel: number; // 0 for ground, 1 for first floor, etc.
}

export type RoomType =
  | 'entrance'
  | 'living'
  | 'dining'
  | 'kitchen'
  | 'utility'
  | 'master_bedroom'
  | 'bedroom'
  | 'guest_room'
  | 'bathroom'
  | 'study'
  | 'store'
  | 'puja'
  | 'parking'
  | 'balcony'
  | 'courtyard'
  | 'lounge'
  | 'stair'
  | 'passage'
  | 'dressing'
  | 'terrace'
  | 'void';

export type RelationshipType =
  | 'ADJACENT_TO'
  | 'CONNECTED_TO'
  | 'ATTACHED_TO'
  | 'NEAR'
  | 'PRIVATE_FROM'
  | 'ACCESSIBLE_FROM';

export interface RoomRelationship {
  type: RelationshipType;
  target: string; // room id
}

export type PlanBand = 'front' | 'middle' | 'rear';
export type PlanSide = 'left' | 'center' | 'right';

/** A room as reasoned by the planner (Gemini or the local rule engine) before geometry exists. */
export interface ProgramRoom {
  id: string;
  name: string;
  type: RoomType;
  floor: number;
  areaSqFt: number; // target area
  band: PlanBand; // depth zone measured from the road
  side: PlanSide; // position across the frontage, seen from the road
  required: boolean; // true when it satisfies a hard requirement
  attachedTo?: string; // room id this room must share a wall and a door with
  relationships: RoomRelationship[];
  features: string[];
  accessible?: boolean;
}

/** Hard requirements the design is validated against. Never silently relaxed. */
export interface DesignConstraints {
  bedrooms: number;
  bathrooms: number;
  floors: number;
  parkingCars: number;
  requiredSpaces: string[]; // keys of DesignRequirements.spaces that are switched on
  familySize: number;
  budgetRange: DesignRequirements['budgetRange'];
  modes: SpecialMode[];
  style: string;
}

export interface DesignProgram {
  rooms: ProgramRoom[];
  stairSide: 'left' | 'right';
  planningType: DesignSignature['planningType'];
  circulationType: DesignSignature['circulationType'];
  architecturalBrief?: ArchitecturalBrief;
  rationale: string;
  circulationNotes: string;
  styleFeatures: string[];
  modeConsiderations: { mode: SpecialMode; note: string }[];
  appearance?: HouseAppearance;
}

export interface FloorPlanRoom {
  id: string;
  name: string;
  category: 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'circulation' | 'outdoor' | 'utility' | 'puja';
  roomType?: RoomType;
  zoningCategory?: 'public' | 'semi_private' | 'private' | 'service' | 'circulation' | 'outdoor';
  privacyLevel?: 'high' | 'medium' | 'low';
  dimensions: string; // e.g. "16' x 14'" — derived from position, never authored separately
  areaSqFt: number; // derived from position
  position: RoomPosition;
  connections: string[]; // IDs of rooms reachable through a door/opening
  features: string[]; // e.g., ["Large North Window", "Direct Patio Access"]
  color?: string;
  required?: boolean;
  derived?: boolean; // inserted by the layout engine (stair, passage, terrace, void…)
  attachedTo?: string;
  relationships?: RoomRelationship[];
}

export interface FloorPlanWall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isExterior: boolean;
  thickness: number;
  floorLevel?: number;
}

export interface FloorPlanOpening {
  id: string;
  type: 'door' | 'window' | 'archway' | 'sliding_glass';
  wallId?: string;
  x: number;
  y: number;
  width: number; // feet
  label?: string;
  swingDirection?: 'inward_left' | 'inward_right' | 'outward' | 'sliding';
  floorLevel?: number;
  orientation?: 'horizontal' | 'vertical'; // direction of the wall the opening sits in
  connects?: string[]; // room ids on either side; a single id means it opens to outside
  isExterior?: boolean;
}

export interface FloorPlanLevel {
  level: number; // 0 for Ground Floor, 1 for First Floor
  name: string; // "Ground Floor", "First Floor"
  builtUpAreaSqFt: number;
}

export interface StaircaseDetails {
  id: string;
  location: string;
  floorLevel: number; // lowest floor served
  topFloorLevel?: number; // highest floor served (same x/y footprint on every floor in between)
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'dog_legged' | 'straight' | 'spiral';
}

export interface HouseAppearance {
  wallColor: string; // e.g. '#F1E8D8' (Ivory), '#FFFFFF', '#C86A4B' (Terracotta), '#E5E7EB'
  roofColor: string; // e.g. '#C86A4B' (Terracotta), '#282623' (Charcoal), '#4B382A' (Brown)
  frameColor: string; // e.g. '#121417' (Black), '#FFFFFF', '#4A3525' (Dark Brown)
  accentMaterial: 'wood' | 'stone' | 'concrete' | 'neutral';
}

export interface ArchitecturalBrief {
  planningIntent: string;
  siteResponse: string;
  orientationStrategy: string;
  publicPrivateStrategy: string;
  serviceStrategy: string;
  circulationStrategy: string;
  climateStrategy: string;
  accessibilityStrategy: string;
  styleStrategy: string;
}

export interface SpatialGraph {
  nodes: { roomId: string; name: string; category: string }[];
  requiredAdjacencies: [string, string][];
  preferredAdjacencies: [string, string][];
  avoidAdjacencies: [string, string][];
  verticalConnections: { stairId: string; connectLevels: [number, number] }[];
  indoorOutdoorConnections: { roomId: string; outdoorSpaceId: string }[];
}

export interface BuildingFootprint {
  shapeType: 'rectangular' | 'l_shaped' | 'courtyard_centered' | 'stepped' | 'winged' | 'compact';
  footprintAreaSqFt: number;
  boundingWidth: number;
  boundingDepth: number;
}

export interface ConceptualFurniture {
  id: string;
  roomId: string;
  type: 'sofa' | 'dining_table' | 'bed' | 'kitchen_counter' | 'bath_fixture' | 'study_desk';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesignSignature {
  planningType: 'courtyard_centered' | 'linear_circulation' | 'zoned_wings' | 'compact_core' | 'l_shaped';
  circulationType: 'central' | 'peripheral' | 'spine';
  privatePublicZoning: 'split' | 'stacked' | 'integrated';
  conceptVariant?: 'A' | 'B' | 'C';
  orientationStrategy: string;
  climateStrategy: string[];
  styleStrategy: string[];
  futureAdaptability: 'high' | 'moderate' | 'standard';
}

export interface DesignGenerationMetadata {
  intent: 'INITIAL_DESIGN' | 'MODIFY_CURRENT_DESIGN' | 'GENERATE_ALTERNATIVE_CONCEPT';
  sourceVersionId?: string;
  modelId: string; // actual engine that produced the room program
  engine?: 'gemini' | 'local-rule-engine';
  attempts?: number;
  generatedAt: string;
  diversityScore?: number;
  diversityLimited?: boolean;
}

export interface DesignIssue {
  stage: 'schema' | 'requirements' | 'geometry' | 'spatial' | 'feasibility';
  code: string;
  message: string;
}

export interface StructuredDesignJSON {
  schemaVersion?: number; // 2 = geometry produced by the deterministic layout engine
  program?: DesignProgram; // the reasoning the geometry was derived from; What-If edits this
  constraints?: DesignConstraints;
  layoutNotes?: string[]; // trade-offs the layout engine had to make (never hidden)
  versionId?: string;
  conceptNumber?: number;
  architecturalBrief?: ArchitecturalBrief;
  spatialGraph?: SpatialGraph;
  footprint?: BuildingFootprint;
  plot: {
    width: number;
    depth: number;
    totalArea: number;
    orientation: string;
    roadSide: 'N' | 'S' | 'E' | 'W';
    setbacks?: SiteSetbacks;
  };
  buildableAreaSqFt?: number;
  totalBuiltUpAreaSqFt: number;
  floorsCount: number;
  floors?: FloorPlanLevel[];
  stairs?: StaircaseDetails[];
  entranceDirection: string;
  rooms: FloorPlanRoom[];
  walls: FloorPlanWall[];
  openings: FloorPlanOpening[];
  furniture?: ConceptualFurniture[];
  circulationNotes: string;
  rationale: string;
  modeConsiderations: {
    mode: SpecialMode;
    note: string;
  }[];
  styleFeatures: string[];
  designSignature?: DesignSignature;
  appearance?: HouseAppearance;
  generationMetadata?: DesignGenerationMetadata;
}

export interface VersionDelta {
  changeSummary: string;
  addedRooms?: string[];
  modifiedRooms?: string[];
  removedRooms?: string[];
  tradeOffs: string[];
}

export interface FloorPlanVersion {
  id: string;
  projectId: string;
  versionNumber: number;
  title: string;
  structuredDesign: StructuredDesignJSON;
  rationale: string;
  tradeOffs: string[];
  parentVersionId?: string;
  createdByPrompt?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  description?: string;
  location: LocationInfo;
  siteInfo: SiteInfo;
  requirements: DesignRequirements;
  preferences: DesignPreferences;
  currentVersionId?: string;
  /** Where the project lives: the user's Supabase account, or only this browser (guests / failed saves). */
  storage?: 'supabase' | 'local';
  versions: FloorPlanVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface WhatIfMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  delta?: VersionDelta;
  versionIdResult?: string;
}
