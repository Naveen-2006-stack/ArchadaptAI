import { DesignPreferences, DesignRequirements, LocationInfo, SiteInfo, StructuredDesignJSON } from '@/types/architectural';
import { validateFloorPlan } from '@/lib/design/validateFloorPlan';
import { evaluateConceptDiversity, ConceptDiversityResult } from '@/lib/design/conceptDiversity';
import { generateAlternativeConcept as generateModelAdapterAlternative } from './modelAdapter';
import { buildAlternativeConceptPrompt, SYSTEM_ARCHITECTURAL_PROMPT } from './prompts';
import { getRelevantKnowledge } from './rag/architecturalKnowledge';

export interface AlternativeConceptResult {
  design: StructuredDesignJSON;
  modelId: string;
  fallbackUsed: boolean;
  diversity: ConceptDiversityResult;
  validationWarnings: string[];
  attempts: number;
}

const GEMINI_TIMEOUT_MS = 120_000;

async function callGemini(apiKey: string, modelId: string, prompt: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${SYSTEM_ARCHITECTURAL_PROMPT}\n\n${prompt}` }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
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

export async function generateAlternativeConcept(params: {
  site: SiteInfo;
  location: LocationInfo;
  requirements: DesignRequirements;
  preferences: DesignPreferences;
  currentDesign: StructuredDesignJSON;
  sourceVersionId?: string;
}): Promise<AlternativeConceptResult> {
  const { site, location, requirements, preferences, currentDesign, sourceVersionId } = params;
  const apiKey = process.env.GENAI_API_KEY || process.env.GEMINI_API_KEY;
  const ragContext = getRelevantKnowledge(requirements.customRequirements || '', preferences.modes);

  let bestDesign: StructuredDesignJSON | null = null;
  let modelId = 'gemini-2.5-flash';
  let fallbackUsed = false;
  let attempts = 0;

  if (apiKey && apiKey !== 'your-genai-api-key-here') {
    const candidateModels = ['gemini-2.5-flash', 'gemini-2.5-pro'];

    for (const candidateModel of candidateModels) {
      attempts += 1;
      try {
        const prompt = buildAlternativeConceptPrompt(site, location, requirements, preferences, ragContext, currentDesign, attempts);
        const res = await callGemini(apiKey, candidateModel, prompt);
        if (res.ok) {
          const data = await res.json();
          const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (jsonText) {
            const parsed = JSON.parse(jsonText);
            const validation = validateFloorPlan(parsed);
            if (validation.isValid) {
              bestDesign = validation.repairedDesign || parsed;
              modelId = candidateModel;
              break;
            }
          }
        }
      } catch (err) {
        console.warn('[Alternative Concept] Gemini generation error:', err);
      }
    }
  }

  if (!bestDesign) {
    const fallbackEnabled = process.env.ALLOW_ARCHADAPT_FALLBACK === 'true';
    if (!fallbackEnabled) {
      throw new Error('Gemini 2.5 Pro failed to generate an alternative concept. No silent fallback was used because the requirement and site constraints must remain intact.');
    }

    fallbackUsed = true;
    modelId = 'dynamic-concept-solver';
    const currentConceptNum = currentDesign.conceptNumber || 1;
    const res = await generateModelAdapterAlternative(site, location, requirements, preferences, currentConceptNum);
    bestDesign = res.design;
  }

  const validation = validateFloorPlan(bestDesign, {
    bedrooms: requirements.bedrooms,
    bathrooms: requirements.bathrooms,
    floors: requirements.floors,
    plotWidth: site.plotWidth,
    plotDepth: site.plotDepth
  });
  const diversity = evaluateConceptDiversity(currentDesign, bestDesign);

  bestDesign.generationMetadata = {
    intent: 'GENERATE_ALTERNATIVE_CONCEPT',
    sourceVersionId,
    modelId,
    generatedAt: new Date().toISOString(),
    diversityScore: diversity.overallScore,
    diversityLimited: !diversity.isMateriallyDifferent
  };

  return {
    design: bestDesign,
    modelId,
    fallbackUsed,
    diversity,
    validationWarnings: validation.warnings,
    attempts: Math.max(1, attempts)
  };
}
