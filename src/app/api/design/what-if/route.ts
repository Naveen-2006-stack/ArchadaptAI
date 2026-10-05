import { NextResponse } from 'next/server';
import { DesignPreferences, DesignRequirements, LocationInfo, StructuredDesignJSON } from '@/types/architectural';
import { classifyDesignRequestIntent } from '@/lib/design/requestIntent';
import { evaluateConceptDiversity } from '@/lib/design/conceptDiversity';
import { generateDesign } from '@/lib/design/pipeline';
import { constraintsFromDesign } from '@/lib/design/program';
import { runWhatIf, siteFromDesign } from '@/lib/design/whatIf';
import { supabaseForRequest } from '@/lib/supabase/server';

export const maxDuration = 180;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDesign = (value: any): value is StructuredDesignJSON => !!value && typeof value === 'object' && Array.isArray(value.rooms) && value.rooms.length > 0 && !!value.plot;

/** Rebuilds the generation inputs from the design itself, so an alternative concept honours the same brief. */
function inputsFromDesign(design: StructuredDesignJSON, location?: LocationInfo) {
  const constraints = constraintsFromDesign(design);
  const has = (key: string) => constraints.requiredSpaces.includes(key);
  const requirements: DesignRequirements = {
    familySize: constraints.familySize,
    bedrooms: constraints.bedrooms,
    bathrooms: constraints.bathrooms,
    floors: constraints.floors,
    budgetRange: constraints.budgetRange,
    spaces: {
      living: true, dining: has('dining') || !constraints.requiredSpaces.length, kitchen: true, parkingCars: constraints.parkingCars,
      balcony: has('balcony'), studyWorkspace: has('studyWorkspace'), storage: has('storage'), prayerRoom: has('prayerRoom'),
      courtyard: has('courtyard'), guestRoom: has('guestRoom'), outdoorGarden: has('outdoorGarden')
    }
  };
  const preferences: DesignPreferences = { modes: constraints.modes, primaryStyle: constraints.style as DesignPreferences['primaryStyle'] };
  return {
    site: siteFromDesign(design),
    location: location || { name: 'Project Site', city: 'Project Site', country: 'India', lat: 0, lng: 0 },
    requirements,
    preferences
  };
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, status: 'BAD_REQUEST', error: 'Request body is not valid JSON.' }, { status: 400 });
  }

  try {
    const { projectId, currentVersionId, message, currentDesign: clientDesign, location } = body as {
      projectId: string;
      currentVersionId?: string;
      message: string;
      currentDesign?: StructuredDesignJSON;
      location?: LocationInfo;
    };
    if (!projectId || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ success: false, status: 'BAD_REQUEST', error: 'Missing projectId or message parameter.' }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ success: false, status: 'BAD_REQUEST', error: 'The request is too long (2000 characters maximum).' }, { status: 400 });
    }

    // ---- 1. Load the design being modified, as the calling user (RLS decides what is visible) ----
    const { client: supabase, authenticated } = supabaseForRequest(request);
    const projectInDb = authenticated && UUID.test(projectId);
    let currentDesign: StructuredDesignJSON | null = null;
    let parentVersionId: string | null = null;
    let nextVersionNumber: number | null = null;
    let existingTitles: string[] = [];
    let canPersist = false;

    if (projectInDb) {
      const { data: versions, error } = await supabase
        .from('floor_plan_versions')
        .select('id, version_number, title, structured_design')
        .eq('project_id', projectId)
        .order('version_number', { ascending: false });
      if (error) {
        console.warn('[ARCHADAPT What-If] could not read versions:', error.message);
      } else if (versions && versions.length) {
        canPersist = true;
        nextVersionNumber = versions[0].version_number + 1;
        existingTitles = versions.map((row) => row.title || '');
        const row = (currentVersionId && versions.find((v) => v.id === currentVersionId)) || versions[0];
        if (isDesign(row.structured_design)) {
          currentDesign = row.structured_design;
          parentVersionId = row.id;
        }
      }
    }
    // Guest / offline projects live in the browser, so the browser supplies the design it is showing.
    if (!currentDesign && isDesign(clientDesign)) currentDesign = clientDesign;
    if (!currentDesign) {
      return NextResponse.json(
        { success: false, status: 'DESIGN_NOT_FOUND', error: 'The design to modify could not be found. Reload the project and try again.' },
        { status: 404 }
      );
    }

    const logConversation = async (assistantText: string, intent: string, versionId: string | null, applied: unknown) => {
      if (!canPersist) return;
      const { error } = await supabase.from('design_conversations').insert([
        { project_id: projectId, sender: 'user', content: message, intent },
        { project_id: projectId, sender: 'assistant', content: assistantText, intent, resulting_version_id: versionId, applied_changes: applied }
      ]);
      if (error) console.warn('[ARCHADAPT What-If] conversation not saved:', error.message);
    };

    // ---- 2. Produce the new design: alternative concept, or a delta on the current one ----
    const intent = classifyDesignRequestIntent(message);
    let newDesign: StructuredDesignJSON;
    let title: string;
    let summary: string;
    let tradeOffs: string[];
    let modelId: string;
    let engine: string;
    let warnings: string[] = [];
    let diversity: ReturnType<typeof evaluateConceptDiversity> | undefined;
    let notice: string | null = null;

    if (intent === 'GENERATE_ALTERNATIVE_CONCEPT') {
      const outcome = await generateDesign({ ...inputsFromDesign(currentDesign, location), alternativeTo: currentDesign });
      if (outcome.status !== 'OK') {
        const explanation = outcome.reason;
        await logConversation(`${explanation}\n\n${outcome.violatedConstraints.map((c) => `• ${c}`).join('\n')}`, 'Alternative Concept Failed', null, { status: outcome.status, violatedConstraints: outcome.violatedConstraints });
        return NextResponse.json({ success: false, isFeasible: false, status: outcome.status, intent, explanation, violatedConstraints: outcome.violatedConstraints }, { status: outcome.status === 'ENGINE_UNAVAILABLE' ? 503 : 200 });
      }
      newDesign = outcome.design;
      newDesign.generationMetadata = { ...newDesign.generationMetadata!, sourceVersionId: parentVersionId || currentVersionId };
      diversity = evaluateConceptDiversity(currentDesign, newDesign);
      newDesign.generationMetadata.diversityScore = diversity.overallScore;
      newDesign.generationMetadata.diversityLimited = !diversity.isMateriallyDifferent;
      const alternativeNumber = existingTitles.filter((t) => /^Alternative Concept \d+/i.test(t)).length + 1;
      title = `Alternative Concept ${String(alternativeNumber).padStart(2, '0')}`;
      tradeOffs = diversity.reasons.length ? diversity.reasons : ['The planner returned an arrangement close to the current one.'];
      summary = `${title}: a different arrangement for the same site and requirements.${diversity.isMateriallyDifferent ? '' : ' Note: it is not very different from the current concept.'}`;
      modelId = outcome.modelId;
      engine = outcome.engine;
      warnings = outcome.warnings;
      notice = outcome.notice || null;
    } else {
      const outcome = await runWhatIf(currentDesign, message);
      if (outcome.status === 'ENGINE_UNAVAILABLE') {
        return NextResponse.json({ success: false, isFeasible: false, status: outcome.status, intent, explanation: outcome.reason, violatedConstraints: [] }, { status: 503 });
      }
      if (outcome.status === 'NOT_UNDERSTOOD') {
        await logConversation(outcome.reason, 'Not Understood', null, { status: outcome.status });
        return NextResponse.json({ success: false, isFeasible: false, status: outcome.status, intent, explanation: outcome.reason, violatedConstraints: [] });
      }
      if (outcome.status === 'INFEASIBLE') {
        await logConversation(`Not feasible: ${outcome.reason}`, 'Feasibility Rejection', null, { status: outcome.status, violatedConstraints: outcome.violatedConstraints });
        return NextResponse.json({ success: false, isFeasible: false, status: outcome.status, intent, explanation: outcome.reason, violatedConstraints: outcome.violatedConstraints, summary: outcome.summary });
      }
      newDesign = outcome.design;
      summary = outcome.summary || outcome.changes.join(' ');
      tradeOffs = outcome.tradeOffs;
      title = summary.length > 90 ? `${summary.slice(0, 87)}…` : summary;
      modelId = outcome.modelId;
      engine = outcome.engine;
      warnings = outcome.warnings;
      if (outcome.engine === 'local-interpreter') notice = 'This request was interpreted by the built-in parser rather than the AI planner.';
    }

    // ---- 3. Persist as a new version (the previous versions are never modified) ----
    let versionId: string | null = null;
    let persistError: string | null = null;
    if (canPersist && nextVersionNumber !== null) {
      const { data: row, error } = await supabase
        .from('floor_plan_versions')
        .insert({
          project_id: projectId,
          version_number: nextVersionNumber,
          title,
          structured_design: newDesign,
          rationale: newDesign.rationale || summary,
          trade_offs: tradeOffs,
          parent_version_id: parentVersionId,
          created_by_prompt: message
        })
        .select('id')
        .single();
      if (error || !row) {
        persistError = error?.message || 'The new version could not be saved.';
        console.warn('[ARCHADAPT What-If] version not saved:', persistError);
      } else {
        versionId = row.id;
        const { error: projectError } = await supabase.from('projects').update({ current_version_id: row.id, updated_at: new Date().toISOString() }).eq('id', projectId);
        if (projectError) console.warn('[ARCHADAPT What-If] project pointer not updated:', projectError.message);
        await logConversation(`${summary}\n\n${tradeOffs.map((t) => `• ${t}`).join('\n')}`, intent === 'GENERATE_ALTERNATIVE_CONCEPT' ? 'Alternative Concept Generated' : 'Applied Delta', row.id, { summary, tradeOffs, engine, modelId });
      }
    }

    return NextResponse.json({
      success: true,
      isFeasible: true,
      status: 'OK',
      intent,
      aiModel: modelId,
      engine,
      notice,
      versionId,
      versionNumber: versionId ? nextVersionNumber : null,
      parentVersionId,
      persisted: !!versionId,
      persistError,
      title,
      updatedDesign: newDesign,
      summary,
      tradeOffs,
      diversity,
      validationWarnings: warnings
    });
  } catch (err: any) {
    console.error('[ARCHADAPT What-If] UNHANDLED ERROR:', err?.message || err);
    return NextResponse.json({ success: false, status: 'INTERNAL_ERROR', error: err?.message || 'Internal What-If engine error' }, { status: 500 });
  }
}
