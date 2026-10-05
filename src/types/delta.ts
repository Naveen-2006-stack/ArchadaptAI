import { HouseAppearance, PlanBand, PlanSide, RoomType } from './architectural';

/**
 * A What-If change is a small list of operations on the room programme of an existing design.
 * The geometry is then re-derived by the layout engine and re-validated; the delta never carries coordinates.
 */
export type ProgramDeltaOp =
  | { op: 'add_room'; type: RoomType; name?: string; floor?: number; areaSqFt?: number; band?: PlanBand; side?: PlanSide; attachedTo?: string }
  | { op: 'remove_room'; target: string }
  | { op: 'resize_room'; target: string; areaSqFt?: number; scale?: number }
  | { op: 'move_room'; target: string; floor?: number; band?: PlanBand; side?: PlanSide; nextTo?: string }
  | { op: 'rename_room'; target: string; name: string }
  | { op: 'add_floor' }
  | { op: 'set_appearance'; appearance: Partial<HouseAppearance> };

export interface ProgramDelta {
  understood: boolean;
  summary: string;
  tradeOffs: string[];
  ops: ProgramDeltaOp[];
}
