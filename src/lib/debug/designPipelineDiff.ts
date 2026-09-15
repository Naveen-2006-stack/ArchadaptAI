import { StructuredDesignJSON } from '@/types/architectural';

export interface PipelineDiffReport {
  roomsAdded: string[];
  roomsRemoved: string[];
  coordinatesChanged: {
    roomId: string;
    roomName: string;
    raw: { x: number; y: number; width: number; height: number; floorLevel: number };
    final: { x: number; y: number; width: number; height: number; floorLevel: number };
  }[];
  footprintChanged: boolean;
  planningStrategyChanged: boolean;
  geminiGeneratedLayout: boolean;
  postProcessorOverwroteGeometry: boolean;
  summary: string;
}

/**
 * Compares raw Gemini-generated StructuredDesignJSON with the final StructuredDesignJSON
 * to identify whether post-processing or validators altered the room geometry.
 */
export function diffDesignPipeline(
  rawGemini: StructuredDesignJSON | null,
  finalDesign: StructuredDesignJSON
): PipelineDiffReport {
  if (!rawGemini || !rawGemini.rooms || rawGemini.rooms.length === 0) {
    return {
      roomsAdded: [],
      roomsRemoved: [],
      coordinatesChanged: [],
      footprintChanged: false,
      planningStrategyChanged: false,
      geminiGeneratedLayout: false,
      postProcessorOverwroteGeometry: true,
      summary: 'Raw Gemini design was empty or failed parsing. Dynamic constraint solver generated the geometry.'
    };
  }

  const rawRoomIds = new Set(rawGemini.rooms.map((r) => r.id));
  const finalRoomIds = new Set(finalDesign.rooms.map((r) => r.id));

  const roomsAdded = finalDesign.rooms.filter((r) => !rawRoomIds.has(r.id)).map((r) => r.name);
  const roomsRemoved = rawGemini.rooms.filter((r) => !finalRoomIds.has(r.id)).map((r) => r.name);

  const coordinatesChanged: PipelineDiffReport['coordinatesChanged'] = [];

  for (const rawRoom of rawGemini.rooms) {
    const finalRoom = finalDesign.rooms.find((r) => r.id === rawRoom.id);
    if (!finalRoom) continue;

    const rp = rawRoom.position;
    const fp = finalRoom.position;

    if (
      rp.x !== fp.x ||
      rp.y !== fp.y ||
      rp.width !== fp.width ||
      rp.height !== fp.height ||
      rp.floorLevel !== fp.floorLevel
    ) {
      coordinatesChanged.push({
        roomId: rawRoom.id,
        roomName: rawRoom.name,
        raw: { ...rp },
        final: { ...fp }
      });
    }
  }

  const footprintChanged =
    rawGemini.footprint?.shapeType !== finalDesign.footprint?.shapeType;
  const planningStrategyChanged =
    rawGemini.designSignature?.planningType !== finalDesign.designSignature?.planningType;

  const postProcessorOverwroteGeometry = coordinatesChanged.length > 0 || roomsAdded.length > 0 || roomsRemoved.length > 0;

  const summary = postProcessorOverwroteGeometry
    ? `Post-processor modified geometry for ${coordinatesChanged.length} room(s).`
    : 'Gemini-generated room coordinates passed through 100% untouched to final design.';

  return {
    roomsAdded,
    roomsRemoved,
    coordinatesChanged,
    footprintChanged,
    planningStrategyChanged,
    geminiGeneratedLayout: true,
    postProcessorOverwroteGeometry,
    summary
  };
}
