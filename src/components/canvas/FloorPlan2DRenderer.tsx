'use client';

import React, { useState, useRef, useMemo } from 'react';
import { StructuredDesignJSON, FloorPlanRoom } from '@/types/architectural';
import { ZoomIn, ZoomOut, RotateCcw, Compass, Layers, Eye, ShieldCheck } from 'lucide-react';

interface FloorPlan2DRendererProps {
  design: StructuredDesignJSON;
  selectedRoomId?: string;
  onRoomSelect?: (room: FloorPlanRoom) => void;
}

export default function FloorPlan2DRenderer({ design, selectedRoomId, onRoomSelect }: FloorPlan2DRendererProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showDimensions, setShowDimensions] = useState(true);
  const [selectedFloorLevel, setSelectedFloorLevel] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Determine available floor levels
  const availableFloors = useMemo(() => {
    if (design.floors && design.floors.length > 0) {
      return design.floors;
    }
    const levelsSet = new Set(design.rooms.map((r) => r.position.floorLevel || 0));
    const levels = Array.from(levelsSet).sort((a, b) => a - b);
    return levels.map((lvl) => ({
      level: lvl,
      name: lvl === 0 ? 'Ground Floor' : lvl === 1 ? 'First Floor' : `Floor ${lvl + 1}`,
      builtUpAreaSqFt: design.rooms.filter((r) => (r.position.floorLevel || 0) === lvl).reduce((sum, r) => sum + r.areaSqFt, 0)
    }));
  }, [design]);

  const hasMultipleFloors = availableFloors.length > 1;

  // Filter rooms for active floor level
  const visibleRooms = useMemo(() => {
    return design.rooms.filter((r) => (r.position.floorLevel || 0) === selectedFloorLevel);
  }, [design.rooms, selectedFloorLevel]);

  const activeFloorInfo = useMemo(() => {
    const activeFl = availableFloors.find((f) => f.level === selectedFloorLevel);
    const activeArea = visibleRooms.reduce((sum, r) => sum + r.areaSqFt, 0);
    return {
      name: activeFl?.name || (selectedFloorLevel === 0 ? 'Ground Floor' : 'First Floor'),
      areaSqFt: activeFl?.builtUpAreaSqFt || activeArea
    };
  }, [availableFloors, selectedFloorLevel, visibleRooms]);

  const setbacks = design.plot?.setbacks || { front: 8, rear: 5, left: 4, right: 4 };

  return (
    <div className="relative flex flex-col h-full w-full bg-[#F4F2EC] dark:bg-[#0F1115] border border-stone-300 dark:border-stone-800 overflow-hidden select-none">
      {/* Top Canvas Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-6 py-3 border-b border-stone-300 dark:border-stone-800 bg-[#F9F8F6]/80 dark:bg-stone-900/80 backdrop-blur-sm z-10 gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-stone-700 dark:text-stone-300">
            <Layers className="h-4 w-4 text-terracotta-500" />
            <span>2D Conceptual Plan</span>
            <span className="text-stone-400">|</span>
            <span className="text-stone-500 font-semibold">{design.plot.width}' × {design.plot.depth}' Plot</span>
          </div>

          {/* Floor Selector Buttons */}
          {hasMultipleFloors && (
            <div className="flex items-center border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 p-0.5 shadow-sm">
              {availableFloors.map((fl) => {
                const isSelected = fl.level === selectedFloorLevel;
                return (
                  <button
                    key={fl.level}
                    onClick={() => setSelectedFloorLevel(fl.level)}
                    className={`px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-all ${
                      isSelected
                        ? 'bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 font-bold'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                    }`}
                  >
                    {fl.name}
                  </button>
                );
              })}
            </div>
          )}

          {design.designSignature && (
            <span className="hidden lg:inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded">
              Strategy: {design.designSignature.planningType.replace('_', ' ')}
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
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.2, 2.5))}
            className="p-1.5 border border-stone-300 dark:border-stone-700 hover:border-stone-900 text-stone-700 dark:text-stone-300"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.2, 0.6))}
            className="p-1.5 border border-stone-300 dark:border-stone-700 hover:border-stone-900 text-stone-700 dark:text-stone-300"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={resetView}
            className="p-1.5 border border-stone-300 dark:border-stone-700 hover:border-stone-900 text-stone-700 dark:text-stone-300"
            title="Reset View"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="relative flex-1 cursor-grab active:cursor-grabbing overflow-hidden bg-arch-grid dark:bg-arch-grid-dark flex items-center justify-center p-8"
      >
        {/* Orientation Compass & Road Marker */}
        <div className="absolute top-6 right-6 z-10 flex flex-col items-center bg-white/90 dark:bg-stone-900/90 backdrop-blur-sm p-3 border border-stone-300 dark:border-stone-700 shadow-sm">
          <Compass className="h-6 w-6 text-terracotta-500 animate-pulse" />
          <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-stone-800 dark:text-stone-200 mt-1">
            {design.plot.orientation} ROAD FACING
          </span>
          <span className="font-mono text-[9px] text-stone-500">
            Setbacks: Front {setbacks.front}ft • Rear {setbacks.rear}ft
          </span>
        </div>

        {/* SVG Drawing Canvas */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out'
          }}
          className="w-full max-w-[760px] aspect-square"
        >
          <svg viewBox="0 0 800 800" className="w-full h-full drop-shadow-lg">
            <defs>
              <pattern id="hatch" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="8" stroke="#121417" strokeWidth="1.5" />
              </pattern>
            </defs>

            {/* Plot Boundary Grid & Road Indicator */}
            <rect x="20" y="20" width="760" height="760" fill="none" stroke="#78736A" strokeWidth="2.5" strokeDasharray="8 8" />
            <text x="30" y="45" fill="#403D38" fontSize="11" fontFamily="monospace" fontWeight="bold">
              SITE BOUNDARY ({design.plot.width}' × {design.plot.depth}') — {activeFloorInfo.name.toUpperCase()}
            </text>

            {/* Setback Buildable Envelope (Dotted Yellow Line) */}
            <rect
              x="50"
              y="60"
              width="700"
              height="680"
              fill="none"
              stroke="#D97E61"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <text x="60" y="78" fill="#B25638" fontSize="10" fontFamily="monospace">
              BUILDABLE ENVELOPE (Front Setback: {setbacks.front}ft)
            </text>

            {/* Staircase Representation (Ground Floor) */}
            {selectedFloorLevel === 0 && (design.stairs || []).map((stair) => {
              const sx = (stair.x / 100) * 720 + 40;
              const sy = (stair.y / 100) * 720 + 40;
              const sw = (stair.width / 100) * 720;
              const sh = (stair.height / 100) * 720;

              return (
                <g key={stair.id}>
                  <rect x={sx} y={sy} width={sw} height={sh} fill="#EAE6DF" stroke="#121417" strokeWidth="2" />
                  {[1, 2, 3, 4, 5].map((step) => (
                    <line
                      key={step}
                      x1={sx}
                      y1={sy + (sh / 6) * step}
                      x2={sx + sw}
                      y2={sy + (sh / 6) * step}
                      stroke="#78736A"
                      strokeWidth="1.5"
                    />
                  ))}
                  <text x={sx + sw / 2} y={sy + sh / 2 + 3} textAnchor="middle" fontSize="10" fontFamily="monospace" fontWeight="bold" fill="#121417">
                    STAIR UP ↑
                  </text>
                </g>
              );
            })}

            {/* Active Floor Rooms */}
            {visibleRooms.map((room) => {
              const rx = (room.position.x / 100) * 720 + 40;
              const ry = (room.position.y / 100) * 720 + 40;
              const rw = (room.position.width / 100) * 720;
              const rh = (room.position.height / 100) * 720;
              const isSelected = room.id === selectedRoomId;

              return (
                <g
                  key={room.id}
                  onClick={() => onRoomSelect && onRoomSelect(room)}
                  className="cursor-pointer group"
                >
                  {/* Room Area Fill */}
                  <rect
                    x={rx}
                    y={ry}
                    width={rw}
                    height={rh}
                    fill={room.color || '#F4F1EA'}
                    stroke={isSelected ? '#C86A4B' : '#121417'}
                    strokeWidth={isSelected ? '4' : '2.5'}
                    className="transition-all hover:fill-amber-100/50"
                  />

                  {/* Room Label */}
                  <text
                    x={rx + rw / 2}
                    y={ry + rh / 2 - 10}
                    textAnchor="middle"
                    fill="#121417"
                    fontSize="13"
                    fontWeight="700"
                    fontFamily="sans-serif"
                  >
                    {room.name.toUpperCase()}
                  </text>

                  {/* Room Dimensions & Zoning Tag */}
                  {showDimensions && (
                    <>
                      <text
                        x={rx + rw / 2}
                        y={ry + rh / 2 + 10}
                        textAnchor="middle"
                        fill="#63666A"
                        fontSize="11"
                        fontFamily="monospace"
                      >
                        {room.dimensions} ({room.areaSqFt} sq ft)
                      </text>
                      {room.zoningCategory && (
                        <text
                          x={rx + rw / 2}
                          y={ry + rh / 2 + 24}
                          textAnchor="middle"
                          fill="#B25638"
                          fontSize="9"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          [{room.zoningCategory.toUpperCase()}]
                        </text>
                      )}
                    </>
                  )}

                  {/* Conceptual Furniture Symbols */}
                  {(design.furniture || []).filter((f) => f.roomId === room.id).map((f) => {
                    const fx = (f.x / 100) * 720 + 40;
                    const fy = (f.y / 100) * 720 + 40;
                    const fw = (f.width / 100) * 720;
                    const fh = (f.height / 100) * 720;

                    if (f.type === 'sofa') {
                      return (
                        <g key={f.id} opacity="0.65">
                          <rect x={fx} y={fy} width={fw} height={fh} fill="#D9D5CC" stroke="#78736A" strokeWidth="1.2" rx="2" />
                          <rect x={fx + 2} y={fy + 2} width={fw - 4} height={fh / 2} fill="#C2BDCE" stroke="#78736A" strokeWidth="0.8" />
                        </g>
                      );
                    }

                    if (f.type === 'dining_table') {
                      return (
                        <g key={f.id} opacity="0.65">
                          <rect x={fx} y={fy} width={fw} height={fh} fill="#E5DFD5" stroke="#78736A" strokeWidth="1.2" rx="3" />
                          <circle cx={fx + fw / 2} cy={fy + fh / 2} r={Math.min(fw, fh) / 4} fill="#C2BDCE" opacity="0.4" />
                        </g>
                      );
                    }

                    if (f.type === 'bed') {
                      return (
                        <g key={f.id} opacity="0.65">
                          <rect x={fx} y={fy} width={fw} height={fh} fill="#EAE6DF" stroke="#78736A" strokeWidth="1.2" rx="2" />
                          <rect x={fx + 2} y={fy + 2} width={fw - 4} height={fh / 4} fill="#C2BDCE" stroke="#78736A" strokeWidth="0.8" />
                        </g>
                      );
                    }

                    if (f.type === 'kitchen_counter') {
                      return (
                        <g key={f.id} opacity="0.65">
                          <rect x={fx} y={fy} width={fw} height={fh} fill="#DCE5E1" stroke="#78736A" strokeWidth="1.2" />
                          <circle cx={fx + fw * 0.25} cy={fy + fh / 2} r="4" fill="none" stroke="#78736A" strokeWidth="1" />
                          <circle cx={fx + fw * 0.45} cy={fy + fh / 2} r="4" fill="none" stroke="#78736A" strokeWidth="1" />
                        </g>
                      );
                    }

                    return (
                      <rect key={f.id} x={fx} y={fy} width={fw} height={fh} fill="#D9D5CC" stroke="#78736A" strokeWidth="1" opacity="0.5" rx="1" />
                    );
                  })}
                </g>
              );
            })}

            {/* Heavy Structural Walls */}
            {design.walls.map((wall) => {
              const x1 = (wall.x1 / 100) * 720 + 40;
              const y1 = (wall.y1 / 100) * 720 + 40;
              const x2 = (wall.x2 / 100) * 720 + 40;
              const y2 = (wall.y2 / 100) * 720 + 40;

              return (
                <line
                  key={wall.id}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#121417"
                  strokeWidth={wall.isExterior ? '7' : '3.5'}
                  strokeLinecap="square"
                />
              );
            })}

            {/* Architectural Openings: Door Swing Arcs & Windows */}
            {design.openings.map((op) => {
              const ox = (op.x / 100) * 720 + 40;
              const oy = (op.y / 100) * 720 + 40;

              if (op.type === 'door') {
                return (
                  <g key={op.id}>
                    {/* Door Frame & Opening */}
                    <rect x={ox - 16} y={oy - 4} width="32" height="8" fill="#F9F8F6" stroke="#121417" strokeWidth="1.5" />
                    {/* Door Leaf & Arc */}
                    <path
                      d={`M ${ox - 16} ${oy} A 28 28 0 0 1 ${ox + 12} ${oy - 24}`}
                      fill="none"
                      stroke="#C86A4B"
                      strokeWidth="1.8"
                      strokeDasharray="3 3"
                    />
                    <line x1={ox - 16} y1={oy} x2={ox - 16} y2={oy - 28} stroke="#121417" strokeWidth="2.5" />
                  </g>
                );
              }

              if (op.type === 'window' || op.type === 'sliding_glass') {
                return (
                  <g key={op.id}>
                    <rect x={ox - 22} y={oy - 5} width="44" height="10" fill="#E3ECE9" stroke="#2B5B84" strokeWidth="2" />
                    <line x1={ox - 22} y1={oy} x2={ox + 22} y2={oy} stroke="#2B5B84" strokeWidth="1.5" />
                  </g>
                );
              }

              return null;
            })}
          </svg>
        </div>
      </div>

      {/* Footer Info Bar updating for Active Floor */}
      <div className="px-6 py-2.5 border-t border-stone-300 dark:border-stone-800 bg-[#F9F8F6] dark:bg-stone-900 flex items-center justify-between text-[11px] font-mono text-stone-600">
        <div>
          ACTIVE FLOOR: <span className="text-terracotta-600 dark:text-terracotta-400 font-bold uppercase">{activeFloorInfo.name}</span> (
          <span className="text-stone-900 dark:text-stone-100 font-bold">{activeFloorInfo.areaSqFt} SQ FT</span>)
        </div>
        <div>
          TOTAL BUILT-UP: <span className="text-stone-900 dark:text-stone-100 font-bold">{design.totalBuiltUpAreaSqFt} SQ FT</span>
        </div>
        <div>
          BUILDABLE ENVELOPE: <span className="text-stone-900 dark:text-stone-100 font-bold">{design.buildableAreaSqFt || 1900} SQ FT</span>
        </div>
      </div>
    </div>
  );
}
