# ARCHADAPT AI — 2D SVG Canvas, Multi-Floor Floor Plans & Deterministic 3D Geometry System

**Document ID:** `docs/02_2D_3D_GEOMETRY_AND_RENDERING.md`  
**Version:** 2.0 (Consolidated Master Manual)  
**Status:** Verified, Tested & In Production  

---

## 1. 2D SVG Architectural Floor Plan Renderer

### 1.1 Pure Rendering Architecture
The 2D renderer in [`FloorPlan2DRenderer.tsx`](file:///c:/Drive%20D/ArchAdapt%20AI/src/components/canvas/FloorPlan2DRenderer.tsx) is a pure visualization layer. It consumes `StructuredDesignJSON` and renders an interactive SVG canvas with zero side-effects and zero geometry mutations.

### 1.2 Graphical & Architectural Elements
- **Structural Walls:** Exterior structural walls are drawn with a heavy 7px stroke (`#121417`); interior partitions use a 3.5px stroke.
- **Door Openings & Swing Arcs:** Clear door frame gaps with dashed 90° swing trajectory arcs (`#C86A4B`) indicating door direction.
- **Orientation Windows:** Double-line window sills with blue frames (`#2B5B84`) placed on external walls.
- **Site Annotations:**
  - Plot boundary line and road direction indicator.
  - Dashed buildable envelope lines reflecting front (8-10ft), rear (5-6ft), and side (4-5ft) setbacks.
  - North compass arrow in the canvas header.
- **Conceptual Furniture Cues:** Subtle SVG furniture symbols with `#78736A` outlines:
  - *Living Room:* Sofa with cushions.
  - *Dining Room:* Dining table with chairs.
  - *Master Suite & Bedrooms:* Double/single beds with pillow headers.
  - *Kitchen:* Countertops with cooking hobs/burners.
  - *Bathrooms:* Fixtures with shower zones.

---

## 2. Multi-Floor Navigation & Level Switching

### 2.1 Interactive Floor Switching
When a multi-floor design (e.g. G+1) is loaded, the 2D viewer renders dedicated level selector tabs (`Ground Floor`, `First Floor`):
- **Room Filtering:** Filters visible rooms, doors, and furniture by `position.floorLevel === selectedFloorLevel`.
- **Area Breakdown:** Updates the active floor area (e.g. Ground Floor: 1056 sq ft, First Floor: 747 sq ft) alongside total built-up area in real-time.
- **Staircase Representation:** Ground Floor renders upward staircase treads (`STAIR UP ↑`); First Floor renders upper landing connections.

---

## 3. Deterministic 3D Geometry Builder

### 3.1 Procedural Construction (`buildHouseGeometry.ts`)
The 3D geometry is constructed deterministically from the canonical `StructuredDesignJSON`:
- **Plinth & Floor Slabs:** Ground elevation plinth slab (thickness 0.2m) surrounded by a landscaped lawn (`#4A6B5D`) and paved driveway (`#A8A297`).
- **Wall Extrusions:** Extruded room bounding boxes with distinct ground (3.2m) and upper (3.0m) wall heights.
- **Recessed Openings:** Cutout geometry for doors, windows with glass panes (`#88A4B8`, opacity 0.65), and window frames.
- **Architectural Details:**
  - *Verandah:* Traditional cylindrical timber/stone columns (`cylinderGeometry`).
  - *Balconies:* Glass railings with metallic framing on upper terraces.
  - *Courtyards:* Open-to-sky voids piercing the floor plate for natural light.

---

## 4. Style-Aware 3D Roof System

The 3D engine generates authentic roof geometry derived directly from the architectural style and building footprint:

### 4.1 Kerala Traditional (`sloped_hipped_gable`)
- **Geometry:** 4-sided pitched hipped/gable roof constructed using a 4-segment radial pyramid/cone mesh rotated `Math.PI / 4`.
- **Details:** Terracotta eave overhangs (`#C86A4B`) projecting beyond exterior walls to provide monsoon rain shading and authentic Kerala massing.

### 4.2 Modern Contemporary (`flat_parapet`)
- **Geometry:** Horizontal flat roof slab extruded over the building footprint.
- **Details:** Raised parapet wall rim with coping cap stone and floating cantilever canopies.

### 4.3 Minimalist Grid (`minimal_slab`)
- **Geometry:** Clean, ultra-thin flat slab with flush perimeter edges and concealed drainage.

---

## 5. Procedural Material System & Appearance Customization

### 5.1 Centralized Materials (`src/lib/geometry/materials.ts`)
Standardized architectural PBR materials for walls, roofs, frames, glazing, paving, and landscape:
- **Default Presets by Style:**
  - *Kerala Traditional:* Ivory Stucco (`#F4F1EA`), Terracotta Clay Tile (`#C86A4B`), Dark Wood Frame (`#4A3525`).
  - *Modern:* Pure White / Concrete (`#FAFAFA`), Charcoal Flat Slab (`#282623`), Black Aluminium Frame (`#121417`).
  - *Minimalist:* Monolithic Neutral (`#EDEDED`), Slate Slab (`#3A3835`), Slim Black Frame (`#121417`).

### 5.2 Real-Time Appearance Panel (`AppearancePanel.tsx`)
- Users can customize Wall Color, Roof Color, Frame Color, and Accent Materials in real time.
- **Zero API Overhead:** Appearance changes directly update Three.js mesh materials in memory without calling the Gemini API and without mutating 2D floor-plan geometry.
- **Lighting Modes:** Supports Day (warm sunlight), Evening (golden hour sunset), and Night (architectural interior illumination).
