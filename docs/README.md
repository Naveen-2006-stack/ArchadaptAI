# ArchAdapt AI — Documentation Hub & Master Architecture Reference

Welcome to the **ArchAdapt AI** documentation repository. All project technical specifications, audits, engineering guides, and runtime manuals have been organized into 4 consolidated master reference volumes below:

---

## 📚 Master Documentation Index

| Volume | Master Document | Description & Scope |
| :---: | :--- | :--- |
| **01** | [**01_ARCHITECTURAL_GENERATION_ENGINE.md**](file:///c:/Drive%20D/ArchAdapt%20AI/docs/01_ARCHITECTURAL_GENERATION_ENGINE.md) | **Core Generative Spatial Engine 2.0**: Gemini 2.5 Pro architecture, Architectural Brief, Design DNA, Spatial Graph, Footprint generation, Spatial Topology Differentiation Matrix, Intra-Style Multi-Concept Generation (Concept 1, 2, 3), Hard Requirement Integrity guarantees (Bedrooms / Floors), and Alternative Concept routing. |
| **02** | [**02_2D_3D_GEOMETRY_AND_RENDERING.md**](file:///c:/Drive%20D/ArchAdapt%20AI/docs/02_2D_3D_GEOMETRY_AND_RENDERING.md) | **Visual Geometry & 3D Engine**: Pure 2D SVG canvas rendering (`FloorPlan2DRenderer.tsx`), multi-floor level switching (Ground vs First Floor), heavy structural walls, door swing arcs, window sills, conceptual furniture cues, Three.js 3D procedural house builder (`buildHouseGeometry.ts`), style-aware roofs (Kerala pitched terracotta, Modern flat parapet, Minimalist slab), and the real-time House Appearance Panel. |
| **03** | [**03_PLATFORM_PHASES_AND_BACKEND.md**](file:///c:/Drive%20D/ArchAdapt%20AI/docs/03_PLATFORM_PHASES_AND_BACKEND.md) | **Platform Architecture & Persistence**: Next.js 14 App Router, Supabase PostgreSQL database schema, Google OAuth authentication, onboarding flow, RAG regional knowledge retrieval, conversational What-If engine (`/api/design/what-if`), version branching tree, and non-destructive constraint validation (`validateFloorPlan.ts`). |
| **04** | [**04_RUNTIME_STYLING_AND_NAVIGATION.md**](file:///c:/Drive%20D/ArchAdapt%20AI/docs/04_RUNTIME_STYLING_AND_NAVIGATION.md) | **Runtime, Styling & Process Management**: Header navigation routing (`/dashboard`, `/how-it-works`, `/styles`, `/modes`), Tailwind CSS styling setup, permanent resolution of `.next` CSS cache corruption (`layout.css 404`), automated clean scripts in `package.json`, and development server lifecycle procedures. |
| **05** | [**GENERATION_HANG_FIX.md**](file:///c:/Drive%20D/ArchAdapt%20AI/docs/GENERATION_HANG_FIX.md) | **Onboarding Hang Resolution**: Diagnostic findings, client/server AbortController timeouts, loading indicators, and API retry button flow. |

---

## 📁 Debug Archive Directory
- [`docs/debug/`](file:///c:/Drive%20D/ArchAdapt%20AI/docs/debug): Contains real-time developer telemetry JSON dumps (`raw-gemini-output-<timestamp>.json` and `final-design-output-<timestamp>.json`) captured during generative runs.
