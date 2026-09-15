import { StructuredDesignJSON, FloorPlanRoom } from '@/types/architectural';
import { StructuredDesignDelta } from '@/types/delta';
import { validateFloorPlan } from './validateFloorPlan';

export function applyDeltaToDesign(
  currentDesign: StructuredDesignJSON,
  delta: StructuredDesignDelta
): { updatedDesign: StructuredDesignJSON; tradeOffs: string[]; summary: string } {
  if (!delta.isFeasible) {
    return {
      updatedDesign: currentDesign,
      tradeOffs: delta.tradeoffs || ['Requested modification is infeasible under current plot constraints.'],
      summary: delta.feasibilityExplanation || 'Modification cannot be safely applied.'
    };
  }

  // Deep clone current design
  const updated: StructuredDesignJSON = JSON.parse(JSON.stringify(currentDesign));

  delta.changes.forEach((item) => {
    if (item.entity === 'room') {
      if (item.action === 'add' && item.room) {
        // Prevent duplicate room IDs
        const existingIdx = updated.rooms.findIndex(r => r.id === item.room?.id);
        if (existingIdx === -1) {
          updated.rooms.push(item.room);
          updated.totalBuiltUpAreaSqFt += item.room.areaSqFt || 150;
        }
      } else if (item.action === 'modify' && item.targetId && item.roomChanges) {
        const tid = item.targetId.toLowerCase();
        const roomIdx = updated.rooms.findIndex(r => r.id === item.targetId || r.name.toLowerCase().includes(tid));
        if (roomIdx !== -1) {
          const target = updated.rooms[roomIdx];
          const c = item.roomChanges;

          if (c.name) target.name = c.name;
          if (c.dimensions) target.dimensions = c.dimensions;
          if (c.areaSqFt) {
            updated.totalBuiltUpAreaSqFt += (c.areaSqFt - target.areaSqFt);
            target.areaSqFt = c.areaSqFt;
          }
          if (c.position) {
            if (c.position.x !== undefined) target.position.x = c.position.x;
            if (c.position.y !== undefined) target.position.y = c.position.y;
            if (c.position.width !== undefined) target.position.width = c.position.width;
            if (c.position.height !== undefined) target.position.height = c.position.height;
          }
          if (c.features) target.features = [...target.features, ...c.features];
        }
      } else if (item.action === 'remove' && item.targetId) {
        const tid = item.targetId.toLowerCase();
        const roomIdx = updated.rooms.findIndex(r => r.id === item.targetId || r.name.toLowerCase().includes(tid));
        if (roomIdx !== -1) {
          const removed = updated.rooms.splice(roomIdx, 1)[0];
          updated.totalBuiltUpAreaSqFt -= (removed.areaSqFt || 150);
        }
      }
    } else if (item.entity === 'style' && item.styleChange) {
      updated.styleFeatures = [item.styleChange, ...updated.styleFeatures.slice(0, 2)];
    }
  });

  // Validate resulting layout
  const validation = validateFloorPlan(updated);
  const finalDesign = validation.repairedDesign || updated;

  return {
    updatedDesign: finalDesign,
    tradeOffs: delta.tradeoffs,
    summary: delta.summary
  };
}
