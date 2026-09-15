import { NextResponse } from 'next/server';
import { SiteInfo, LocationInfo, DesignRequirements, DesignPreferences } from '@/types/architectural';
import { validateFloorPlan } from '@/lib/design/validateFloorPlan';
import { validateRequirements } from '@/lib/design/validateRequirements';
import { getRelevantKnowledge } from '@/lib/genai/rag/architecturalKnowledge';
import { generateInitialDesign } from '@/lib/genai/modelAdapter';
import { buildDesignPrompt, SYSTEM_ARCHITECTURAL_PROMPT } from '@/lib/genai/prompts';
import { diffDesignPipeline } from '@/lib/debug/designPipelineDiff';
import fs from 'fs';
import path from 'path';

const GEMINI_TIMEOUT_MS = 120_000; // 120 seconds — Gemini 2.5 Pro/Flash typically takes 60–100s

async function callGeminiModelWithTimeout(apiKey: string, modelId: string, promptText: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${SYSTEM_ARCHITECTURAL_PROMPT}\n\n${promptText}` }]
            }
          ],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }
    );
    clearTimeout(timeoutId);
    return res;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      throw new Error(`Gemini model ${modelId} timed out after ${GEMINI_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  }
}

export async function POST(request: Request) {
  const DEV = process.env.NODE_ENV !== 'production';

  try {
    if (DEV) console.log('\n[ARCHADAPT] ===== GENERATION START =====');

    const body = await request.json();
    const { site, location, requirements, preferences } = body as {
      site: SiteInfo;
      location: LocationInfo;
      requirements: DesignRequirements;
      preferences: DesignPreferences;
    };

    if (!site || !requirements || !preferences) {
      return NextResponse.json({ error: 'Missing required site or requirements payload.' }, { status: 400 });
    }

    const apiKey = process.env.GENAI_API_KEY || process.env.GEMINI_API_KEY;
    const ragContext = getRelevantKnowledge(requirements.customRequirements || '', preferences.modes);

    let rawGeminiDesign: any = null;
    let rawDesign: any = null;
    let rationale = '';
    let usedModel = 'dynamic-constraint-solver';
    let fallbackUsed = false;
    let geminiAttempted = false;

    if (apiKey && apiKey !== 'your-genai-api-key-here') {
      const prompt = buildDesignPrompt(site, location, requirements, preferences, ragContext);
      const candidateModels = ['gemini-2.5-flash', 'gemini-2.5-pro'];

      for (const mId of candidateModels) {
        geminiAttempted = true;
        if (DEV) console.log(`[ARCHADAPT] GEMINI REQUEST START — model: ${mId}`);

        try {
          const res = await callGeminiModelWithTimeout(apiKey, mId, prompt);
          if (DEV) console.log(`[ARCHADAPT] GEMINI RESPONSE RECEIVED — model: ${mId} status: ${res.status}`);

          if (res.ok) {
            if (DEV) console.log(`[ARCHADAPT] GEMINI JSON PARSE START — model: ${mId}`);
            let geminiData: any;
            try {
              geminiData = await res.json();
            } catch (parseErr) {
              if (DEV) console.warn(`[ARCHADAPT] GEMINI JSON PARSE FAILURE — model: ${mId}`, parseErr);
              continue;
            }

            const jsonText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (jsonText) {
              try {
                rawGeminiDesign = JSON.parse(jsonText);
                rawDesign = JSON.parse(JSON.stringify(rawGeminiDesign));
                rationale = rawDesign.rationale || '';
                usedModel = mId;
                if (DEV) console.log(`[ARCHADAPT] GEMINI JSON PARSE SUCCESS — model: ${mId} rooms: ${rawDesign.rooms?.length}`);
                break;
              } catch (innerParseErr) {
                if (DEV) console.warn(`[ARCHADAPT] GEMINI JSON PARSE FAILURE (inner) — model: ${mId}`, innerParseErr);
              }
            } else {
              if (DEV) console.warn(`[ARCHADAPT] GEMINI RESPONSE STATUS OK but no JSON text — model: ${mId}`);
            }
          } else {
            if (DEV) console.warn(`[ARCHADAPT] GEMINI RESPONSE STATUS — model: ${mId} HTTP ${res.status} (skipping)`);
          }
        } catch (mErr: any) {
          if (DEV) console.warn(`[ARCHADAPT] GEMINI REQUEST ERROR — model: ${mId}:`, mErr?.message || mErr);
        }
      }
    } else {
      if (DEV) console.warn('[ARCHADAPT] No Gemini API key configured. Using dynamic constraint solver directly.');
    }

    // --- FALLBACK: Dynamic Constraint Solver ---
    if (!rawDesign) {
      fallbackUsed = true;
      if (DEV) console.log(`[ARCHADAPT] FALLBACK: Engaging dynamic-constraint-solver (Gemini attempted: ${geminiAttempted})`);

      try {
        const generated = await generateInitialDesign(site, location, requirements, preferences);
        rawDesign = generated.design;
        rationale = generated.rationale;
        usedModel = 'dynamic-constraint-solver';
        if (DEV) console.log(`[ARCHADAPT] FALLBACK SUCCESS — rooms: ${rawDesign.rooms?.length}, floors: ${rawDesign.floorsCount}`);
      } catch (fallbackErr: any) {
        if (DEV) console.error('[ARCHADAPT] FALLBACK FAILURE:', fallbackErr?.message);
        return NextResponse.json(
          { error: 'All generation methods failed. Please try again.', details: fallbackErr?.message },
          { status: 502 }
        );
      }
    }

    // --- REQUIREMENT VALIDATION ---
    if (DEV) console.log('[ARCHADAPT] REQUIREMENT VALIDATION START');

    const validation = validateRequirements(rawDesign, {
      bedrooms: requirements.bedrooms,
      bathrooms: requirements.bathrooms,
      floors: requirements.floors,
      parkingCars: requirements.spaces.parkingCars,
      plotWidth: site.plotWidth,
      plotDepth: site.plotDepth,
      familySize: requirements.familySize,
      requiredSpaces: requirements.spaces
    });

    if (DEV) {
      console.log(`[ARCHADAPT] REQUIREMENT VALIDATION COMPLETE — passed: ${validation.passed}`);
      console.log(`  Requested bedrooms: ${validation.requestedBedrooms} | Generated: ${validation.generatedBedrooms}`);
      console.log(`  Requested floors: ${validation.requestedFloors} | Generated: ${validation.generatedFloors}`);
      if (validation.errors.length) console.warn('  Errors:', validation.errors);
      if (validation.warnings.length) console.log('  Warnings:', validation.warnings);
    }

    // If hard bedroom/floor count failed on Gemini output AND fallback also fails, try running fallback with explicit counts
    if (!validation.passed && !fallbackUsed) {
      if (DEV) console.warn('[ARCHADAPT] Gemini output failed validation — engaging dynamic-constraint-solver as repair fallback');
      try {
        const repaired = await generateInitialDesign(site, location, requirements, preferences);
        rawDesign = repaired.design;
        rationale = repaired.rationale;
        usedModel = 'dynamic-constraint-solver';
        fallbackUsed = true;
      } catch (repairErr: any) {
        if (DEV) console.warn('[ARCHADAPT] Repair fallback also failed:', repairErr?.message);
      }
    }

    const finalDesign = rawDesign;

    // --- PIPELINE DIFF (debug only) ---
    const diffReport = diffDesignPipeline(rawGeminiDesign, finalDesign);

    if (DEV) {
      const timestamp = Date.now();
      try {
        const debugDir = path.join(process.cwd(), 'docs', 'debug');
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
        if (rawGeminiDesign) fs.writeFileSync(path.join(debugDir, `raw-gemini-output-${timestamp}.json`), JSON.stringify(rawGeminiDesign, null, 2));
        fs.writeFileSync(path.join(debugDir, `final-design-output-${timestamp}.json`), JSON.stringify(finalDesign, null, 2));
      } catch {
        // Ignore FS errors
      }

      const generatedBedrooms = finalDesign.rooms?.filter((r: any) => r.category === 'bedroom').length || 0;
      const generatedFloors = finalDesign.floorsCount || finalDesign.floors?.length || 1;

      console.log('\n=== ARCHADAPT GEMINI GENERATION DEBUG ===');
      console.log(`MODEL USED       : ${usedModel}`);
      console.log(`FALLBACK USED    : ${fallbackUsed ? 'YES (Dynamic Constraint Engine)' : 'NO (Direct Gemini Response)'}`);
      console.log(`STYLE            : ${preferences.primaryStyle}`);
      console.log(`FOOTPRINT SHAPE  : ${finalDesign.footprint?.shapeType || finalDesign.designSignature?.planningType}`);
      console.log(`ROOM COUNT       : ${finalDesign.rooms?.length || 0}`);
      console.log(`PIPELINE DIFF    : ${diffReport.summary}`);
      console.log(`REQ BEDROOMS     : ${requirements.bedrooms} → GENERATED: ${generatedBedrooms}`);
      console.log(`REQ FLOORS       : ${requirements.floors} → GENERATED: ${generatedFloors}`);
      console.log('ROOM COORDINATES & DIMENSIONS:');
      (finalDesign.rooms || []).forEach((r: any, idx: number) => {
        console.log(`  ${idx + 1}. ${(r.name || r.id).padEnd(28)} | Category: ${(r.category || '').padEnd(12)} | Pos: x:${r.position?.x}, y:${r.position?.y}, w:${r.position?.width}, h:${r.position?.height}, fl:${r.position?.floorLevel || 0}`);
      });
      console.log('==========================================\n');
      console.log('[ARCHADAPT] GENERATION RESPONSE SENT');
    }

    return NextResponse.json({
      success: true,
      aiModel: usedModel,
      fallbackUsed,
      debugSignature: finalDesign.designSignature,
      design: finalDesign,
      rationale: rationale || finalDesign.rationale,
      diffReport,
      validationWarnings: validation.warnings,
      validation: {
        passed: validation.passed,
        requestedBedrooms: validation.requestedBedrooms,
        requestedFloors: validation.requestedFloors,
        generatedBedrooms: validation.generatedBedrooms,
        generatedFloors: validation.generatedFloors
      }
    });
  } catch (err: any) {
    console.error('[ARCHADAPT] GENERATION UNHANDLED ERROR:', err?.message || err);
    return NextResponse.json({ error: err.message || 'Internal GenAI generation error' }, { status: 500 });
  }
}
