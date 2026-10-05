import {
  DesignConstraints,
  DesignPreferences,
  DesignProgram,
  DesignRequirements,
  LocationInfo,
  SiteInfo,
  StructuredDesignJSON
} from '@/types/architectural';
import { callGeminiJson, geminiApiKey } from '@/lib/genai/gemini';
import { buildLocalProgram } from '@/lib/genai/localPlanner';
import { SYSTEM_ARCHITECTURAL_PROMPT, buildAlternativeProgramPrompt, buildProgramPrompt, ProgramPromptInput } from '@/lib/genai/prompts';
import { getRelevantKnowledge } from '@/lib/genai/rag/architecturalKnowledge';
import { layoutProgram } from './layoutEngine';
import { buildConstraints, parseProgram, programFromDesign, validateProgramRequirements } from './program';
import { validateFloorPlan } from './validateFloorPlan';

export const MAX_GENERATION_ATTEMPTS = 2;
const TIME_BUDGET_MS = 165_000;

export type EngineId = 'gemini' | 'local-rule-engine';

export interface GenerationSuccess {
  status: 'OK';
  design: StructuredDesignJSON;
  engine: EngineId;
  modelId: string;
  attempts: number;
  warnings: string[];
  notes: string[];
  /** Set when Gemini was requested but the local rule engine produced the design. Always shown to the user. */
  notice?: string;
}

export interface GenerationFailure {
  status: 'INFEASIBLE' | 'INVALID_DESIGN' | 'ENGINE_UNAVAILABLE';
  reason: string;
  violatedConstraints: string[];
  attempts: number;
  /** True when the built-in rule engine could be tried instead (the user must choose it explicitly). */
  canUseLocalEngine: boolean;
}

export type GenerationOutcome = GenerationSuccess | GenerationFailure;

export interface GenerationInput {
  site: SiteInfo;
  location: LocationInfo;
  requirements: DesignRequirements;
  preferences: DesignPreferences;
  /** 'local' skips Gemini because the user asked for the built-in engine. */
  engine?: 'auto' | 'local';
  /** When set, the request is for a different concept from this design. */
  alternativeTo?: StructuredDesignJSON;
}

interface StageResult {
  design?: StructuredDesignJSON;
  errors: string[];
  warnings: string[];
  notes: string[];
  infeasible?: { reason: string; violatedConstraints: string[] };
}

/** Programme → requirement check → geometry → full validation. Nothing reaches a renderer unless this passes. */
export function realiseProgram(program: DesignProgram, site: SiteInfo, constraints: DesignConstraints): StageResult {
  const requirementErrors = validateProgramRequirements(program, constraints);
  if (requirementErrors.length) return { errors: requirementErrors, warnings: [], notes: [] };

  const layout = layoutProgram(program, site, constraints);
  if (!layout.ok) return { errors: [layout.reason], warnings: [], notes: [], infeasible: { reason: layout.reason, violatedConstraints: layout.violatedConstraints } };

  const report = validateFloorPlan(layout.design);
  return { design: report.isValid ? layout.design : undefined, errors: report.errors, warnings: report.warnings, notes: layout.notes };
}

const localFallbackAllowed = () => process.env.ALLOW_ARCHADAPT_FALLBACK === 'true';

function stamp(design: StructuredDesignJSON, intent: 'INITIAL_DESIGN' | 'GENERATE_ALTERNATIVE_CONCEPT', engine: EngineId, modelId: string, attempts: number, conceptNumber: number) {
  design.conceptNumber = conceptNumber;
  design.generationMetadata = { intent, engine, modelId, attempts, generatedAt: new Date().toISOString() };
}

/**
 * Full generation pipeline with a hard cap of two attempts.
 * A design that fails validation is never replaced by something else behind the user's back:
 * the outcome is a valid design, or a structured failure that says why.
 */
export async function generateDesign(input: GenerationInput): Promise<GenerationOutcome> {
  const { site, location, requirements, preferences } = input;
  const constraints = buildConstraints(requirements, preferences);
  const intent = input.alternativeTo ? 'GENERATE_ALTERNATIVE_CONCEPT' : 'INITIAL_DESIGN';
  const previousConcept = input.alternativeTo?.conceptNumber || 1;
  const conceptNumber = input.alternativeTo ? previousConcept + 1 : 1;
  const variant = input.alternativeTo ? previousConcept % 3 : 0;
  const custom = requirements.customRequirements || '';

  // Deterministic feasibility pre-check: if the bare brief cannot fit at minimum room sizes, say so
  // before spending an AI call, and never downgrade the brief to make it fit.
  const baseline = realiseProgram(buildLocalProgram(site, location, constraints, custom, variant), site, constraints);
  if (baseline.infeasible) {
    return { status: 'INFEASIBLE', reason: baseline.infeasible.reason, violatedConstraints: baseline.infeasible.violatedConstraints, attempts: 0, canUseLocalEngine: false };
  }

  const runLocal = (notice?: string): GenerationOutcome => {
    if (!baseline.design) {
      return { status: 'INVALID_DESIGN', reason: 'The built-in rule engine could not produce a valid plan for this brief.', violatedConstraints: baseline.errors, attempts: 1, canUseLocalEngine: false };
    }
    stamp(baseline.design, intent, 'local-rule-engine', 'local-rule-engine', 1, conceptNumber);
    return { status: 'OK', design: baseline.design, engine: 'local-rule-engine', modelId: 'local-rule-engine', attempts: 1, warnings: baseline.warnings, notes: baseline.notes, notice };
  };

  if (input.engine === 'local') return runLocal();
  if (!geminiApiKey()) {
    return localFallbackAllowed()
      ? runLocal('No Gemini API key is configured, so this plan was produced by the built-in rule engine.')
      : { status: 'ENGINE_UNAVAILABLE', reason: 'No Gemini API key is configured on the server.', violatedConstraints: [], attempts: 0, canUseLocalEngine: true };
  }

  const promptInput: ProgramPromptInput = {
    site, location, constraints, customRequirements: custom,
    secondaryStyle: typeof preferences.secondaryStyle === 'string' ? preferences.secondaryStyle : undefined,
    ragContext: getRelevantKnowledge(custom, preferences.modes || [])
  };
  const currentProgram = input.alternativeTo ? programFromDesign(input.alternativeTo) : null;
  const deadline = Date.now() + TIME_BUDGET_MS;
  let feedback: string[] | undefined;
  let lastErrors: string[] = [];
  let attempts = 0;

  while (attempts < MAX_GENERATION_ATTEMPTS) {
    attempts++;
    const prompt = currentProgram ? buildAlternativeProgramPrompt(promptInput, currentProgram, feedback) : buildProgramPrompt(promptInput, feedback);
    const call = await callGeminiJson(SYSTEM_ARCHITECTURAL_PROMPT, prompt, deadline);

    if (!call.ok && call.kind !== 'BAD_RESPONSE') {
      // Gemini could not be reached at all. This is an availability problem, not an invalid design.
      if (attempts > 1 && lastErrors.length) break;
      return localFallbackAllowed()
        ? runLocal(`Gemini could not be reached (${call.detail}), so this plan was produced by the built-in rule engine.`)
        : { status: 'ENGINE_UNAVAILABLE', reason: `Gemini could not be reached: ${call.detail}`, violatedConstraints: [], attempts, canUseLocalEngine: true };
    }
    if (!call.ok) {
      lastErrors = [call.detail];
      feedback = [`${call.detail} Return one complete, valid JSON object.`];
      continue;
    }

    const raw = call.json as Record<string, unknown>;
    if (raw && raw.status === 'INFEASIBLE') {
      // The deterministic pre-check already showed the brief fits, so this is treated as a failed attempt.
      lastErrors = [`The planner declared the brief infeasible: ${String(raw.reason || 'no reason given')}`];
      feedback = ['You answered INFEASIBLE, but a programme at standard room sizes fits this envelope. Produce the programme, keeping every hard requirement.'];
      continue;
    }
    const parsed = parseProgram(raw, constraints);
    if (!parsed.program) {
      lastErrors = parsed.errors;
      feedback = parsed.errors;
      continue;
    }
    const stage = realiseProgram(parsed.program, site, constraints);
    if (stage.design) {
      stamp(stage.design, intent, 'gemini', call.modelId, attempts, conceptNumber);
      stage.design.layoutNotes = [...parsed.notes, ...stage.notes];
      return { status: 'OK', design: stage.design, engine: 'gemini', modelId: call.modelId, attempts, warnings: stage.warnings, notes: stage.design.layoutNotes };
    }
    lastErrors = stage.errors;
    feedback = stage.errors;
    if (process.env.NODE_ENV !== 'production') console.warn(`[ARCHADAPT] attempt ${attempts} (${call.modelId}) failed validation:`, stage.errors);
  }

  return {
    status: 'INVALID_DESIGN',
    reason: `The AI planner did not produce a valid design in ${MAX_GENERATION_ATTEMPTS} attempts. Nothing was saved.`,
    violatedConstraints: lastErrors,
    attempts,
    canUseLocalEngine: true
  };
}
