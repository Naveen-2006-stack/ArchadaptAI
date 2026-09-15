# ARCHADAPT AI — Platform Core Architecture, Backend APIs, Supabase Persistence & What-If Engine

**Document ID:** `docs/03_PLATFORM_PHASES_AND_BACKEND.md`  
**Version:** 2.0 (Consolidated Master Manual)  
**Status:** Verified, Tested & In Production  

---

## 1. Platform Core Architecture & Tech Stack

ArchAdapt AI is built with modern, production-grade web technologies:
- **Framework:** Next.js 14 (App Router) with TypeScript.
- **Frontend & Styling:** Vanilla Tailwind CSS v3 with responsive layout architecture and warm architectural agency palette (Warm Stone, Terracotta, Charcoal).
- **3D Visualization:** Three.js, React Three Fiber (`@react-three/fiber`), and Drei (`@react-three/drei`).
- **Database & Auth:** Supabase PostgreSQL with Google OAuth authentication and row-level security.
- **AI Model:** Google Gemini 2.5 Pro via Generative Language API v1beta.

---

## 2. Phase 1: Core Backend & GenAI Pipeline

### 2.1 Onboarding & Project Ingestion
- **Site Input Capture:** Ingests plot width, plot depth, total area, orientation (N, S, E, W, NE, NW, SE, SW), road position, and land survey documents.
- **Design Requirements:** Captures family size, bedrooms, bathrooms, floors count, budget range (Economy, Moderate, Premium, Luxury), and must-have spaces (living, dining, kitchen, parking, balcony, study, storage, prayer room, courtyard, guest room, garden).
- **Special Modes:** Supports Climate-Adaptive, Life-Stage, Budget-First, and Renovation modes.
- **RAG Architectural Knowledge Retrieval:** `src/lib/genai/rag/architecturalKnowledge.ts` retrieves regional climate and spatial guidelines to inject into Gemini prompt context.

### 2.2 Supabase Database Schema
- `projects`: Primary project records (`id`, `user_id`, `title`, `location_name`, `latitude`, `longitude`, `current_version_id`).
- `floor_plan_versions`: Persistent version tree (`id`, `project_id`, `version_number`, `title`, `structured_design`, `rationale`, `trade_offs`, `created_by_prompt`, `parent_version_id`).
- `site_inputs`: Plot dimensions, orientation, setbacks, and uploaded survey files.
- `design_requirements`: Programme constraints (bedrooms, bathrooms, floors, spaces).
- `design_preferences`: Styles and special modes.
- `design_conversations`: Conversational history and applied What-If deltas.

---

## 3. Phase 2: Conversational What-If Engine & Version Branching

### 3.1 What-If Natural Language Modifications (`/api/design/what-if`)
Allows users to modify an existing floor plan using conversational requests (e.g. *"add a bedroom upstairs"*, *"make the kitchen 20% larger"*, *"convert to ivory wall color"*) without regenerating unrelated rooms.

### 3.2 Change Classification
1. **Spatial Modifications:** Adding/removing rooms, expanding dimensions, or altering floor levels. Handled via `applyWhatIfChange()` / `buildWhatIfPrompt()`.
2. **Style Conversions:** Adapting facade and roof typologies while retaining core spatial organization.
3. **Appearance Adjustments:** Changing wall, roof, frame, or accent colors. Handled in memory without calling the GenAI API.

### 3.3 Version History & Comparison
- Automatically creates sequentially numbered versions (`v1`, `v2`, `v3`).
- Tracks trade-offs, added rooms, and modified rooms in `VersionDelta`.
- Enables instant version comparison, visual diffing, and one-click rollback.

---

## 4. Pure Architectural Validation Engine (`validateFloorPlan.ts`)

### 4.1 Non-Destructive Validation Philosophy
The validator operates in pure "check and report" mode. It never wipes or replaces a valid Gemini design with a generic fallback template.

### 4.2 Comprehensive Constraint Checks
- **Mandatory Spaces:** Validates presence of Living, Kitchen, Bedroom, and Bathroom.
- **Room Dimension Bounds:** Verifies minimum square footage (Living ≥ 150 sq ft, Bedroom ≥ 100 sq ft, Kitchen ≥ 80 sq ft) and 0-100% boundary limits.
- **Multi-Floor Distribution:** Confirms rooms exist on both Ground Floor and First Floor for multi-level houses.
- **Hard Bedroom Adherence:** Checks that generated bedroom count matches user requested count (`reqs.bedrooms`).
- **Overlap Detection:** Detects geometric overlaps > 3% between rooms on the same floor level.
- **Buildable Envelope Compliance:** Confirms total built-up area does not exceed plot buildable limits.
- **Scoring (0-100):** Deducts 25 points per critical error and 5 points per architectural warning.
