# ARCHADAPT AI — Architectural Generation Engine 2.0, Multi-Concept Pipeline & Design Diversity Master Guide

**Document ID:** `docs/01_ARCHITECTURAL_GENERATION_ENGINE.md`  
**Version:** 2.0 (Consolidated Master Manual)  
**Status:** Verified, Tested & In Production  

---

## 1. Executive Overview & Core Architectural Principles

ArchAdapt AI operates strictly on a **Core Generative AI** architectural pipeline. It rejects static template packing, random box placement, autonomous agent loops, and external CAD/MCP dependencies.

### The Canonical Pipeline Flow
```
User Requirements & Site Input
              ↓
Architectural Reasoning & Site Analysis
              ↓
Architectural Brief & Design DNA
              ↓
Spatial Graph & Adjacency Constraints
              ↓
Buildable Envelope & Building Footprint Pre-Calculation
              ↓
Functional Zoning & Circulation Spine
              ↓
Dynamic Room Placement & Proportions
              ↓
Openings (Doors at Interfaces, Orientation Windows, Stairs)
              ↓
Pure Validation & Constraint Verification
              ↓
Canonical StructuredDesignJSON (Single Source of Truth)
              ↓
Professional 2D SVG Renderer & Deterministic 3D Geometry Builder
```

---

## 2. Gemini 2.5 Pro Model Integration & Contract

### 2.1 Model Migration & Fallback Chain
- **Primary Model:** `gemini-2.5-pro` (Google Generative AI API v1beta).
- **Candidate Fallback Chain:**
  1. `gemini-2.5-pro` (Primary complex architectural reasoning)
  2. `gemini-1.5-pro` (Secondary high-context reasoning)
  3. `gemini-1.5-flash` (Fast structured parsing fallback)
  4. `dynamic-constraint-solver` (Deterministic spatial solver ensuring 100% offline availability)

### 2.2 System Architectural Prompt & Structured JSON Output
The prompt directs Gemini to act as a Senior Principal Architectural Design Engine. It requires deriving:
- **`architecturalBrief`**: `planningIntent`, `siteResponse`, `orientationStrategy`, `publicPrivateStrategy`, `serviceStrategy`, `circulationStrategy`, `climateStrategy`, `accessibilityStrategy`, `styleStrategy`.
- **`spatialGraph`**: `nodes`, `requiredAdjacencies`, `preferredAdjacencies`, `avoidAdjacencies`, `verticalConnections`, `indoorOutdoorConnections`.
- **`footprint`**: `shapeType` (`courtyard_centered` | `l_shaped` | `compact_core` | `stepped` | `winged`), `footprintAreaSqFt`, `boundingWidth`, `boundingDepth`.
- **`designSignature`**: `planningType`, `circulationType`, `privatePublicZoning`, `conceptVariant` (`A` | `B` | `C`), `orientationStrategy`.
- **`rooms`**: Exact `position: { x, y, width, height, floorLevel }`, `dimensions`, `areaSqFt`, `zoningCategory`, `privacyLevel`, `connections`, and `features`.
- **`openings`**: Main entry door, room doors with swing arcs, orientation-aware window sills, and staircase details.

---

## 3. Root Cause Investigation & Elimination of Template Repetition

### 3.1 Initial Problem Identified
During early iterations, different styles (Kerala Traditional, Modern, Minimalist) produced visually identical room topologies (e.g. Living on left, Courtyard in center, Dining on right, Master suite bottom-left, Kitchen bottom-right).

### 3.2 Diagnostic Findings
1. **The `isClimate` Overwrite Bug:** In `modelAdapter.ts`, the condition `if (isKerala || isClimate || reqs.spaces.courtyard)` evaluated to `true` whenever `climate_adaptive` mode was active, forcing **all** styles into `planningType = 'courtyard_centered'` and executing a single hardcoded coordinate block (`x: 28, y: 10`, `x: 8, y: 24`, `x: 47, y: 24`, `x: 72, y: 24`).
2. **Template Anchor Elimination:** Removed all fixed coordinate anchors and replaced them with dynamic proportional calculations driven strictly by `primaryStyle`, `conceptVariant`, plot setbacks, orientation, and room counts.
3. **Pipeline Diff Tool:** Built `src/lib/debug/designPipelineDiff.ts` to automatically compare raw Gemini responses against final designs, guaranteeing that valid AI outputs pass through untouched without post-processor mutation.

---

## 4. Spatial Topology Differentiation Matrix

Evaluated on standard benchmark test input: **40 × 60 ft plot, Kochi, East-facing, 3 Bedrooms, 2 Bathrooms, 1 Parking, G+1, Family of 4**.

| Spatial Element | Kerala Traditional (Concept 1) | Modern Contemporary (Concept 1) | Minimalist Grid (Concept 1) |
| :--- | :--- | :--- | :--- |
| **Footprint Shape** | `courtyard_centered` | `l_shaped` | `compact` |
| **Planning Strategy** | `courtyard_centered` | `l_shaped` | `compact_core` |
| **Circulation Type** | `central` | `peripheral` | `peripheral` |
| **Entrance / Foyer** | `Verandah [x:28, y:10, w:44, h:12]` | `Glazed Canopy [x:10, y:8, w:32, h:14]` | `Vestibule [x:32, y:10, w:36, h:12]` |
| **Formal Living** | `Formal Living [x:8, y:24, w:36, h:38]` | `Double-Height Living [x:10, y:24, w:50, h:40]` | `Integrated Core [x:12, y:24, w:76, h:38]` |
| **Kitchen & Dining** | `Traditional Kitchen [x:60, y:64, w:34, h:30]` | `Modular Kitchen [x:62, y:51, w:30, h:41]` | `Linear Kitchen [x:55, y:64, w:33, h:28]` |
| **Master Suite (Ground)** | `Ground Master Suite [x:8, y:64, w:48, h:30]` | `Contemporary Master [x:10, y:66, w:48, h:26]` | `Minimalist Suite [x:12, y:64, w:40, h:28]` |
| **Courtyard / Outdoor** | `Nadumuttam [x:47, y:24, w:22, h:26]` | `Upper Balcony Terrace [x:8, y:54, w:44, h:32]` | `Upper Balcony Terrace [x:8, y:54, w:44, h:32]` |
| **3D Roof Geometry** | `sloped_hipped_gable` (Pitched terracotta) | `flat_parapet` (Parapet cap rim) | `minimal_slab` (Clean thin slab) |
| **Topology Check** | **✅ PASSED (Distinct Geometry)** | **✅ PASSED (Distinct Geometry)** | **✅ PASSED (Distinct Geometry)** |

---

## 5. Intra-Style Multi-Concept Generation

The engine supports generating multiple distinct architectural typologies (Concept 1, Concept 2, Concept 3) for the exact same site, style, and requirements.

### Kerala Traditional Multi-Concept Variations:
1. **Concept 1 (Variant A — Central Nadumuttam Core):**
   - *Footprint:* `courtyard_centered`
   - *Layout:* Front Verandah Sit-out (`x:28, y:10`), Formal Living on West (`x:8, y:24`), Central Nadumuttam Courtyard (`x:47, y:24, w:22, h:26`), Family Dining on East (`x:72, y:24`), Traditional Kitchen on South-East (`x:60, y:64`), Accessible Master Suite on South-West (`x:8, y:64`).
2. **Concept 2 (Variant B — Offset Side Courtyard & Shaded Spine):**
   - *Footprint:* `stepped`
   - *Layout:* Side Verandah Sit-out (`x:50, y:10`), Formal Drawing Hall (`x:50, y:24`), Side Garden Nadumuttam Lightwell (`x:10, y:35, w:36, h:25`), Central Dining Pavilion (`x:10, y:10`), Kitchen on North-West (`x:10, y:64`), Master Suite on South-East (`x:50, y:64`).
3. **Concept 3 (Variant C — Axial Traditional & Rear Garden Courtyard):**
   - *Footprint:* `compact`
   - *Layout:* Grand Entry Poomukham (`x:30, y:10`), Central Grand Living Hall (`x:25, y:24, w:50, h:38`), Open Dining & Kitchen Suite on East (`x:62, y:24`), Rear Shaded Garden Courtyard (`x:10, y:64, w:48, h:30`), Master Suite secluded on North-West (`x:10, y:24`).

### Modern Contemporary Variations:
1. **Concept 1 (Variant A):** L-Shaped Open Glazed Spine with double-height living (`x:10, y:24, w:50, h:40`), floating canopy porch, and modular kitchen.
2. **Concept 2 (Variant B):** Layered Wing Pavilions with floating entrance deck and separate master wing.

---

## 6. Hard Requirement Integrity Guarantees

The system strictly enforces user requirements as non-negotiable constraints:
- **Bedrooms Guarantee:** If the user specifies 3 bedrooms and G+1 (2 floors), the system enforces:
  - Ground Floor (`level: 0`): 1 Master Bedroom Suite
  - First Floor (`level: 1`): Upper Bedroom 2 + Upper Bedroom 3
  - Total = exactly 3 Bedrooms across 2 Floors.
- **No Silent Downgrades:** Rejects silent truncation (e.g. 3 BHK → 1 BHK or G+1 → single floor). If requirements exceed plot coverage, returns explicit feasibility explanations.

---

## 7. Natural Language What-If vs Alternative Concept Routing

```
User Message in Workspace Chat
              ↓
Natural Language Intent Classification (requestIntent.ts)
   ├── "generate another concept" / "alternative layout"
   │         ↓
   │   GENERATE_ALTERNATIVE_CONCEPT
   │         ↓
   │   generateAlternativeConcept() (Bypasses applyDelta)
   │         ↓
   │   Produces new Concept Variant (A → B → C) with new DNA, Footprint, and Layout
   │
   └── "make kitchen 20% larger" / "add bedroom upstairs" / "change wall color"
             ↓
       MODIFY_CURRENT_DESIGN
             ↓
       applyWhatIfChange() & buildWhatIfPrompt()
             ↓
       Incremental delta updating target spaces while preserving unaffected rooms
```

---

## 8. Summary of Verification & Test Files
- `scratch/testPipelineAudit.ts`: Tests pipeline diffs and topology matrices.
- `scratch/testMultiConceptGeneration.ts`: Verifies 3 Kerala concepts, Modern, Minimalist, and hard requirement compliance.
- `src/lib/debug/designPipelineDiff.ts`: Real-time diff tool logging raw vs final outputs in `docs/debug/`.
