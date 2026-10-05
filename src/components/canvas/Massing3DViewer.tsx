'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei';
import { StructuredDesignJSON, HouseAppearance } from '@/types/architectural';
import { buildHouseGeometry, HouseGeometry3D } from '@/lib/geometry/buildHouseGeometry';
import { getHouseMaterials, HouseMaterialSystem } from '@/lib/geometry/materials';
import { floorName } from '@/lib/design/roomTypes';
import AppearancePanel from '@/components/workspace/AppearancePanel';
import { Box, Palette, Home } from 'lucide-react';

interface Massing3DViewerProps {
  design: StructuredDesignJSON;
  onAppearanceChange?: (updatedAppearance: HouseAppearance) => void;
}

type LightingMode = 'day' | 'evening' | 'night';

const DEFAULT_APPEARANCE: HouseAppearance = { wallColor: '#F4F1EA', roofColor: '#C86A4B', frameColor: '#121417', accentMaterial: 'wood' };

function StyleAwareRoofMesh({ roof, materials }: { roof: HouseGeometry3D['roofs'][0]; materials: HouseMaterialSystem }) {
  if (roof.type === 'sloped_hipped_gable') {
    const [width, height, depth] = roof.size;
    return (
      <group position={roof.position}>
        {/* Hipped roof: a four-sided pyramid stretched to the plan proportions */}
        <group scale={[width / Math.SQRT2, 1, depth / Math.SQRT2]}>
          <mesh rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
            <coneGeometry args={[1, height, 4]} />
            <meshStandardMaterial color={materials.roof.color} roughness={materials.roof.roughness} metalness={materials.roof.metalness} />
          </mesh>
        </group>
        <mesh position={[0, -height / 2 + 0.06, 0]} castShadow receiveShadow>
          <boxGeometry args={[width, 0.12, depth]} />
          <meshStandardMaterial color={materials.roof.color} roughness={0.7} />
        </mesh>
      </group>
    );
  }

  if (roof.type === 'minimal_slab') {
    return (
      <mesh position={roof.position} castShadow receiveShadow>
        <boxGeometry args={roof.size} />
        <meshStandardMaterial color={materials.roof.color} roughness={materials.roof.roughness} />
      </mesh>
    );
  }

  return (
    <group position={roof.position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={roof.size} />
        <meshStandardMaterial color={materials.roof.color} roughness={materials.roof.roughness} />
      </mesh>
      <mesh position={[0, roof.size[1] / 2 + 0.05, 0]}>
        <boxGeometry args={[roof.size[0] + 0.08, 0.1, roof.size[2] + 0.08]} />
        <meshStandardMaterial color="#78736A" roughness={0.4} />
      </mesh>
    </group>
  );
}

function ArchitecturalBuildingModel({
  geometry,
  materials,
  lightingMode,
  visibleUpTo,
  showRoof
}: {
  geometry: HouseGeometry3D;
  materials: HouseMaterialSystem;
  lightingMode: LightingMode;
  visibleUpTo: number;
  showRoof: boolean;
}) {
  const lit = lightingMode !== 'day';
  const shown = <T extends { floorLevel: number }>(items: T[]) => items.filter((item) => item.floorLevel <= visibleUpTo);
  const topVisible = visibleUpTo;
  // The ceiling of the highest visible floor is lifted off with the roof so the rooms can be seen.
  const ceilings = shown(geometry.ceilings).filter((ceiling) => showRoof || ceiling.floorLevel < topVisible);

  return (
    <group>
      {/* Plot and driveway */}
      <mesh position={geometry.plotPosition} receiveShadow>
        <boxGeometry args={geometry.plotSize} />
        <meshStandardMaterial color={materials.lawn.color} roughness={materials.lawn.roughness} />
      </mesh>
      <mesh position={geometry.drivewayPosition} receiveShadow>
        <boxGeometry args={geometry.drivewaySize} />
        <meshStandardMaterial color={materials.driveway.color} roughness={materials.driveway.roughness} />
      </mesh>

      {/* One floor plate per canonical room */}
      {shown(geometry.rooms).map((room) => (
        <mesh key={room.id} position={room.position} receiveShadow>
          <boxGeometry args={room.size} />
          <meshStandardMaterial color={room.color} roughness={room.isOpen ? 0.95 : 0.75} />
        </mesh>
      ))}

      {ceilings.map((slab, index) => (
        <mesh key={`ceiling-${index}`} position={slab.position} castShadow receiveShadow>
          <boxGeometry args={slab.size} />
          <meshStandardMaterial color="#C8C2B8" roughness={0.7} />
        </mesh>
      ))}

      {/* Walls, cut by the canonical doors and windows */}
      {shown(geometry.walls).map((wall, index) => (
        <mesh key={`wall-${index}`} position={wall.position} castShadow receiveShadow>
          <boxGeometry args={wall.size} />
          <meshStandardMaterial color={materials.wall.color} roughness={materials.wall.roughness} metalness={materials.wall.metalness} />
        </mesh>
      ))}

      {shown(geometry.openings).map((opening) =>
        opening.kind === 'door' ? (
          <mesh key={opening.id} position={opening.position} castShadow>
            <boxGeometry args={opening.size} />
            <meshStandardMaterial color={materials.woodAccent.color} roughness={materials.woodAccent.roughness} />
          </mesh>
        ) : (
          <mesh key={opening.id} position={opening.position}>
            <boxGeometry args={opening.size} />
            <meshPhysicalMaterial
              color={lit ? '#FCE38A' : materials.glass.color}
              transmission={lit ? 0.2 : materials.glass.transmission}
              opacity={materials.glass.opacity}
              transparent
              roughness={materials.glass.roughness}
              emissive={lightingMode === 'night' ? '#FCE38A' : lightingMode === 'evening' ? '#FFB347' : '#000000'}
              emissiveIntensity={lightingMode === 'night' ? 0.7 : lightingMode === 'evening' ? 0.3 : 0}
            />
          </mesh>
        )
      )}

      {/* Stair flights between floors */}
      {shown(geometry.stairSteps).map((step, index) => (
        <mesh key={`step-${index}`} position={step.position} castShadow receiveShadow>
          <boxGeometry args={step.size} />
          <meshStandardMaterial color="#A8A297" roughness={0.6} />
        </mesh>
      ))}

      {shown(geometry.railings).map((rail, index) => (
        <mesh key={`rail-${index}`} position={rail.position}>
          <boxGeometry args={rail.size} />
          <meshPhysicalMaterial color="#2B5B84" transmission={0.7} opacity={0.5} transparent roughness={0.2} />
        </mesh>
      ))}

      {shown(geometry.pillars).map((pillar, index) => (
        <mesh key={`pillar-${index}`} position={pillar.position} castShadow receiveShadow>
          <cylinderGeometry args={[pillar.radius, pillar.radius, pillar.height, 16]} />
          <meshStandardMaterial color={materials.woodAccent.color} roughness={materials.woodAccent.roughness} />
        </mesh>
      ))}

      {showRoof && visibleUpTo >= geometry.totalFloors - 1 && geometry.roofs.map((roof, index) => (
        <StyleAwareRoofMesh key={index} roof={roof} materials={materials} />
      ))}
    </group>
  );
}

export default function Massing3DViewer({ design, onAppearanceChange }: Massing3DViewerProps) {
  const [lightingMode, setLightingMode] = useState<LightingMode>('day');
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [showRoof, setShowRoof] = useState(true);
  const [localAppearance, setLocalAppearance] = useState<HouseAppearance>(design.appearance || DEFAULT_APPEARANCE);

  // The model always follows the design it is given: no stale copy, no manual "regenerate".
  const houseGeometry = useMemo(() => buildHouseGeometry(design), [design]);
  const [visibleUpTo, setVisibleUpTo] = useState(houseGeometry.totalFloors - 1);

  useEffect(() => {
    setLocalAppearance(design.appearance || DEFAULT_APPEARANCE);
    setVisibleUpTo(houseGeometry.totalFloors - 1);
  }, [design, houseGeometry.totalFloors]);

  const handleAppearanceUpdate = (updated: HouseAppearance) => {
    setLocalAppearance(updated);
    if (onAppearanceChange) onAppearanceChange(updated);
  };

  const materials = useMemo(() => getHouseMaterials(localAppearance, design.constraints?.style), [localAppearance, design.constraints?.style]);

  const distance = houseGeometry.recommendedCameraDistance;
  // The road is at -Z, so the default view looks at the front of the house from the road side.
  const camPos: [number, number, number] = [houseGeometry.cameraTarget[0] + distance * 0.6, distance * 0.6, houseGeometry.cameraTarget[2] - distance * 0.75];
  const environmentPreset = lightingMode === 'night' ? 'night' : lightingMode === 'evening' ? 'sunset' : 'city';
  const floorLevels = Array.from({ length: houseGeometry.totalFloors }, (_, level) => level);

  return (
    <div className="relative flex flex-col h-full w-full bg-[#EFECE6] dark:bg-[#0B0C0E] border border-stone-300 dark:border-stone-800 overflow-hidden select-none">
      {/* 3D Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-6 py-3 border-b border-stone-300 dark:border-stone-800 bg-[#F9F8F6]/80 dark:bg-stone-900/80 backdrop-blur-sm z-10 gap-3">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-stone-700 dark:text-stone-300">
          <Box className="h-4 w-4 text-terracotta-500" />
          <span>3D Model — {houseGeometry.totalFloors} {houseGeometry.totalFloors === 1 ? 'Storey' : 'Storeys'}, {houseGeometry.rooms.length} Rooms</span>
          <span className="text-stone-400">|</span>
          <span className="text-amber-800 dark:text-amber-400 font-semibold">{houseGeometry.styleName}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Floors to show: lower the cut to look inside */}
          {floorLevels.length > 1 && (
            <div className="flex items-center border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 p-0.5">
              {floorLevels.map((level) => (
                <button
                  key={level}
                  onClick={() => setVisibleUpTo(level)}
                  title={`Show the model up to the ${floorName(level).toLowerCase()}`}
                  className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-all ${
                    visibleUpTo === level
                      ? 'bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 font-bold'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                  }`}
                >
                  {level === houseGeometry.totalFloors - 1 ? 'All Floors' : floorName(level)}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowRoof(!showRoof)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-all ${
              showRoof
                ? 'border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
                : 'border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300'
            }`}
            title="Lift the roof off to see the rooms"
          >
            <Home className="h-3.5 w-3.5" />
            Roof {showRoof ? 'On' : 'Off'}
          </button>

          <button
            onClick={() => setIsAppearanceOpen(!isAppearanceOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 hover:border-stone-900 transition-all shadow-sm"
          >
            <Palette className="h-3.5 w-3.5 text-terracotta-500" />
            Appearance
          </button>

          <div className="flex items-center border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 p-0.5">
            {(['day', 'evening', 'night'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setLightingMode(mode)}
                className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-all ${
                  lightingMode === mode
                    ? 'bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 font-bold'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isAppearanceOpen && (
        <AppearancePanel
          appearance={localAppearance}
          onChange={handleAppearanceUpdate}
          onClose={() => setIsAppearanceOpen(false)}
        />
      )}

      {/* R3F Canvas Container */}
      <div className="relative flex-1 w-full h-full">
        <Canvas shadows>
          <PerspectiveCamera makeDefault position={camPos} fov={40} />
          <OrbitControls
            enablePan
            enableZoom
            target={houseGeometry.cameraTarget}
            minDistance={5}
            maxDistance={distance * 3}
            maxPolarAngle={Math.PI / 2.05}
          />

          <ambientLight intensity={lightingMode === 'night' ? 0.15 : lightingMode === 'evening' ? 0.4 : 0.8} />
          <directionalLight
            position={lightingMode === 'night' ? [-10, 15, 10] : lightingMode === 'evening' ? [25, 12, -10] : [18, 28, -18]}
            intensity={lightingMode === 'night' ? 0.4 : lightingMode === 'evening' ? 1.2 : 1.8}
            color={lightingMode === 'evening' ? '#FFA07A' : '#FFFFFF'}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
          />
          <Environment preset={environmentPreset} />

          <ArchitecturalBuildingModel
            geometry={houseGeometry}
            materials={materials}
            lightingMode={lightingMode}
            visibleUpTo={visibleUpTo}
            showRoof={showRoof}
          />

          <ContactShadows position={[0, 0.01, 0]} opacity={0.5} scale={distance * 2} blur={2.5} far={8} />
        </Canvas>

        <div className="absolute bottom-4 left-4 z-10 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md px-4 py-2 border border-stone-300 dark:border-stone-700 text-[10px] font-mono text-stone-600 dark:text-stone-400 uppercase tracking-wider shadow-sm">
          Built from the same plan as the 2D view • Road side faces the camera • Turn the roof off to look inside
        </div>
      </div>
    </div>
  );
}
