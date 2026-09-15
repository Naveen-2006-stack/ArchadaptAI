import { supabase } from '@/lib/supabase/client';
import { SiteInfo, LocationInfo, DesignRequirements, DesignPreferences, StructuredDesignJSON, Project, FloorPlanVersion } from '@/types/architectural';

export async function createProjectInSupabase(
  userId: string,
  title: string,
  site: SiteInfo,
  location: LocationInfo,
  requirements: DesignRequirements,
  preferences: DesignPreferences,
  initialDesign: StructuredDesignJSON,
  rationale: string
): Promise<Project | null> {
  try {
    // 1. Insert Project Row
    const { data: projectData, error: projError } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        title,
        description: `${preferences.primaryStyle} concept in ${location.city}`,
        location_name: `${location.city}, ${location.country}`,
        latitude: location.lat,
        longitude: location.lng
      })
      .select()
      .single();

    if (projError || !projectData) {
      console.error('Error creating project:', projError);
      return null;
    }

    const projectId = projectData.id;

    // 2. Insert Site Inputs
    await supabase.from('site_inputs').insert({
      project_id: projectId,
      plot_width: site.plotWidth,
      plot_depth: site.plotDepth,
      plot_area: site.totalArea,
      orientation: site.orientation,
      file_url: site.fileUrl || null
    });

    // 3. Insert Design Requirements
    await supabase.from('design_requirements').insert({
      project_id: projectId,
      family_size: requirements.familySize,
      bedrooms: requirements.bedrooms,
      bathrooms: requirements.bathrooms,
      floors: requirements.floors,
      budget_range: requirements.budgetRange,
      must_have_spaces: requirements.spaces,
      special_notes: requirements.customRequirements || ''
    });

    // 4. Insert Design Preferences
    await supabase.from('design_preferences').insert({
      project_id: projectId,
      modes: preferences.modes,
      architectural_style: preferences.primaryStyle,
      secondary_style: preferences.secondaryStyle || null,
      custom_style_notes: preferences.customStyleNotes || null
    });

    // 5. Insert Version 1 Floor Plan
    const { data: versionData, error: verError } = await supabase
      .from('floor_plan_versions')
      .insert({
        project_id: projectId,
        version_number: 1,
        title: 'Initial Conceptual Floor Plan',
        structured_design: initialDesign,
        rationale,
        trade_offs: [
          'Optimal north-south orientation reduces west solar heat gain.',
          'Includes central courtyard for passive stack ventilation.'
        ]
      })
      .select()
      .single();

    if (versionData) {
      // Update active version
      await supabase
        .from('projects')
        .update({ current_version_id: versionData.id })
        .eq('id', projectId);
    }

    // Return mapped Project object
    return {
      id: projectId,
      userId,
      title,
      location,
      siteInfo: site,
      requirements,
      preferences,
      currentVersionId: versionData?.id || 'v1',
      versions: [
        {
          id: versionData?.id || 'v1',
          projectId,
          versionNumber: 1,
          title: 'Initial Conceptual Floor Plan',
          structuredDesign: initialDesign,
          rationale,
          tradeOffs: [
            'Optimal north-south orientation reduces west solar heat gain.',
            'Includes central courtyard for passive stack ventilation.'
          ],
          createdAt: new Date().toISOString()
        }
      ],
      createdAt: projectData.created_at,
      updatedAt: projectData.updated_at
    };
  } catch (err) {
    console.error('Supabase project creation exception:', err);
    return null;
  }
}

export async function getUserProjectsFromSupabase(userId: string): Promise<Project[]> {
  try {
    const { data: projectsData, error } = await supabase
      .from('projects')
      .select(`
        *,
        site_inputs (*),
        design_requirements (*),
        design_preferences (*),
        floor_plan_versions (*)
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error || !projectsData) {
      return [];
    }

    return projectsData.map((p: any) => {
      const site = p.site_inputs?.[0] || {};
      const reqs = p.design_requirements?.[0] || {};
      const prefs = p.design_preferences?.[0] || {};
      const versionsList = (p.floor_plan_versions || []).map((v: any) => ({
        id: v.id,
        projectId: p.id,
        versionNumber: v.version_number,
        title: v.title || `Version ${v.version_number}`,
        structuredDesign: v.structured_design,
        rationale: v.rationale,
        tradeOffs: v.trade_offs || [],
        createdAt: v.created_at
      }));

      return {
        id: p.id,
        userId: p.user_id,
        title: p.title,
        description: p.description,
        location: {
          name: p.location_name || 'Site Plot',
          city: (p.location_name || 'Site Plot').split(',')[0],
          country: (p.location_name || 'India').split(',')[1] || 'India',
          lat: p.latitude || 9.93,
          lng: p.longitude || 76.26
        },
        siteInfo: {
          plotWidth: site.plot_width || 40,
          plotDepth: site.plot_depth || 60,
          totalArea: site.plot_area || 2400,
          orientation: site.orientation || 'E',
          fileUrl: site.file_url
        },
        requirements: {
          familySize: reqs.family_size || 4,
          bedrooms: reqs.bedrooms || 3,
          bathrooms: reqs.bathrooms || 3,
          floors: reqs.floors || 2,
          budgetRange: reqs.budget_range || 'Moderate',
          spaces: reqs.must_have_spaces || { living: true, dining: true, kitchen: true },
          customRequirements: reqs.special_notes
        },
        preferences: {
          modes: prefs.modes || ['climate_adaptive'],
          primaryStyle: prefs.architectural_style || 'Modern',
          secondaryStyle: prefs.secondary_style,
          customStyleNotes: prefs.custom_style_notes
        },
        currentVersionId: p.current_version_id,
        versions: versionsList,
        createdAt: p.created_at,
        updatedAt: p.updated_at
      };
    });
  } catch {
    return [];
  }
}

export async function deleteProjectFromSupabase(projectId: string): Promise<boolean> {
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  return !error;
}
