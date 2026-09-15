'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navigation/Navbar';
import {
  Upload, MapPin, ArrowRight, ArrowLeft, Check, Sparkles, Wind, Users, DollarSign, RefreshCw, FileText, Image as ImageIcon, X
} from 'lucide-react';
import { SiteInfo, LocationInfo, DesignRequirements, SpecialMode, ArchitecturalStyle } from '@/types/architectural';
import { createProjectInSupabase } from '@/lib/services/projectService';
import { supabase } from '@/lib/supabase/client';

export default function OnboardingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStage, setLoadingStage] = useState('01 / ANALYZING SITE & LOCATION');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  // File Upload State
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: string; previewUrl: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
    const isImage = file.type.startsWith('image/');

    const previewUrl = isImage ? URL.createObjectURL(file) : '';

    setUploadedFile({
      name: file.name,
      size: sizeInMB,
      previewUrl
    });

    // Upload to Supabase Storage if user logged in
    if (user) {
      try {
        const fileExt = file.name.split('.').pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;
        await supabase.storage.from('site-plans').upload(filePath, file);
      } catch (err) {
        console.warn('Storage upload notice:', err);
      }
    }

    setIsUploading(false);
  };

  // Step 1: Site Info
  const [siteInfo, setSiteInfo] = useState<SiteInfo>({
    plotWidth: 40,
    plotDepth: 60,
    totalArea: 2400,
    orientation: 'E'
  });

  // Step 2: Location
  const [locationInfo, setLocationInfo] = useState<LocationInfo>({
    name: 'Kochi Site Plot',
    city: 'Kochi',
    country: 'India',
    lat: 9.9312,
    lng: 76.2673,
    climateZone: 'Warm & Humid'
  });

  // Step 3: Requirements
  const [requirements, setRequirements] = useState<DesignRequirements>({
    familySize: 4,
    bedrooms: 3,
    bathrooms: 2,
    floors: 2,
    budgetRange: 'Moderate',
    spaces: {
      living: true,
      dining: true,
      kitchen: true,
      parkingCars: 1,
      balcony: true,
      studyWorkspace: true,
      storage: true,
      prayerRoom: false,
      courtyard: true,
      guestRoom: false,
      outdoorGarden: true
    },
    customRequirements: '3 bedrooms, 2 bathrooms, 1 car parking, large living room, kitchen, dining, small study. Budget approx ₹40 lakh.'
  });

  // Step 4: Modes & Style
  const [selectedModes, setSelectedModes] = useState<SpecialMode[]>(['climate_adaptive', 'life_stage', 'budget_first']);
  const [primaryStyle, setPrimaryStyle] = useState<ArchitecturalStyle>('Kerala Traditional');

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    setLoadingStage('01 / ANALYZING SITE & LOCATION');
    console.log('[ARCHADAPT Frontend] GENERATION START');

    const stageTimers: ReturnType<typeof setTimeout>[] = [
      setTimeout(() => setLoadingStage('02 / UNDERSTANDING REQUIREMENTS'), 800),
      setTimeout(() => setLoadingStage('03 / APPLYING DESIGN PREFERENCES'), 1600),
      setTimeout(() => setLoadingStage('04 / DEVELOPING FLOOR PLAN'), 2800),
      setTimeout(() => setLoadingStage('05 / GEMINI AI GENERATING DESIGN\u2026'), 4200),
      setTimeout(() => setLoadingStage('05 / SPATIAL REASONING IN PROGRESS\u2026'), 20_000),
      setTimeout(() => setLoadingStage('05 / VALIDATING ARCHITECTURAL CONCEPT'), 55_000),
      setTimeout(() => setLoadingStage('05 / FINALISING FLOOR PLAN\u2026'), 85_000)
    ];
    const clearStageTimers = () => stageTimers.forEach(clearTimeout);

    // Client-side 150-second timeout guard (Gemini 2.5 can take up to ~100s)
    const abortController = new AbortController();
    const clientTimeout = setTimeout(() => {
      abortController.abort();
    }, 150_000);

    try {
      console.log('[ARCHADAPT Frontend] NAVIGATION START → /api/design/generate');

      // Call GenAI API Route
      const res = await fetch('/api/design/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          site: siteInfo,
          location: locationInfo,
          requirements,
          preferences: { modes: selectedModes, primaryStyle }
        })
      });

      clearTimeout(clientTimeout);
      console.log('[ARCHADAPT Frontend] FRONTEND RESPONSE RECEIVED — status:', res.status);

      if (!res.ok) {
        let errBody: any = {};
        try { errBody = await res.json(); } catch { /* ignore */ }
        const errMsg = errBody?.error || `Generation failed (HTTP ${res.status}). Please try again.`;
        console.error('[ARCHADAPT Frontend] API ERROR:', errMsg);
        setGenerationError(errMsg);
        return;
      }

      const data = await res.json();
      const design = data.design;
      const rationale = data.rationale;

      if (!design || !design.rooms) {
        const errMsg = 'Generation returned an incomplete design. Please try again.';
        console.error('[ARCHADAPT Frontend] INCOMPLETE DESIGN:', data);
        setGenerationError(errMsg);
        return;
      }

      console.log(`[ARCHADAPT Frontend] DESIGN RECEIVED — model: ${data.aiModel}, rooms: ${design.rooms?.length}, floors: ${design.floorsCount}`);

      const projectTitle = `${primaryStyle} Concept — ${locationInfo.city}`;
      const activeUserId = user?.id || 'demo-user-id';

      console.log('[ARCHADAPT Frontend] SUPABASE SAVE START');

      // Save to Supabase
      const savedProject = await createProjectInSupabase(
        activeUserId,
        projectTitle,
        siteInfo,
        locationInfo,
        requirements,
        { modes: selectedModes, primaryStyle },
        design,
        rationale
      );

      console.log('[ARCHADAPT Frontend] SUPABASE SAVE COMPLETE — project:', savedProject?.id || 'null (using local fallback)');

      const projectId = savedProject?.id || `proj-${Date.now()}`;

      // Local storage fallback for offline dev resilience
      if (!savedProject) {
        const fallbackProj = {
          id: projectId,
          title: projectTitle,
          location: locationInfo,
          siteInfo,
          requirements,
          preferences: { modes: selectedModes, primaryStyle },
          currentVersionId: 'v1',
          versions: [
            {
              id: 'v1',
              projectId,
              versionNumber: 1,
              title: 'Initial Conceptual Floor Plan',
              structuredDesign: design,
              rationale,
              tradeOffs: [
                'Optimal north-south orientation reduces west solar heat gain.',
                'Includes central courtyard for passive stack ventilation.'
              ],
              createdAt: new Date().toISOString()
            }
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem(`project_${projectId}`, JSON.stringify(fallbackProj));
      }

      console.log('[ARCHADAPT Frontend] NAVIGATION START → /workspace/' + projectId);
      router.push(`/workspace/${projectId}`);
    } catch (err: any) {
      clearTimeout(clientTimeout);
      const isTimeout = err?.name === 'AbortError';
      const errMsg = isTimeout
        ? 'Generation timed out after 150 seconds. The server may be busy — please try again.'
        : err?.message || 'An unexpected error occurred. Please try again.';
      console.error('[ARCHADAPT Frontend] GENERATION ERROR:', errMsg);
      setGenerationError(errMsg);
    } finally {
      clearStageTimers();
      clearTimeout(clientTimeout);
      setIsGenerating(false);
      setLoadingStage('01 / ANALYZING SITE & LOCATION');
    }
  };

  const toggleMode = (m: SpecialMode) => {
    setSelectedModes(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] text-stone-900">
      <Navbar />

      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Step Progress Tracker */}
        <div className="mb-12">
          <div className="flex items-center justify-between border-b border-stone-300 pb-4">
            {[
              { num: 1, label: 'SITE INPUT' },
              { num: 2, label: 'LOCATION' },
              { num: 3, label: 'REQUIREMENTS' },
              { num: 4, label: 'MODES & STYLE' }
            ].map((s) => (
              <div
                key={s.num}
                onClick={() => s.num < step && setStep(s.num)}
                className={`flex items-center gap-2 cursor-pointer font-mono text-xs uppercase tracking-wider ${
                  step === s.num
                    ? 'text-stone-900 font-bold border-b-2 border-terracotta-500 pb-1'
                    : step > s.num
                    ? 'text-stone-700'
                    : 'text-stone-400'
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                  step === s.num ? 'bg-stone-900 text-stone-50' : 'bg-stone-200 text-stone-600'
                }`}>
                  {step > s.num ? <Check className="h-3 w-3" /> : s.num}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* STEP 1 — SITE */}
        {step === 1 && (
          <div className="space-y-8 bg-white border border-stone-200 p-8 shadow-sm">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-terracotta-500">STEP 01</span>
              <h2 className="font-serif text-3xl font-normal text-stone-900 mt-1">Plot & Site Information</h2>
              <p className="font-sans text-xs text-stone-600 mt-1">
                Upload your land document or enter plot dimensions manually with road orientation.
              </p>
            </div>

            {/* Hidden File Input */}
            <input
              id="site-plan-upload"
              type="file"
              ref={fileInputRef}
              accept="image/*,.pdf"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Native Standard HTML Label Upload Zone */}
            <label
              htmlFor="site-plan-upload"
              className="block border-2 border-dashed border-stone-300 bg-[#F9F8F6] p-8 text-center hover:border-stone-900 transition-colors cursor-pointer relative group"
            >
              {uploadedFile ? (
                <div className="flex flex-col items-center justify-center space-y-3">
                  {uploadedFile.previewUrl ? (
                    <img
                      src={uploadedFile.previewUrl}
                      alt="Plot preview"
                      className="max-h-32 object-contain border border-stone-300 shadow-sm"
                    />
                  ) : (
                    <FileText className="h-10 w-10 text-terracotta-500" />
                  )}
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span className="font-mono text-xs uppercase font-bold text-stone-900">
                      {uploadedFile.name}
                    </span>
                    <span className="font-mono text-[10px] text-stone-500">
                      ({uploadedFile.size})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setUploadedFile(null);
                    }}
                    className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-red-600 hover:underline pt-1 z-10"
                  >
                    <X className="h-3 w-3" />
                    Remove & Upload Another File
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="mx-auto h-8 w-8 text-stone-400 mb-2 group-hover:text-stone-800 transition-colors" />
                  <p className="font-sans text-xs font-semibold uppercase text-stone-800">
                    Upload Site Plan Image / Land Sketch (Optional)
                  </p>
                  <p className="font-mono text-[10px] text-stone-500 mt-1">
                    Click to browse PNG, JPG, PDF up to 10MB
                  </p>
                </div>
              )}
            </label>

            {/* Plot Dimensions Form */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-stone-200">
              <div>
                <label className="block font-mono text-[10px] uppercase text-stone-600 mb-1">Plot Width (ft)</label>
                <input
                  type="number"
                  value={siteInfo.plotWidth}
                  onChange={(e) => setSiteInfo({ ...siteInfo, plotWidth: Number(e.target.value), totalArea: Number(e.target.value) * siteInfo.plotDepth })}
                  className="w-full border border-stone-300 px-4 py-3 font-sans text-sm font-semibold text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-stone-600 mb-1">Plot Depth (ft)</label>
                <input
                  type="number"
                  value={siteInfo.plotDepth}
                  onChange={(e) => setSiteInfo({ ...siteInfo, plotDepth: Number(e.target.value), totalArea: siteInfo.plotWidth * Number(e.target.value) })}
                  className="w-full border border-stone-300 px-4 py-3 font-sans text-sm font-semibold text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-stone-600 mb-1">Road Orientation</label>
                <select
                  value={siteInfo.orientation}
                  onChange={(e) => setSiteInfo({ ...siteInfo, orientation: e.target.value as any })}
                  className="w-full border border-stone-300 px-4 py-3 font-sans text-sm font-semibold text-stone-900 focus:border-stone-900 focus:outline-none"
                >
                  <option value="E">East Facing Road</option>
                  <option value="N">North Facing Road</option>
                  <option value="W">West Facing Road</option>
                  <option value="S">South Facing Road</option>
                  <option value="NE">North-East Facing Road</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 bg-stone-900 px-8 py-3.5 font-sans text-xs font-semibold uppercase tracking-widest text-stone-50 hover:bg-stone-800 transition-all"
              >
                Next: Location
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 — LOCATION */}
        {step === 2 && (
          <div className="space-y-8 bg-white border border-stone-200 p-8 shadow-sm">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-terracotta-500">STEP 02</span>
              <h2 className="font-serif text-3xl font-normal text-stone-900 mt-1">Property Location</h2>
              <p className="font-sans text-xs text-stone-600 mt-1">
                Location context provides climate, sun path, and local architectural recommendations.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block font-mono text-[10px] uppercase text-stone-600 mb-1">City / Region</label>
                <input
                  type="text"
                  value={locationInfo.city}
                  onChange={(e) => setLocationInfo({ ...locationInfo, city: e.target.value })}
                  className="w-full border border-stone-300 px-4 py-3 font-sans text-sm font-semibold text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-stone-600 mb-1">Climate Zone Context</label>
                <select
                  value={locationInfo.climateZone}
                  onChange={(e) => setLocationInfo({ ...locationInfo, climateZone: e.target.value as any })}
                  className="w-full border border-stone-300 px-4 py-3 font-sans text-sm font-semibold text-stone-900 focus:border-stone-900 focus:outline-none"
                >
                  <option value="Warm & Humid">Warm & Humid (Coastal / Monsoon)</option>
                  <option value="Tropical">Tropical Savanna</option>
                  <option value="Hot & Dry">Hot & Dry (Arid)</option>
                  <option value="Moderate">Moderate / Temperate</option>
                </select>
              </div>
            </div>

            <div className="border border-stone-300 bg-arch-grid p-8 text-center flex flex-col items-center justify-center min-h-[180px]">
              <MapPin className="h-8 w-8 text-terracotta-500 mb-2 animate-bounce" />
              <span className="font-mono text-xs uppercase font-bold text-stone-900">
                {locationInfo.city}, {locationInfo.country}
              </span>
              <span className="font-mono text-[10px] text-stone-500 mt-1">
                Coordinates: {locationInfo.lat}° N, {locationInfo.lng}° E
              </span>
            </div>

            <div className="flex justify-between pt-4">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 border border-stone-300 px-6 py-3 font-sans text-xs font-semibold uppercase tracking-widest text-stone-700 hover:border-stone-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-2 bg-stone-900 px-8 py-3.5 font-sans text-xs font-semibold uppercase tracking-widest text-stone-50 hover:bg-stone-800 transition-all"
              >
                Next: Requirements
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — REQUIREMENTS */}
        {step === 3 && (
          <div className="space-y-8 bg-white border border-stone-200 p-8 shadow-sm">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-terracotta-500">STEP 03</span>
              <h2 className="font-serif text-3xl font-normal text-stone-900 mt-1">Family & Spatial Requirements</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              <div>
                <label className="block font-mono text-[10px] uppercase text-stone-600 mb-1">Bedrooms</label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={requirements.bedrooms}
                  onChange={(e) => setRequirements({ ...requirements, bedrooms: Number(e.target.value) })}
                  className="w-full border border-stone-300 px-4 py-3 font-sans text-sm font-semibold text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-stone-600 mb-1">Bathrooms</label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={requirements.bathrooms}
                  onChange={(e) => setRequirements({ ...requirements, bathrooms: Number(e.target.value) })}
                  className="w-full border border-stone-300 px-4 py-3 font-sans text-sm font-semibold text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-stone-600 mb-1">Floors</label>
                <input
                  type="number"
                  min="1"
                  max="4"
                  value={requirements.floors}
                  onChange={(e) => setRequirements({ ...requirements, floors: Number(e.target.value) })}
                  className="w-full border border-stone-300 px-4 py-3 font-sans text-sm font-semibold text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-stone-600 mb-1">Budget Tier</label>
                <select
                  value={requirements.budgetRange}
                  onChange={(e) => setRequirements({ ...requirements, budgetRange: e.target.value as any })}
                  className="w-full border border-stone-300 px-4 py-3 font-sans text-sm font-semibold text-stone-900 focus:border-stone-900 focus:outline-none"
                >
                  <option value="Economy">Economy</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Premium">Premium</option>
                  <option value="Luxury">Luxury</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase text-stone-600 mb-2 font-bold">Natural Language Requirements</label>
              <textarea
                rows={2}
                value={requirements.customRequirements}
                onChange={(e) => setRequirements({ ...requirements, customRequirements: e.target.value })}
                placeholder="e.g. 3 bedrooms, 2 bathrooms, 1 car parking, large living room, kitchen, dining..."
                className="w-full border border-stone-300 p-3 font-sans text-xs text-stone-900 focus:border-stone-900 focus:outline-none"
              />
            </div>

            <div className="flex justify-between pt-4">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 border border-stone-300 px-6 py-3 font-sans text-xs font-semibold uppercase tracking-widest text-stone-700 hover:border-stone-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                className="flex items-center gap-2 bg-stone-900 px-8 py-3.5 font-sans text-xs font-semibold uppercase tracking-widest text-stone-50 hover:bg-stone-800 transition-all"
              >
                Next: Modes & Style
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 — MODES & STYLE */}
        {step === 4 && (
          <div className="space-y-8 bg-white border border-stone-200 p-8 shadow-sm">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-terracotta-500">STEP 04</span>
              <h2 className="font-serif text-3xl font-normal text-stone-900 mt-1">Design Modes & Architectural Style</h2>
            </div>

            {/* Special Modes */}
            <div>
              <label className="block font-mono text-[10px] uppercase text-stone-600 mb-3 font-bold">Special Architectural Modes</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { id: 'climate_adaptive', title: 'Climate-Adaptive', icon: Wind, desc: 'Optimizes passive ventilation & shading.' },
                  { id: 'life_stage', title: 'Life-Stage', icon: Users, desc: 'Ground-floor accessibility & flex rooms.' },
                  { id: 'budget_first', title: 'Budget-First', icon: DollarSign, desc: 'Cost-optimized footprint & modular expansion.' },
                  { id: 'renovation', title: 'Renovation', icon: RefreshCw, desc: 'Adaptive reuse of existing structural walls.' }
                ].map((m) => {
                  const active = selectedModes.includes(m.id as SpecialMode);
                  return (
                    <div
                      key={m.id}
                      onClick={() => toggleMode(m.id as SpecialMode)}
                      className={`p-4 border cursor-pointer transition-all flex items-start gap-3 ${
                        active ? 'border-terracotta-500 bg-amber-50/40' : 'border-stone-300 hover:border-stone-900'
                      }`}
                    >
                      <m.icon className={`h-5 w-5 mt-0.5 ${active ? 'text-terracotta-500' : 'text-stone-500'}`} />
                      <div>
                        <h4 className="font-serif text-base font-medium text-stone-900">{m.title}</h4>
                        <p className="font-sans text-xs text-stone-600 mt-0.5">{m.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Architectural Style */}
            <div>
              <label className="block font-mono text-[10px] uppercase text-stone-600 mb-3 font-bold">Primary Architectural Style</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  'Kerala Traditional',
                  'Modern',
                  'Minimalist',
                  'Contemporary',
                  'Colonial',
                  'Tropical',
                  'Traditional Indian',
                  'Modern Luxury'
                ].map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setPrimaryStyle(style as ArchitecturalStyle)}
                    className={`px-4 py-3 border text-xs font-mono uppercase tracking-wider text-center transition-all ${
                      primaryStyle === style
                        ? 'border-stone-900 bg-stone-900 text-stone-50 font-bold'
                        : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Loading Indicator */}
            {isGenerating && (
              <div className="p-6 border border-stone-300 bg-stone-900 text-stone-50 text-center space-y-3">
                <Sparkles className="mx-auto h-6 w-6 text-terracotta-400 animate-spin" />
                <p className="font-mono text-xs tracking-widest uppercase text-terracotta-400 font-bold">
                  {loadingStage}
                </p>
                <p className="font-sans text-xs text-stone-400">
                  Processing site constraints and running architectural validation...
                </p>
              </div>
            )}

            {/* Error Message & Retry */}
            {generationError && !isGenerating && (
              <div className="p-5 border border-red-300 bg-red-50 text-center space-y-3">
                <p className="font-mono text-xs uppercase tracking-wider text-red-700 font-bold">
                  ⚠ Generation Failed
                </p>
                <p className="font-sans text-xs text-red-600">{generationError}</p>
                <button
                  onClick={handleGenerate}
                  className="inline-flex items-center gap-2 bg-stone-900 px-6 py-2.5 font-mono text-xs uppercase tracking-widest text-stone-50 hover:bg-stone-800 transition-all"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry Generation
                </button>
              </div>
            )}

            <div className="flex justify-between pt-6 border-t border-stone-200">
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-2 border border-stone-300 px-6 py-3 font-sans text-xs font-semibold uppercase tracking-widest text-stone-700 hover:border-stone-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex items-center gap-3 bg-terracotta-500 px-10 py-4 font-sans text-xs font-semibold uppercase tracking-widest text-white hover:bg-terracotta-600 transition-all shadow-md"
              >
                {isGenerating ? 'Generating Concept...' : 'Generate 2D Conceptual Plan'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
