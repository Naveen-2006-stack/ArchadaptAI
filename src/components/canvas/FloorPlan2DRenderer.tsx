'use client';

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { StructuredDesignJSON, FloorPlanRoom } from '@/types/architectural';
import { ZoomIn, ZoomOut, RotateCcw, Layers, Eye } from 'lucide-react';
import { floorName, inferRoomType } from '@/lib/design/roomTypes';

interface FloorPlan2DRendererProps {
  design: StructuredDesignJSON;
  selectedRoomId?: string;
  onRoomSelect?: (room: FloorPlanRoom) => void;
}

const CANVAS = 800;
const MARGIN = 56;
const OPEN_AIR = ['courtyard', 'terrace', 'balcony', 'parking'];
const COMPASS_RING = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/**
 * Pure view of the canonical design. Every mark on the drawing comes from design.rooms,
 * design.walls and design.openings; nothing here invents or adjusts geometry.
 * The road is at the top of the sheet and the plot is drawn to scale.
 */
export default function FloorPlan2DRenderer({ design, selectedRoomId, onRoomSelect }: FloorPlan2DRendererProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showDimensions, setShowDimensions] = useState(true);
  const [selectedFloorLevel, setSelectedFloorLevel] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const availableFloors = useMemo(() => {
    const levels = Array.from(new Set(design.rooms.map((r) => r.position.floorLevel || 0))).sort((a, b) => a - b);
    return levels.map((level) => {
      const declared = design.floors?.find((f) => f.level === level);
      return {
        level,
        name: declared?.name || floorName(level),
        builtUpAreaSqFt: declared?.builtUpAreaSqFt ?? design.rooms.filter((r) => (r.position.floorLevel || 0) === level).reduce((sum, r) => sum + r.areaSqFt, 0)
      };
    });
  }, [design]);

  // A new design or version may have fewer floors than the one being viewed.
  useEffect(() => {
    if (!availableFloors.some((f) => f.level === selectedFloorLevel)) setSelectedFloorLevel(availableFloors[0]?.level ?? 0);
  }, [availableFloors, selectedFloorLevel]);

  const plotWidth = design.plot?.width || 40;
  const plotDepth = design.plot?.depth || 60;
  const scale = (CANVAS - MARGIN * 2) / Math.max(plotWidth, plotDepth); // px per foot
  const offsetX = (CANVAS - plotWidth * scale) / 2;
  const offsetY = (CANVAS - plotDepth * scale) / 2;
  const px = (pct: number) => offsetX + (pct / 100) * plotWidth * scale;
  const py = (pct: number) => offsetY + (pct / 100) * plotDepth * scale;
  const pw = (pct: number) => (pct / 100) * plotWidth * scale;
  const ph = (pct: number) => (pct / 100) * plotDepth * scale;

  const isCanonical = (design.schemaVersion || 1) >= 2;
  const visibleRooms = useMemo(() => design.rooms.filter((r) => (r.position.floorLevel || 0) === selectedFloorLevel), [design.rooms, selectedFloorLevel]);
  const visibleWalls = useMemo(() => (design.walls || []).filter((w) => (w.floorLevel ?? 0) === selectedFloorLevel), [design.walls, selectedFloorLevel]);
  const visibleOpenings = useMemo(
    () => (design.openings || []).filter((op) => (typeof op.floorLevel === 'number' ? op.floorLevel === selectedFloorLevel : selectedFloorLevel === 0)),
    [design.openings, selectedFloorLevel]
  );
  const activeFloor = availableFloors.find((f) => f.level === selectedFloorLevel);
  const selectedRoom = visibleRooms.find((r) => r.id === selectedRoomId);

  const setbacks = design.plot?.setbacks;
  const orientation = design.plot?.orientation || 'N';
  const northAngle = -Math.max(0, COMPASS_RING.indexOf(orientation)) * 45;
  const topFloor = availableFloors[availableFloors.length - 1]?.level ?? 0;

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="relative flex flex-col h-full w-full bg-[#F4F2EC] dark:bg-[#0F1115] border border-stone-300 dark:border-stone-800 overflow-hidden select-none">
      {/* Top Canvas Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-6 py-3 border-b border-stone-300 dark:border-stone-800 bg-[#F9F8F6]/80 dark:bg-stone-900/80 backdrop-blur-sm z-10 gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-stone-700 dark:text-stone-300">
            <Layers className="h-4 w-4 text-terracotta-500" />
            <span>2D Floor Plan</span>
            <span className="text-stone-400">|</span>
            <span className="text-stone-500 font-semibold">{plotWidth}' × {plotDepth}' Plot</span>
          </div>

          {availableFloors.length > 1 && (
            <div className="flex items-center border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 p-0.5 shadow-sm">
              {availableFloors.map((fl) => (
                <button
                  key={fl.level}
                  onClick={() => setSelectedFloorLevel(fl.level)}
                  className={`px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-all ${
                    fl.level === selectedFloorLevel
                      ? 'bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 font-bold'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                  }`}
                >
                  {fl.name}
                </button>
              ))}
            </div>
          )}

          {design.designSignature && (
            <span className="hidden lg:inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded">
              Strategy: {design.designSignature.planningType.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDimensions(!showDimensions)}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-all ${
              showDimensions
                ? 'border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
                : 'border-stone-300 text-stone-600 hover:border-stone-900'
            }`}
          >
            <Eye className="h-3.5 w-3.5 inline mr-1" />
            Annotations
          </button>
          <button onClick={() => setZoom((z) => Math.min(z + 0.2, 3))} className="p-1.5 border border-stone-300 dark:border-stone-700 hover:border-stone-900 text-stone-700 dark:text-stone-300" title="Zoom In">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button onClick={() => setZoom((z) => Math.max(z - 0.2, 0.6))} className="p-1.5 border border-stone-300 dark:border-stone-700 hover:border-stone-900 text-stone-700 dark:text-stone-300" title="Zoom Out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button onClick={resetView} className="p-1.5 border border-stone-300 dark:border-stone-700 hover:border-stone-900 text-stone-700 dark:text-stone-300" title="Reset View">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        className="relative flex-1 min-h-0 cursor-grab active:cursor-grabbing overflow-hidden bg-arch-grid dark:bg-arch-grid-dark flex items-center justify-center p-4"
      >
        {/* North arrow: the road is always at the top of the sheet */}
        <div className="absolute top-4 right-4 z-10 flex flex-col items-center bg-white/90 dark:bg-stone-900/90 backdrop-blur-sm p-3 border border-stone-300 dark:border-stone-700 shadow-sm">
          <svg width="34" height="34" viewBox="-17 -17 34 34" style={{ transform: `rotate(${northAngle}deg)` }}>
            <circle r="15" fill="none" stroke="#A8A297" strokeWidth="1" />
            <path d="M 0 -13 L 5 4 L 0 1 L -5 4 Z" fill="#C86A4B" />
            <text y="14" textAnchor="middle" fontSize="7" fontFamily="monospace" fontWeight="bold" fill="#63666A">N</text>
          </svg>
          <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-stone-800 dark:text-stone-200 mt-1">Faces {orientation}</span>
          {setbacks && (
            <span className="font-mono text-[9px] text-stone-500">Setbacks F{setbacks.front} R{setbacks.rear} S{setbacks.left}/{setbacks.right} ft</span>
          )}
        </div>

        {selectedRoom && (
          <div className="absolute bottom-4 left-4 z-10 max-w-xs bg-white/95 dark:bg-stone-900/95 backdrop-blur-sm p-3 border border-stone-300 dark:border-stone-700 shadow-sm font-mono text-[10px] text-stone-700 dark:text-stone-300 space-y-1">
            <div className="font-bold uppercase text-stone-900 dark:text-stone-100 text-[11px]">{selectedRoom.name}</div>
            <div>{selectedRoom.dimensions} • {selectedRoom.areaSqFt} sq ft • {(selectedRoom.roomType || selectedRoom.category).replace(/_/g, ' ')}</div>
            {selectedRoom.features.slice(0, 4).map((feature, index) => (
              <div key={index} className="font-sans text-stone-600 dark:text-stone-400 normal-case">• {feature}</div>
            ))}
          </div>
        )}

        <div
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: isDragging ? 'none' : 'transform 0.15s ease-out' }}
          className="h-full max-h-[820px] aspect-square max-w-full"
        >
          <svg viewBox={`0 0 ${CANVAS} ${CANVAS}`} className="w-full h-full drop-shadow-lg">
            <defs>
              <pattern id="open-air-hatch" width="10" height="10" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="10" stroke="#4A6B5D" strokeWidth="1" opacity="0.35" />
              </pattern>
            </defs>

            {/* Road, at the plan front */}
            <rect x={offsetX - 24} y={offsetY - 34} width={plotWidth * scale + 48} height="26" fill="#D5D0C7" />
            <text x={CANVAS / 2} y={offsetY - 17} textAnchor="middle" fill="#403D38" fontSize="11" fontFamily="monospace" fontWeight="bold">
              ROAD ({orientation})
            </text>

            {/* Plot boundary */}
            <rect x={offsetX} y={offsetY} width={plotWidth * scale} height={plotDepth * scale} fill="#EEF1EA" stroke="#78736A" strokeWidth="2" strokeDasharray="8 6" />
            <text x={offsetX + 4} y={offsetY + plotDepth * scale + 14} fill="#63666A" fontSize="10" fontFamily="monospace">
              PLOT {plotWidth}' × {plotDepth}' — {(activeFloor?.name || 'Ground Floor').toUpperCase()}
            </text>

            {/* Buildable envelope from the actual setbacks */}
            {setbacks && (
              <rect
                x={offsetX + setbacks.left * scale}
                y={offsetY + setbacks.front * scale}
                width={(plotWidth - setbacks.left - setbacks.right) * scale}
                height={(plotDepth - setbacks.front - setbacks.rear) * scale}
                fill="none"
                stroke="#D97E61"
                strokeWidth="1.2"
                strokeDasharray="4 4"
              />
            )}

            {/* Rooms of the active floor */}
            {visibleRooms.map((room) => {
              const type = inferRoomType(room);
              const rx = px(room.position.x);
              const ry = py(room.position.y);
              const rw = pw(room.position.width);
              const rh = ph(room.position.height);
              const isSelected = room.id === selectedRoomId;
              const isVoid = type === 'void';
              const openAir = OPEN_AIR.includes(type);
              const small = rw < 70 || rh < 44;
              const tiny = rw < 44 || rh < 26;
              const label = room.name.toUpperCase();
              const maxChars = Math.max(4, Math.floor(rw / (small ? 5.4 : 6.6)));
              const words = label.split(' ');
              const lines: string[] = [];
              for (const word of words) {
                if (lines.length && (lines[lines.length - 1] + ' ' + word).length <= maxChars) lines[lines.length - 1] += ' ' + word;
                else lines.push(word);
              }
              const shownLines = lines.slice(0, tiny ? 1 : small ? 2 : 3);
              const fontSize = tiny ? 7 : small ? 8.5 : 11;
              const textTop = ry + rh / 2 - ((shownLines.length - 1) * fontSize * 1.15) / 2 - (showDimensions && !small ? 8 : 0);

              return (
                <g key={room.id} onClick={() => onRoomSelect && onRoomSelect(room)} className="cursor-pointer">
                  <rect
                    x={rx}
                    y={ry}
                    width={rw}
                    height={rh}
                    fill={isVoid ? 'none' : room.color || '#F4F1EA'}
                    stroke={isSelected ? '#C86A4B' : isCanonical ? (openAir || isVoid ? '#78736A' : 'none') : '#121417'}
                    strokeWidth={isSelected ? 3 : isCanonical ? 1 : 2.5}
                    strokeDasharray={!isSelected && (openAir || isVoid) ? '5 4' : undefined}
                  />
                  {(openAir || isVoid) && <rect x={rx} y={ry} width={rw} height={rh} fill="url(#open-air-hatch)" pointerEvents="none" />}
                  {isVoid && (
                    <>
                      <line x1={rx} y1={ry} x2={rx + rw} y2={ry + rh} stroke="#78736A" strokeWidth="1" />
                      <line x1={rx + rw} y1={ry} x2={rx} y2={ry + rh} stroke="#78736A" strokeWidth="1" />
                    </>
                  )}

                  {/* Stair treads */}
                  {type === 'stair' && (
                    <g pointerEvents="none">
                      <line x1={rx + rw / 2} y1={ry + rh * 0.22} x2={rx + rw / 2} y2={ry + rh} stroke="#78736A" strokeWidth="1.5" />
                      {Array.from({ length: 8 }, (_, i) => (
                        <line key={i} x1={rx} y1={ry + rh * 0.22 + (rh * 0.78 * i) / 8} x2={rx + rw} y2={ry + rh * 0.22 + (rh * 0.78 * i) / 8} stroke="#78736A" strokeWidth="1" />
                      ))}
                    </g>
                  )}

                  {/* Furniture cues */}
                  {(design.furniture || []).filter((f) => f.roomId === room.id).map((f) => {
                    const fx = px(f.x);
                    const fy = py(f.y);
                    const fw = pw(f.width);
                    const fh = ph(f.height);
                    if (fw < 14 || fh < 8) return null;
                    return (
                      <g key={f.id} opacity="0.5" pointerEvents="none">
                        <rect x={fx} y={fy} width={fw} height={fh} fill="#E5DFD5" stroke="#78736A" strokeWidth="1" rx="2" />
                        {f.type === 'bed' && <rect x={fx + 2} y={fy + 2} width={fw - 4} height={fh / 4} fill="#C2BDCE" stroke="#78736A" strokeWidth="0.6" />}
                        {f.type === 'sofa' && <rect x={fx + 2} y={fy + fh / 2} width={fw - 4} height={fh / 2 - 2} fill="#C2BDCE" stroke="#78736A" strokeWidth="0.6" />}
                        {f.type === 'dining_table' && <ellipse cx={fx + fw / 2} cy={fy + fh / 2} rx={fw / 4} ry={fh / 4} fill="#C2BDCE" opacity="0.6" />}
                        {f.type === 'kitchen_counter' && (
                          <>
                            <circle cx={fx + fw * 0.25} cy={fy + fh / 2} r={Math.min(4, fh / 3)} fill="none" stroke="#78736A" strokeWidth="1" />
                            <circle cx={fx + fw * 0.45} cy={fy + fh / 2} r={Math.min(4, fh / 3)} fill="none" stroke="#78736A" strokeWidth="1" />
                          </>
                        )}
                      </g>
                    );
                  })}

                  {!isVoid && (
                    <text textAnchor="middle" fill="#121417" fontSize={fontSize} fontWeight="700" fontFamily="sans-serif" pointerEvents="none">
                      {shownLines.map((line, index) => (
                        <tspan key={index} x={rx + rw / 2} y={textTop + index * fontSize * 1.15}>{line}</tspan>
                      ))}
                    </text>
                  )}
                  {type === 'stair' && !tiny && (
                    <text x={rx + rw / 2} y={ry + rh * 0.16} textAnchor="middle" fontSize="8" fontFamily="monospace" fontWeight="bold" fill="#403D38" pointerEvents="none">
                      {selectedFloorLevel === 0 ? 'UP' : selectedFloorLevel === topFloor ? 'DN' : 'UP/DN'}
                    </text>
                  )}
                  {showDimensions && !small && !isVoid && (
                    <text x={rx + rw / 2} y={textTop + shownLines.length * fontSize * 1.15 + 3} textAnchor="middle" fill="#63666A" fontSize="9" fontFamily="monospace" pointerEvents="none">
                      {room.dimensions} • {room.areaSqFt} sq ft
                    </text>
                  )}
                </g>
              );
            })}

            {/* Walls (canonical designs carry them; older designs fall back to room outlines above) */}
            {visibleWalls.map((wall) => (
              <line
                key={wall.id}
                x1={px(wall.x1)}
                y1={py(wall.y1)}
                x2={px(wall.x2)}
                y2={py(wall.y2)}
                stroke="#121417"
                strokeWidth={wall.isExterior ? 5 : 2.5}
                strokeLinecap="square"
                pointerEvents="none"
              />
            ))}

            {/* Doors, openings and windows of the active floor, drawn in the wall they belong to */}
            {visibleOpenings.map((op) => {
              const ox = px(op.x);
              const oy = py(op.y);
              const horizontal = (op.orientation || 'horizontal') === 'horizontal';
              const length = Math.max(8, (isCanonical ? op.width : 3) * scale);
              const half = length / 2;
              const rotate = horizontal ? 0 : 90;

              return (
                <g key={op.id} transform={`translate(${ox} ${oy}) rotate(${rotate})`} pointerEvents="none">
                  <title>{op.label}</title>
                  {op.type === 'door' && (
                    <>
                      <rect x={-half} y={-4} width={length} height={8} fill="#F9F8F6" />
                      <line x1={-half} y1={0} x2={-half} y2={-length} stroke="#121417" strokeWidth="1.8" />
                      <path d={`M ${-half} ${-length} A ${length} ${length} 0 0 1 ${half} 0`} fill="none" stroke="#C86A4B" strokeWidth="1.2" strokeDasharray="3 3" />
                    </>
                  )}
                  {op.type === 'archway' && (
                    <>
                      <rect x={-half} y={-4} width={length} height={8} fill="#F9F8F6" />
                      <line x1={-half} y1={0} x2={half} y2={0} stroke="#78736A" strokeWidth="1" strokeDasharray="2 3" />
                    </>
                  )}
                  {op.type === 'sliding_glass' && (
                    <>
                      <rect x={-half} y={-4} width={length} height={8} fill="#F9F8F6" />
                      <line x1={-half} y1={-1.5} x2={half * 0.2} y2={-1.5} stroke="#2B5B84" strokeWidth="1.6" />
                      <line x1={-half * 0.2} y1={1.5} x2={half} y2={1.5} stroke="#2B5B84" strokeWidth="1.6" />
                    </>
                  )}
                  {op.type === 'window' && (
                    <>
                      <rect x={-half} y={-3.5} width={length} height={7} fill="#E3ECE9" stroke="#2B5B84" strokeWidth="1.2" />
                      <line x1={-half} y1={0} x2={half} y2={0} stroke="#2B5B84" strokeWidth="1" />
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Footer: figures for the active floor, read from the same design */}
      <div className="px-6 py-2.5 border-t border-stone-300 dark:border-stone-800 bg-[#F9F8F6] dark:bg-stone-900 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-[11px] font-mono text-stone-600 dark:text-stone-400">
        <div>
          FLOOR: <span className="text-terracotta-600 dark:text-terracotta-400 font-bold uppercase">{activeFloor?.name}</span> (
          <span className="text-stone-900 dark:text-stone-100 font-bold">{activeFloor?.builtUpAreaSqFt || 0} SQ FT</span>, {visibleRooms.filter((r) => inferRoomType(r) !== 'void').length} rooms)
        </div>
        <div>
          TOTAL BUILT-UP: <span className="text-stone-900 dark:text-stone-100 font-bold">{design.totalBuiltUpAreaSqFt} SQ FT</span>
        </div>
        {design.buildableAreaSqFt ? (
          <div>
            BUILDABLE / FLOOR: <span className="text-stone-900 dark:text-stone-100 font-bold">{design.buildableAreaSqFt} SQ FT</span>
          </div>
        ) : null}
        <div className="hidden xl:block text-stone-400">Door ◜ &nbsp; Opening ┄ &nbsp; Window ▭ &nbsp; Open-air ▨</div>
      </div>
    </div>
  );
}
