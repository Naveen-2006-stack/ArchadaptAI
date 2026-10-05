import { FloorPlanRoom, RoomType, StructuredDesignJSON } from '@/types/architectural';

export interface RoomTypeSpec {
  category: FloorPlanRoom['category'];
  zoning: NonNullable<FloorPlanRoom['zoningCategory']>;
  privacy: NonNullable<FloorPlanRoom['privacyLevel']>;
  minArea: number; // sq ft below which the room is not usable
  targetArea: number; // sq ft at the Moderate budget tier
  minSide: number; // ft, shortest usable side
  color: string;
  /** How the layout engine may place it: own column, stacked beside its anchor, or in the same column as its anchor on the outward side. */
  placement: 'major' | 'side_stack' | 'inline_front';
  /** Rooms a person may walk through to reach other rooms. Lower = preferred circulation. */
  hubPriority?: number;
  habitable: boolean; // needs daylight and ventilation
}

export const ROOM_TYPE_SPECS: Record<RoomType, RoomTypeSpec> = {
  entrance: { category: 'circulation', zoning: 'public', privacy: 'low', minArea: 28, targetArea: 60, minSide: 3.5, color: '#E9E3D6', placement: 'inline_front', hubPriority: 1, habitable: false },
  living: { category: 'living', zoning: 'public', privacy: 'low', minArea: 130, targetArea: 200, minSide: 10, color: '#F4F1EA', placement: 'major', hubPriority: 1, habitable: true },
  dining: { category: 'living', zoning: 'semi_private', privacy: 'medium', minArea: 80, targetArea: 120, minSide: 8, color: '#F1ECE1', placement: 'major', hubPriority: 1, habitable: true },
  kitchen: { category: 'kitchen', zoning: 'service', privacy: 'medium', minArea: 60, targetArea: 100, minSide: 7, color: '#E6ECE8', placement: 'major', hubPriority: 4, habitable: true },
  utility: { category: 'utility', zoning: 'service', privacy: 'medium', minArea: 20, targetArea: 35, minSide: 4, color: '#E0DDD7', placement: 'inline_front', habitable: false },
  master_bedroom: { category: 'bedroom', zoning: 'private', privacy: 'high', minArea: 110, targetArea: 160, minSide: 9.5, color: '#F7F4EF', placement: 'major', habitable: true },
  bedroom: { category: 'bedroom', zoning: 'private', privacy: 'high', minArea: 90, targetArea: 130, minSide: 9, color: '#F7F4EF', placement: 'major', habitable: true },
  guest_room: { category: 'bedroom', zoning: 'private', privacy: 'high', minArea: 90, targetArea: 120, minSide: 9, color: '#F5F1EA', placement: 'major', habitable: true },
  bathroom: { category: 'bathroom', zoning: 'service', privacy: 'high', minArea: 24, targetArea: 40, minSide: 4.5, color: '#DDE6EA', placement: 'side_stack', habitable: false },
  study: { category: 'utility', zoning: 'semi_private', privacy: 'medium', minArea: 50, targetArea: 80, minSide: 6.5, color: '#EFEAE0', placement: 'major', habitable: true },
  store: { category: 'utility', zoning: 'service', privacy: 'medium', minArea: 16, targetArea: 30, minSide: 3.5, color: '#E0DDD7', placement: 'side_stack', habitable: false },
  puja: { category: 'puja', zoning: 'semi_private', privacy: 'medium', minArea: 12, targetArea: 25, minSide: 3, color: '#F3E8D2', placement: 'side_stack', habitable: false },
  parking: { category: 'circulation', zoning: 'circulation', privacy: 'low', minArea: 135, targetArea: 160, minSide: 9, color: '#DCE2E5', placement: 'major', habitable: false },
  balcony: { category: 'outdoor', zoning: 'outdoor', privacy: 'low', minArea: 24, targetArea: 50, minSide: 3.5, color: '#DCE5E1', placement: 'inline_front', hubPriority: 6, habitable: false },
  courtyard: { category: 'outdoor', zoning: 'outdoor', privacy: 'medium', minArea: 36, targetArea: 80, minSide: 6, color: '#CFE0D2', placement: 'major', hubPriority: 3, habitable: false },
  lounge: { category: 'living', zoning: 'semi_private', privacy: 'medium', minArea: 50, targetArea: 90, minSide: 6, color: '#F1ECE1', placement: 'major', hubPriority: 1, habitable: true },
  stair: { category: 'circulation', zoning: 'circulation', privacy: 'low', minArea: 60, targetArea: 80, minSide: 6.5, color: '#D6D1C7', placement: 'major', hubPriority: 2, habitable: false },
  passage: { category: 'circulation', zoning: 'circulation', privacy: 'low', minArea: 20, targetArea: 60, minSide: 3, color: '#E3DED3', placement: 'major', hubPriority: 2, habitable: false },
  dressing: { category: 'utility', zoning: 'private', privacy: 'high', minArea: 12, targetArea: 30, minSide: 3, color: '#ECE7DD', placement: 'side_stack', habitable: false },
  terrace: { category: 'outdoor', zoning: 'outdoor', privacy: 'low', minArea: 12, targetArea: 80, minSide: 3, color: '#DCE5E1', placement: 'major', hubPriority: 6, habitable: false },
  void: { category: 'outdoor', zoning: 'outdoor', privacy: 'low', minArea: 0, targetArea: 0, minSide: 0, color: '#B9CFC0', placement: 'major', habitable: false }
};

export const ROOM_TYPES = Object.keys(ROOM_TYPE_SPECS) as RoomType[];

const TYPE_ALIASES: Record<string, RoomType> = {
  verandah: 'entrance', veranda: 'entrance', sitout: 'entrance', 'sit-out': 'entrance', foyer: 'entrance', porch: 'entrance', poomukham: 'entrance',
  living_room: 'living', hall: 'living', drawing: 'living',
  dining_room: 'dining',
  master: 'master_bedroom', master_suite: 'master_bedroom', primary_bedroom: 'master_bedroom',
  guest: 'guest_room', guest_bedroom: 'guest_room',
  bath: 'bathroom', toilet: 'bathroom', wc: 'bathroom', ensuite: 'bathroom',
  office: 'study', study_room: 'study', workspace: 'study',
  storage: 'store', storeroom: 'store', pantry: 'store',
  prayer: 'puja', prayer_room: 'puja', pooja: 'puja',
  garage: 'parking', carport: 'parking', car_porch: 'parking',
  nadumuttam: 'courtyard',
  family_lounge: 'lounge', family: 'lounge', lobby: 'lounge', landing: 'lounge',
  staircase: 'stair', stairs: 'stair',
  corridor: 'passage',
  wardrobe: 'dressing', walk_in: 'dressing'
};

export function normalizeRoomType(value: unknown): RoomType | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if ((ROOM_TYPES as string[]).includes(key)) return key as RoomType;
  return TYPE_ALIASES[key] || TYPE_ALIASES[key.replace(/_/g, '')] || null;
}

/** Best-effort type for rooms stored before roomType existed (legacy Gemini / template designs). */
export function inferRoomType(room: Pick<FloorPlanRoom, 'id' | 'name' | 'category'> & { roomType?: RoomType }): RoomType {
  if (room.roomType) return room.roomType;
  const text = `${room.name} ${room.id}`.toLowerCase();
  const has = (...words: string[]) => words.some((w) => text.includes(w));
  if (has('stair', 'landing')) return 'stair';
  if (has('parking', 'car porch', 'carport', 'garage')) return 'parking';
  if (has('courtyard', 'nadumuttam', 'lightwell')) return 'courtyard';
  if (has('balcony')) return 'balcony';
  if (has('terrace', 'deck')) return 'terrace';
  if (has('verandah', 'veranda', 'sit-out', 'sitout', 'foyer', 'vestibule', 'poomukham', 'entrance', 'porch')) return 'entrance';
  if (has('guest')) return 'guest_room';
  if (room.category === 'bathroom' || has('bath', 'toilet', 'wc')) return 'bathroom';
  if (has('master', 'primary')) return 'master_bedroom';
  if (room.category === 'bedroom' || has('bedroom')) return 'bedroom';
  if (room.category === 'kitchen' || has('kitchen')) return 'kitchen';
  if (has('dining')) return 'dining';
  if (has('study', 'office', 'workspace')) return 'study';
  if (has('store', 'storage', 'pantry')) return 'store';
  if (room.category === 'puja' || has('puja', 'prayer', 'pooja')) return 'puja';
  if (has('utility', 'wash')) return 'utility';
  if (has('lounge', 'family', 'lobby')) return 'lounge';
  if (has('passage', 'corridor')) return 'passage';
  if (has('dressing', 'wardrobe')) return 'dressing';
  if (room.category === 'living') return 'living';
  if (room.category === 'outdoor') return 'terrace';
  if (room.category === 'circulation') return 'passage';
  return 'store';
}

const SLEEPING: RoomType[] = ['master_bedroom', 'bedroom'];

export const isBedroomType = (type: RoomType) => SLEEPING.includes(type);

/** Bedrooms that count toward the "N BHK" hard requirement (guest rooms are a separate requested space). */
export function countBedrooms(design: Pick<StructuredDesignJSON, 'rooms'>): number {
  return (design.rooms || []).filter((room) => isBedroomType(inferRoomType(room))).length;
}

export function countRoomsOfType(design: Pick<StructuredDesignJSON, 'rooms'>, ...types: RoomType[]): number {
  return (design.rooms || []).filter((room) => types.includes(inferRoomType(room))).length;
}

export function floorName(level: number): string {
  if (level === 0) return 'Ground Floor';
  if (level === 1) return 'First Floor';
  if (level === 2) return 'Second Floor';
  if (level === 3) return 'Third Floor';
  return `Floor ${level}`;
}

/** Which room types satisfy each onboarding "requested space" toggle. */
export const REQUIRED_SPACE_TYPES: Record<string, RoomType[]> = {
  living: ['living'],
  dining: ['dining'],
  kitchen: ['kitchen'],
  balcony: ['balcony', 'terrace'],
  studyWorkspace: ['study'],
  storage: ['store', 'utility'],
  prayerRoom: ['puja'],
  courtyard: ['courtyard'],
  guestRoom: ['guest_room']
  // outdoorGarden is a site-level requirement (open plot area), checked in validation.
};
