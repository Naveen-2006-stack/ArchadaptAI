# ARCHADAPT AI — ONBOARDING GENERATION HANG RESOLUTION REPORT

**Date:** 2026-08-30  
**Status:** Diagnosed, Resolved, and Verified  
**Document Path:** `docs/GENERATION_HANG_FIX.md`  

---

## 1. Diagnostic Findings & Root Cause Analysis

We identified a multi-stage hang condition in the initial design onboarding pipeline (`/onboarding` → `/api/design/generate`):

1. **Gemini Timeout Absence:** The backend `callGeminiModel` function did not use a timeout mechanism, leaving the server waiting indefinitely if a Gemini model failed to respond.
2. **Missing Frontend `finally` Block:** The onboarding `handleGenerate` method did not wrap cleanup state inside a `finally` block. If `fetch` failed, or database insertion returned an exception, the `isGenerating` state remained `true` indefinitely.
3. **Invalid Model 404 Skipping delay:** The pipeline was attempting to call deprecated or inactive models (`gemini-2.0-flash-exp`, `gemini-1.5-pro`) on the active API key, causing unnecessary timeouts or delays before attempting a fallback model.

---

## 2. Implemented Resolutions

### 2.1 Server-Side Gemini Timeout
Added a `GEMINI_TIMEOUT_MS = 120_000` (120 seconds) timeout via `AbortController` in `src/app/api/design/generate/route.ts` and `src/app/api/design/what-if/route.ts` to abort requests and return an HTTP 502/504 when models do not respond.

### 2.2 Frontend Resilience & Loading State Cleans
Updated `src/app/onboarding/page.tsx`:
- Wrapped fetch, Supabase insert, and routing inside a `try/catch/finally` block.
- Implemented a 150-second client-side fetch `AbortController` timeout guard.
- Added a `generationError` state and retry button to allow the user to recover gracefully rather than remain stuck on Step 05.
- Added granular, sequential loading stages so the user sees continuous progress during the ~78s Gemini wait.

### 2.3 Model Routing Optimization
Direct connectivity tests verified that only **`gemini-2.5-flash`** and **`gemini-2.5-pro`** return 200 OK on this environment's API key. Updated both route files to target only these working models.

---

## 3. Test Cases Verified

### 3.1 Live Onboarding Success Test (Kerala Traditional, 3 BHK, G+1)
- **Log:**
  ```text
  [ARCHADAPT] ===== GENERATION START =====
  [ARCHADAPT] GEMINI REQUEST START — model: gemini-2.5-flash
  [ARCHADAPT] GEMINI RESPONSE RECEIVED — model: gemini-2.5-flash status: 200
  [ARCHADAPT] GEMINI JSON PARSE SUCCESS — model: gemini-2.5-flash rooms: 12
  [ARCHADAPT] REQUIREMENT VALIDATION COMPLETE — passed: true
  [ARCHADAPT Frontend] DESIGN RECEIVED — model: gemini-2.5-flash, rooms: 12, floors: 2
  [ARCHADAPT Frontend] SUPABASE SAVE COMPLETE
  [ARCHADAPT Frontend] NAVIGATION START → /workspace/proj-1787...
  ```
- **Result:** Successfully generated a valid 12-room 3 BHK G+1 Kerala Traditional concept, persisted to Supabase, and navigated to workspace.

### 3.2 Offline / Failure Test
- **Action:** Simulated network failure by temporarily deleting env key.
- **Result:** Server gracefully fell back to the local `dynamic-constraint-solver` layout (saving 3 BHK G+1 requirements successfully), and frontend completed onboarding with 0 hangs.
