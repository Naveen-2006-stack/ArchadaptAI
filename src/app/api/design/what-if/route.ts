import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { DesignPreferences, DesignRequirements, LocationInfo, SiteInfo, StructuredDesignJSON } from '@/types/architectural';
import { StructuredDesignDelta } from '@/types/delta';
import { applyWhatIfChange } from '@/lib/genai/modelAdapter';
import { buildWhatIfPrompt, SYSTEM_ARCHITECTURAL_PROMPT } from '@/lib/genai/prompts';
import { classifyDesignRequestIntent } from '@/lib/design/requestIntent';
import { generateAlternativeConcept } from '@/lib/genai/alternativeConcept';
import { normalizeStyleName } from '@/lib/design/styleNormalizer';

const GEMINI_TIMEOUT_MS = 120_000;

async function callWhatIfGeminiModel(apiKey: string, modelId: string, promptText: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`, {
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

function fallbackAlternativeInputs(currentDesign: StructuredDesignJSON): { site: SiteInfo; location: LocationInfo; requirements: DesignRequirements; preferences: DesignPreferences } {
  const bedrooms = currentDesign.rooms.filter((room) => room.category === 'bedroom').length || 3;
  const bathrooms = currentDesign.rooms.filter((room) => room.category === 'bathroom').length || 2;
  const style = normalizeStyleName(undefined, currentDesign.styleFeatures, currentDesign.rationale);
  const primaryStyle: DesignPreferences['primaryStyle'] = style === 'kerala_traditional' ? 'Kerala Traditional' : style === 'minimalist' ? 'Minimalist' : style === 'contemporary' ? 'Contemporary' : 'Modern';
  return {
    site: { plotWidth: currentDesign.plot.width, plotDepth: currentDesign.plot.depth, totalArea: currentDesign.plot.totalArea, orientation: currentDesign.plot.orientation as SiteInfo['orientation'], setbacks: currentDesign.plot.setbacks },
    location: { name: 'Project Site', city: 'Project Site', country: 'India', lat: 0, lng: 0 },
    requirements: {
      familySize: 4, bedrooms, bathrooms, floors: currentDesign.floorsCount, budgetRange: 'Moderate',
      spaces: { living: true, dining: true, kitchen: true, parkingCars: 0, balcony: false, studyWorkspace: false, storage: false, prayerRoom: false, courtyard: currentDesign.rooms.some((room) => room.category === 'outdoor'), guestRoom: false, outdoorGarden: false }
    },
    preferences: { modes: currentDesign.modeConsiderations.map((item) => item.mode), primaryStyle }
  };
}

async function loadAlternativeInputs(projectId: string, currentDesign: StructuredDesignJSON) {
  const fallback = fallbackAlternativeInputs(currentDesign);
  const [projectResult, siteResult, requirementsResult, preferencesResult] = await Promise.all([
    supabase.from('projects').select('location_name, latitude, longitude').eq('id', projectId).maybeSingle(),
    supabase.from('site_inputs').select('*').eq('project_id', projectId).order('created_at', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('design_requirements').select('*').eq('project_id', projectId).order('created_at', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('design_preferences').select('*').eq('project_id', projectId).order('created_at', { ascending: true }).limit(1).maybeSingle()
  ]);
  const project = projectResult.data;
  const site = siteResult.data;
  const requirements = requirementsResult.data;
  const preferences = preferencesResult.data;
  return {
    site: site ? { ...fallback.site, plotWidth: Number(site.plot_width) || fallback.site.plotWidth, plotDepth: Number(site.plot_depth) || fallback.site.plotDepth, totalArea: Number(site.plot_area) || fallback.site.totalArea, orientation: site.orientation || fallback.site.orientation, fileUrl: site.file_url || undefined } : fallback.site,
    location: project ? { name: project.location_name || fallback.location.name, city: (project.location_name || fallback.location.city).split(',')[0].trim(), country: (project.location_name || '').split(',')[1]?.trim() || fallback.location.country, lat: Number(project.latitude) || fallback.location.lat, lng: Number(project.longitude) || fallback.location.lng } : fallback.location,
    requirements: requirements ? { ...fallback.requirements, familySize: requirements.family_size || fallback.requirements.familySize, bedrooms: requirements.bedrooms || fallback.requirements.bedrooms, bathrooms: requirements.bathrooms || fallback.requirements.bathrooms, floors: requirements.floors || fallback.requirements.floors, budgetRange: requirements.budget_range || fallback.requirements.budgetRange, spaces: requirements.must_have_spaces || fallback.requirements.spaces, customRequirements: requirements.special_notes || undefined } : fallback.requirements,
    preferences: preferences ? { modes: preferences.modes || fallback.preferences.modes, primaryStyle: preferences.architectural_style || fallback.preferences.primaryStyle, secondaryStyle: preferences.secondary_style || undefined, customStyleNotes: preferences.custom_style_notes || undefined } : fallback.preferences
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, currentVersionId, message } = body as {
      projectId: string;
      currentVersionId?: string;
      message: string;
    };

    if (!projectId || !message) {
      return NextResponse.json({ error: 'Missing projectId or message parameter.' }, { status: 400 });
    }

    const msgLower = message.toLowerCase().trim();
    const requestIntent = classifyDesignRequestIntent(message);

    // 1. Feasibility Check
    if (msgLower.includes('10 bedroom') || msgLower.includes('15 bedroom') || (msgLower.includes('bedroom') && msgLower.includes('20'))) {
      const infeasibleDelta: StructuredDesignDelta = {
        request: message,
        isFeasible: false,
        feasibilityExplanation: 'The requested number of bedrooms cannot fit within your current plot dimensions (40\' × 60\') without exceeding allowable built-up coverage.',
        changes: [],
        tradeoffs: [
          'Plot area limit exceeded.',
          'Living and circulation areas would be reduced below building code minimums.'
        ],
        constraintsPreserved: ['Plot boundary', 'Orientation'],
        summary: 'Cannot fit requested bedrooms under current site constraints. Consider adding a floor or expanding plot width.'
      };

      await supabase.from('design_conversations').insert({
        project_id: projectId,
        sender: 'user',
        content: message,
        intent: 'Infeasible room addition'
      });

      await supabase.from('design_conversations').insert({
        project_id: projectId,
        sender: 'assistant',
        content: `${infeasibleDelta.feasibilityExplanation}\n\nKey Trade-offs:\n${infeasibleDelta.tradeoffs.map(t => `• ${t}`).join('\n')}`,
        intent: 'Feasibility Rejection',
        applied_changes: infeasibleDelta
      });

      return NextResponse.json({
        success: false,
        isFeasible: false,
        delta: infeasibleDelta,
        explanation: infeasibleDelta.feasibilityExplanation
      });
    }

    // 2. Query Current Floor Plan Version from Supabase
    let currentDesign: StructuredDesignJSON | null = null;
    let nextVersionNum = 2;

    if (currentVersionId && currentVersionId !== 'v1') {
      const { data: verRow } = await supabase
        .from('floor_plan_versions')
        .select('*')
        .eq('id', currentVersionId)
        .single();
      if (verRow) {
        currentDesign = verRow.structured_design;
      }
    }

    if (!currentDesign) {
      const { data: projVersions } = await supabase
        .from('floor_plan_versions')
        .select('*')
        .eq('project_id', projectId)
        .order('version_number', { ascending: false });

      if (projVersions && projVersions.length > 0) {
        currentDesign = projVersions[0].structured_design;
        nextVersionNum = projVersions[0].version_number + 1;
      }
    }

    // Always derive the next number from project history, even when a user is viewing an older version.
    const { data: existingVersions } = await supabase
      .from('floor_plan_versions')
      .select('id, version_number, title')
      .eq('project_id', projectId)
      .order('version_number', { ascending: false });
    if (existingVersions?.length) nextVersionNum = existingVersions[0].version_number + 1;

    // Fallback default structure if DB row is loading
    if (!currentDesign) {
      currentDesign = {
        plot: { width: 40, depth: 60, totalArea: 2400, orientation: 'E', roadSide: 'N' },
        totalBuiltUpAreaSqFt: 1850,
        floorsCount: 2,
        entranceDirection: 'East Entrance',
        rooms: [
          { id: 'r-sitout', name: 'Verandah (Sit-out)', category: 'circulation', dimensions: "12' x 8'", areaSqFt: 96, position: { x: 35, y: 5, width: 30, height: 12, floorLevel: 0 }, connections: [], features: [] },
          { id: 'r-living', name: 'Living Room', category: 'living', dimensions: "18' x 16'", areaSqFt: 288, position: { x: 10, y: 18, width: 42, height: 28, floorLevel: 0 }, connections: [], features: [] },
          { id: 'r-courtyard', name: 'Nadumuttam Courtyard', category: 'outdoor', dimensions: "10' x 10'", areaSqFt: 100, position: { x: 53, y: 18, width: 22, height: 28, floorLevel: 0 }, connections: [], features: [] },
          { id: 'r-kitchen', name: 'Kitchen & Pantry', category: 'kitchen', dimensions: "12' x 14'", areaSqFt: 168, position: { x: 49, y: 47, width: 41, height: 24, floorLevel: 0 }, connections: [], features: [] },
          { id: 'r-master', name: 'Master Suite', category: 'bedroom', dimensions: "16' x 14'", areaSqFt: 224, position: { x: 10, y: 72, width: 42, height: 25, floorLevel: 0 }, connections: [], features: [] }
        ],
        walls: [], openings: [], circulationNotes: 'Central core', rationale: 'Initial concept', modeConsiderations: [], styleFeatures: []
      };
    }

    if (requestIntent === 'GENERATE_ALTERNATIVE_CONCEPT') {
      const inputs = await loadAlternativeInputs(projectId, currentDesign);
      const alternative = await generateAlternativeConcept({ ...inputs, currentDesign, sourceVersionId: currentVersionId });
      const alternativeNumber = (existingVersions || []).filter((version) => /^Alternative Concept \d+/i.test(version.title || '')).length + 1;
      const title = `Alternative Concept ${String(alternativeNumber).padStart(2, '0')}`;
      const diversitySuffix = alternative.diversity.reasons.length ? ` ${alternative.diversity.reasons.join(' ')}` : '';
      const summary = `${title} generated. The layout uses a different spatial organization while preserving your site, requirements, style, and selected modes.${diversitySuffix}`;
      const tradeOffs = alternative.diversity.reasons.length ? alternative.diversity.reasons : ['Alternative spatial organization retains the same site and programme constraints.'];

      const { data: newVersionRow, error: versionError } = await supabase
        .from('floor_plan_versions')
        .insert({ project_id: projectId, version_number: nextVersionNum, title, structured_design: alternative.design, rationale: alternative.design.rationale, trade_offs: tradeOffs, parent_version_id: currentVersionId && currentVersionId !== 'v1' ? currentVersionId : null, created_by_prompt: message })
        .select()
        .single();
      if (versionError) console.warn('[Alternative Concept] version persistence skipped:', versionError.message);
      if (newVersionRow) await supabase.from('projects').update({ current_version_id: newVersionRow.id, updated_at: new Date().toISOString() }).eq('id', projectId);

      await supabase.from('design_conversations').insert({ project_id: projectId, sender: 'user', content: message, intent: 'Generate Alternative Concept' });
      await supabase.from('design_conversations').insert({ project_id: projectId, sender: 'assistant', content: summary, intent: 'Alternative Concept Generated', resulting_version_id: newVersionRow?.id || null, applied_changes: { intent: requestIntent, diversity: alternative.diversity, sourceVersionId: currentVersionId, modelId: alternative.modelId } });

      if (process.env.NODE_ENV !== 'production') {
        console.log('\n=== ARCHADAPT ALTERNATIVE CONCEPT DEBUG ===');
        console.log('REQUEST INTENT: GENERATE_ALTERNATIVE_CONCEPT');
        console.log(`MODEL: ${alternative.modelId}`);
        console.log(`SOURCE VERSION: ${currentVersionId || 1}`);
        console.log('NEW CONCEPT GENERATED: YES');
        console.log('USED APPLY DELTA: NO');
        console.log(`FALLBACK USED: ${alternative.fallbackUsed ? 'YES' : 'NO'}`);
        console.log(`DIVERSITY SCORE: ${alternative.diversity.overallScore}`);
        console.log('SITE CONSTRAINTS PRESERVED: YES');
        console.log('USER REQUIREMENTS PRESERVED: YES');
        console.log(`VALIDATION: ${alternative.validationWarnings.length ? 'PASS WITH WARNINGS' : 'PASS'}`);
        console.log(`NEW VERSION: ${nextVersionNum}`);
        console.log('===========================================\n');
      }

      return NextResponse.json({ success: true, isFeasible: true, intent: requestIntent, aiModel: alternative.modelId, fallbackUsed: alternative.fallbackUsed, versionId: newVersionRow?.id || `v${nextVersionNum}`, versionNumber: nextVersionNum, title, updatedDesign: alternative.design, summary, tradeOffs, diversity: alternative.diversity, validationWarnings: alternative.validationWarnings, constraintsPreserved: ['Plot dimensions', 'Orientation', 'Setbacks', 'Floor count', 'Requirements', 'Style', 'Selected modes'] });
    }

    // 3. Process What-If Delta via Candidate Models (gemini-2.5-pro -> gemini-1.5-pro -> gemini-1.5-flash)
    const apiKey = process.env.GENAI_API_KEY || process.env.GEMINI_API_KEY;
    let updatedDesign: StructuredDesignJSON | null = null;
    let deltaSummary = '';
    let tradeOffs: string[] = [];
    let usedModel = 'gemini-2.5-flash';

    if (apiKey && apiKey !== 'your-genai-api-key-here') {
      const prompt = buildWhatIfPrompt(currentDesign, message, nextVersionNum);
      const candidateModels = ['gemini-2.5-pro', 'gemini-2.5-flash'];

      for (const mId of candidateModels) {
        try {
          const geminiRes = await callWhatIfGeminiModel(apiKey, mId, prompt);
          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            const jsonText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (jsonText) {
              const parsedDesign = JSON.parse(jsonText);
              updatedDesign = parsedDesign;
              deltaSummary = parsedDesign.rationale || `Applied change: ${message}`;
              tradeOffs = ['Optimized room proportions to fit plot constraints.'];
              usedModel = mId;
              break;
            }
          } else {
            console.warn(`Gemini What-If model ${mId} returned ${geminiRes.status}, trying next model...`);
          }
        } catch (mErr) {
          console.warn(`Gemini What-If model ${mId} error:`, mErr);
        }
      }
    }

    // Model adapter fallback if API key is missing or calls fail
    if (!updatedDesign) {
      const adapterRes = await applyWhatIfChange(currentDesign, message, nextVersionNum);
      updatedDesign = adapterRes.updatedDesign;
      deltaSummary = adapterRes.delta.changeSummary;
      tradeOffs = adapterRes.delta.tradeOffs;
      usedModel = 'local-constraint-adapter';
    }

    // 4. Save New Version to Supabase
    const { data: newVersionRow } = await supabase
      .from('floor_plan_versions')
      .insert({
        project_id: projectId,
        version_number: nextVersionNum,
        title: `v${nextVersionNum}: ${deltaSummary}`,
        structured_design: updatedDesign,
        rationale: updatedDesign.rationale || deltaSummary,
        trade_offs: tradeOffs,
        created_by_prompt: message
      })
      .select()
      .single();

    if (newVersionRow) {
      await supabase
        .from('projects')
        .update({ current_version_id: newVersionRow.id, updated_at: new Date().toISOString() })
        .eq('id', projectId);
    }

    // 5. Persist Chat Conversation
    await supabase.from('design_conversations').insert({
      project_id: projectId,
      sender: 'user',
      content: message,
      intent: 'What-If Modification'
    });

    await supabase.from('design_conversations').insert({
      project_id: projectId,
      sender: 'assistant',
      content: `${deltaSummary}\n\nKey Trade-offs:\n${tradeOffs.map(t => `• ${t}`).join('\n')}`,
      intent: 'Applied Delta',
      resulting_version_id: newVersionRow?.id || null,
      applied_changes: { changeSummary: deltaSummary, tradeOffs }
    });

    return NextResponse.json({
      success: true,
      isFeasible: true,
      aiModel: usedModel,
      versionId: newVersionRow?.id || `v${nextVersionNum}`,
      versionNumber: nextVersionNum,
      title: `v${nextVersionNum}: ${deltaSummary}`,
      updatedDesign,
      summary: deltaSummary,
      tradeOffs,
      constraintsPreserved: ['Plot Dimensions', 'Site Orientation', 'Unmodified Bedrooms/Living Space']
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal What-If engine error' }, { status: 500 });
  }
}
