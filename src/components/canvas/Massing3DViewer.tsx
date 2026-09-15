'use client';

import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei';
import { StructuredDesignJSON, HouseAppearance } from '@/types/architectural';
import { buildHouseGeometry, HouseGeometry3D } from '@/lib/geometry/buildHouseGeometry';
import { getHouseMaterials, HouseMaterialSystem } from '@/lib/geometry/materials';
import AppearancePanel from '@/components/workspace/AppearancePanel';
import { Box, Sun, Moon, Sparkles, Palette, RefreshCw, AlertTriangle } from 'lucide-react';
import * as THREE from 'three';

interface Massing3DViewerProps {
  design: StructuredDesignJSON;
  onAppearanceChange?: (updatedAppearance: HouseAppearance) => void;
}

type LightingMode = 'day' | 'evening' | 'night';

function StyleAwareRoofMesh({ roof, materials }: { roof: HouseGeometry3D['roofs'][0]; materials: HouseMaterialSystem }) {
  if (roof.type === 'sloped_hipped_gable') {
    const width = roof.size[0];
    const height = roof.size[1];
    const depth = roof.size[2];
    const radius = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(depth / 2, 2));

    return (
      <group position={roof.position}>
        {/* Main Pitched Hipped Roof Volume */}
        <mesh rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
          <coneGeometry args={[radius, height, 4]} />
          <meshStandardMaterial color={materials.roof.color} roughness={materials.roof.roughness} metalness={materials.roof.metalness} />
        </mesh>

        {/* Terracotta Eaves Overhang Base & Ridge Cap */}
        <mesh position={[0, -height / 2 + 0.08, 0]} castShadow receiveShadow>
          <boxGeometry args={[width, 0.15, depth]} />
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

  // flat_parapet
  return (
    <group position={roof.position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={roof.size} />
        <meshStandardMaterial color={materials.roof.color} roughness={materials.roof.roughness} />
      </mesh>

      {/* Parapet Wall Cap Rim */}
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
  lightingMode
}: {
  geometry: HouseGeometry3D;
  materials: HouseMaterialSystem;
  lightingMode: LightingMode;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.02;
    }
  });

  const isNight = lightingMode === 'night';
  const isEvening = lightingMode === 'evening';

  return (
    <group ref={groupRef} position={[0, -1, 0]}>
      {/* Site Landscape: Lawn & Driveway */}
      <mesh position={geometry.lawnPosition} receiveShadow>
        <boxGeometry args={geometry.lawnSize} />
        <meshStandardMaterial color={materials.lawn.color} roughness={materials.lawn.roughness} />
      </mesh>

      <mesh position={geometry.drivewayPosition} receiveShadow>
        <boxGeometry args={geometry.drivewaySize} />
        <meshStandardMaterial color={materials.driveway.color} roughness={materials.driveway.roughness} />
      </mesh>

      {/* Plinth Base Slab */}
      <mesh position={geometry.plinthPosition} receiveShadow>
        <boxGeometry args={geometry.plinthSize} />
        <meshStandardMaterial color={materials.plinth.color} roughness={materials.plinth.roughness} />
      </mesh>

      {/* Intermediate Floor Slabs */}
      {geometry.floorSlabs.map((slab, sIdx) => (
        <mesh key={sIdx} position={slab.position} receiveShadow castShadow>
          <boxGeometry args={slab.size} />
          <meshStandardMaterial color="#C2BCB2" roughness={0.6} />
        </mesh>
      ))}

      {/* Verandah Pillars */}
      {geometry.pillars.map((pillar, pIdx) => (
        <mesh key={pIdx} position={pillar.position} castShadow receiveShadow>
          <cylinderGeometry args={[pillar.radius, pillar.radius, pillar.height, 16]} />
          <meshStandardMaterial color={materials.woodAccent.color} roughness={materials.woodAccent.roughness} />
        </mesh>
      ))}

      {/* Dynamic Room Extrusions grouped by floor level */}
      {geometry.rooms.map((room) => {
        if (room.isCourtyard) {
          // Open-to-sky void courtyard slab
          return (
            <mesh key={room.id} position={[room.position[0], room.position[1] - room.size[1] / 2 + 0.05, room.position[2]]}>
              <boxGeometry args={[room.size[0], 0.05, room.size[2]]} />
              <meshStandardMaterial color={materials.lawn.color} roughness={0.9} />
            </mesh>
          );
        }

        return (
          <group key={room.id} position={room.position}>
            {/* Main Wall Massing */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={room.size} />
              <meshStandardMaterial color={materials.wall.color} roughness={materials.wall.roughness} metalness={materials.wall.metalness} />
            </mesh>

            {/* Recessed Window Frame & Glass Pane */}
            <mesh position={[0, 0, room.size[2] / 2 + 0.02]}>
              <planeGeometry args={[room.size[0] * 0.55, room.size[1] * 0.45]} />
              <meshPhysicalMaterial
                color={isNight || isEvening ? '#FCE38A' : materials.glass.color}
                transmission={isNight || isEvening ? 0.2 : materials.glass.transmission}
                opacity={materials.glass.opacity}
                transparent
                roughness={materials.glass.roughness}
                emissive={isNight ? '#FCE38A' : isEvening ? '#FFB347' : '#000000'}
                emissiveIntensity={isNight ? 0.7 : isEvening ? 0.3 : 0}
              />
            </mesh>
          </group>
        );
      })}

      {/* Balcony Railings */}
      {geometry.balconyRailings.map((rail, rIdx) => (
        <mesh key={rIdx} position={rail.position} castShadow receiveShadow>
          <boxGeometry args={rail.size} />
          <meshPhysicalMaterial color="#2B5B84" transmission={0.7} opacity={0.6} transparent roughness={0.2} />
        </mesh>
      ))}

      {/* Style-Aware Roof Geometry */}
      {geometry.roofs.map((roof, idx) => (
        <StyleAwareRoofMesh key={idx} roof={roof} materials={materials} />
      ))}
    </group>
  );
}

export default function Massing3DViewer({ design, onAppearanceChange }: Massing3DViewerProps) {
  const [lightingMode, setLightingMode] = useState<LightingMode>('day');
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [localAppearance, setLocalAppearance] = useState<HouseAppearance>(
    design.appearance || { wallColor: '#F4F1EA', roofColor: '#C86A4B', frameColor: '#121417', accentMaterial: 'wood' }
  );

  const [renderedDesign, setRenderedDesign] = useState<StructuredDesignJSON>(design);
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    if (design !== renderedDesign) {
      setIsStale(true);
    }
  }, [design, renderedDesign]);

  const handleRegenerate3D = () => {
    setRenderedDesign(design);
    setIsStale(false);
  };

  const handleAppearanceUpdate = (updated: HouseAppearance) => {
    setLocalAppearance(updated);
    if (onAppearanceChange) onAppearanceChange(updated);
  };

  const houseGeometry = useMemo(() => {
    const geom = buildHouseGeometry(renderedDesign);
    geom.appearance = localAppearance;
    return geom;
  }, [renderedDesign, localAppearance]);

  const materials = useMemo(
    () => getHouseMaterials(localAppearance, houseGeometry.styleName),
    [localAppearance, houseGeometry.styleName]
  );

  const camPos: [number, number, number] = [
    houseGeometry.recommendedCameraDistance * 0.8,
    houseGeometry.recommendedCameraDistance * 0.6,
    houseGeometry.recommendedCameraDistance * 0.8
  ];

  const environmentPreset = lightingMode === 'night' ? 'night' : lightingMode === 'evening' ? 'sunset' : 'city';

  return (
    <div className="relative flex flex-col h-full w-full bg-[#EFECE6] dark:bg-[#0B0C0E] border border-stone-300 dark:border-stone-800 overflow-hidden select-none">
      {/* 3D Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-6 py-3 border-b border-stone-300 dark:border-stone-800 bg-[#F9F8F6]/80 dark:bg-stone-900/80 backdrop-blur-sm z-10 gap-3">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-stone-700 dark:text-stone-300">
          <Box className="h-4 w-4 text-terracotta-500" />
          <span>3D House Model ({houseGeometry.totalFloors} Stories)</span>
          <span className="text-stone-400">|</span>
          <span className="text-amber-800 dark:text-amber-400 font-semibold">{houseGeometry.styleName}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAppearanceOpen(!isAppearanceOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 hover:border-stone-900 transition-all shadow-sm"
          >
            <Palette className="h-3.5 w-3.5 text-terracotta-500" />
            Appearance
          </button>

          {isStale && (
            <button
              onClick={handleRegenerate3D}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-terracotta-600 text-white hover:bg-terracotta-700 transition-all rounded shadow-sm animate-pulse"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate 3D
            </button>
          )}

          {/* Lighting Mode Selector */}
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

      {/* House Appearance Slide-over Panel */}
      {isAppearanceOpen && (
        <AppearancePanel
          appearance={localAppearance}
          onChange={handleAppearanceUpdate}
          onClose={() => setIsAppearanceOpen(false)}
        />
      )}

      {/* Stale 3D Warning Banner */}
      {isStale && (
        <div className="absolute top-14 left-6 right-6 z-20 bg-amber-500/90 text-stone-950 px-4 py-2 text-xs font-mono uppercase tracking-wider flex items-center justify-between shadow-md backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>3D model is based on previous floor plan version.</span>
          </div>
          <button onClick={handleRegenerate3D} className="underline font-bold hover:text-white">
            Update 3D Model Now
          </button>
        </div>
      )}

      {/* R3F Canvas Container */}
      <div className="relative flex-1 w-full h-full">
        <Canvas shadows key={renderedDesign.rationale + houseGeometry.styleName}>
          <PerspectiveCamera makeDefault position={camPos} fov={40} />
          <OrbitControls
            enablePan
            enableZoom
            target={houseGeometry.cameraTarget}
            minDistance={8}
            maxDistance={45}
            maxPolarAngle={Math.PI / 2.05}
          />

          {/* Lighting Modes */}
          <ambientLight intensity={lightingMode === 'night' ? 0.15 : lightingMode === 'evening' ? 0.4 : 0.8} />
          <directionalLight
            position={lightingMode === 'night' ? [-10, 15, -10] : lightingMode === 'evening' ? [25, 12, 10] : [18, 28, 18]}
            intensity={lightingMode === 'night' ? 0.4 : lightingMode === 'evening' ? 1.2 : 1.8}
            color={lightingMode === 'evening' ? '#FFA07A' : '#FFFFFF'}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <Environment preset={environmentPreset} />

          {/* Building Model */}
          <ArchitecturalBuildingModel geometry={houseGeometry} materials={materials} lightingMode={lightingMode} />

          {/* Soft Ground Contact Shadows */}
          <ContactShadows position={[0, -0.9, 0]} opacity={0.6} scale={28} blur={2.5} far={6} />
        </Canvas>

        {/* Disclaimer Notice */}
        <div className="absolute bottom-4 left-4 z-10 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md px-4 py-2 border border-stone-300 dark:border-stone-700 text-[10px] font-mono text-stone-600 dark:text-stone-400 uppercase tracking-wider shadow-sm">
          Conceptual Architectural Visualization • {houseGeometry.totalFloors} Stories • {houseGeometry.styleName}
        </div>
      </div>
    </div>
  );
}
