import { StructuredDesignJSON, FloorPlanRoom, FloorPlanWall, FloorPlanOpening } from './architectural';

export type DeltaAction = 'add' | 'modify' | 'remove' | 'reposition';
export type DeltaEntity = 'room' | 'wall' | 'opening' | 'style' | 'mode';

export interface RoomChange {
  name?: string;
  category?: 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'circulation' | 'outdoor' | 'utility' | 'puja';
  dimensions?: string;
  areaSqFt?: number;
  position?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    floorLevel?: number;
  };
  features?: string[];
  connections?: string[];
  color?: string;
}

export interface DesignDeltaItem {
  action: DeltaAction;
  entity: DeltaEntity;
  targetId?: string;
  room?: FloorPlanRoom;
  roomChanges?: RoomChange;
  styleChange?: string;
}

export interface StructuredDesignDelta {
  request: string;
  isFeasible: boolean;
  feasibilityExplanation?: string;
  changes: DesignDeltaItem[];
  tradeoffs: string[];
  constraintsPreserved: string[];
  summary: string;
}
