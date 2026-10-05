import { NextResponse } from 'next/server';
import { SiteInfo, LocationInfo, DesignRequirements, DesignPreferences } from '@/types/architectural';
import { generateDesign } from '@/lib/design/pipeline';
import { countBedrooms, countRoomsOfType } from '@/lib/design/roomTypes';

export const maxDuration = 180;

const DEV = process.env.NODE_ENV !== 'production';
const ORIENTATIONS = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];

function invalidInput(site: SiteInfo, requirements: DesignRequirements): string | null {
  const inRange = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  if (!inRange(site.plotWidth, 10, 1000) || !inRange(site.plotDepth, 10, 1000)) return 'Plot width and depth must be between 10 and 1000 ft.';
  if (!ORIENTATIONS.includes(site.orientation)) return 'Road orientation is missing or invalid.';
  if (!inRange(requirements.bedrooms, 1, 12)) return 'Bedrooms must be between 1 and 12.';
  if (!inRange(requirements.bathrooms, 1, 12)) return 'Bathrooms must be between 1 and 12.';
  if (!inRange(requirements.floors, 1, 4)) return 'Floors must be between 1 and 4.';
  if (!requirements.spaces || typeof requirements.spaces !== 'object') return 'Requested spaces are missing.';
  return null;
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, status: 'BAD_REQUEST', error: 'Request body is not valid JSON.' }, { status: 400 });
  }

  try {
    const { site, location, requirements, preferences, engine } = body as {
      site: SiteInfo;
      location: LocationInfo;
      requirements: DesignRequirements;
      preferences: DesignPreferences;
      engine?: 'auto' | 'local';
    };
    if (!site || !requirements || !preferences) {
      return NextResponse.json({ success: false, status: 'BAD_REQUEST', error: 'Missing required site or requirements payload.' }, { status: 400 });
    }
    const problem = invalidInput(site, requirements);
    if (problem) return NextResponse.json({ success: false, status: 'BAD_REQUEST', error: problem }, { status: 400 });

    if (DEV) console.log(`\n[ARCHADAPT] GENERATION START — ${requirements.bedrooms} bed / ${requirements.bathrooms} bath / ${requirements.floors} floor(s), ${site.plotWidth}x${site.plotDepth} ${site.orientation}, modes: ${(preferences.modes || []).join(',') || 'none'}`);

    const outcome = await generateDesign({
      site: { ...site, plotWidth: Number(site.plotWidth), plotDepth: Number(site.plotDepth) },
      location: location || { name: 'Site', city: 'Site', country: 'India', lat: 0, lng: 0 },
      requirements,
      preferences: { ...preferences, modes: preferences.modes || [] },
      engine: engine === 'local' ? 'local' : 'auto'
    });

    if (outcome.status !== 'OK') {
      if (DEV) console.warn(`[ARCHADAPT] GENERATION ${outcome.status} after ${outcome.attempts} attempt(s): ${outcome.reason}`, outcome.violatedConstraints);
      return NextResponse.json(
        {
          success: false,
          status: outcome.status,
          error: outcome.reason,
          reason: outcome.reason,
          violatedConstraints: outcome.violatedConstraints,
          attempts: outcome.attempts,
          canUseLocalEngine: outcome.canUseLocalEngine
        },
        { status: outcome.status === 'ENGINE_UNAVAILABLE' ? 503 : 422 }
      );
    }

    const { design } = outcome;
    if (DEV) {
      console.log(`[ARCHADAPT] GENERATION OK — engine: ${outcome.engine} (${outcome.modelId}), attempts: ${outcome.attempts}, rooms: ${design.rooms.length}, bedrooms: ${countBedrooms(design)}, floors: ${design.floorsCount}`);
      if (outcome.warnings.length) console.log('  warnings:', outcome.warnings);
    }

    return NextResponse.json({
      success: true,
      status: 'OK',
      design,
      rationale: design.rationale,
      aiModel: outcome.modelId,
      engine: outcome.engine,
      fallbackUsed: outcome.engine !== 'gemini',
      notice: outcome.notice || null,
      attempts: outcome.attempts,
      validationWarnings: outcome.warnings,
      layoutNotes: outcome.notes,
      validation: {
        passed: true,
        requestedBedrooms: requirements.bedrooms,
        requestedFloors: requirements.floors,
        generatedBedrooms: countBedrooms(design),
        generatedBathrooms: countRoomsOfType(design, 'bathroom'),
        generatedFloors: design.floorsCount
      }
    });
  } catch (err: any) {
    console.error('[ARCHADAPT] GENERATION UNHANDLED ERROR:', err?.message || err);
    return NextResponse.json({ success: false, status: 'INTERNAL_ERROR', error: err?.message || 'Internal generation error' }, { status: 500 });
  }
}
