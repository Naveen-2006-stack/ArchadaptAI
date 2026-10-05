'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navigation/Navbar';
import {
  Upload, MapPin, ArrowRight, ArrowLeft, Check, Sparkles, Wind, Users, DollarSign, RefreshCw, FileText, Image as ImageIcon, X
} from 'lucide-react';
import { SiteInfo, LocationInfo, DesignRequirements, SpecialMode, ArchitecturalStyle, Project } from '@/types/architectural';
import { createProjectInSupabase } from '@/lib/services/projectService';
import { supabase } from '@/lib/supabase/client';

export default function OnboardingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [generationError, setGenerationError] = useState<{ title: string; message: string; details: string[]; canUseLocalEngine: boolean; canRetry: boolean } | null>(null);
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
      studyWorkspace: false,
      storage: false,
      prayerRoom: false,
      courtyard: false,
      guestRoom: false,
      outdoorGarden: true
    },
    customRequirements: ''
  });

  // Step 4: Modes & Style
  const [selectedModes, setSelectedModes] = useState<SpecialMode[]>(['climate_adaptive', 'life_stage', 'budget_first']);
  const [primaryStyle, setPrimaryStyle] = useState<ArchitecturalStyle>('Kerala Traditional');

  const handleGenerate = async (engine: 'auto' | 'local' = 'auto') => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenerationError(null);
    setElapsedSeconds(0);
    setLoadingStage(engine === 'local' ? 'PLANNING WITH THE BUILT-IN RULE ENGINE' : 'AI PLANNER IS REASONING ABOUT YOUR BRIEF');
    const startedAt = Date.now();
    const ticker = setInterval(() => setElapsedSeconds(Math.round((Date.now() - startedAt) / 1000)), 1000);

    // The server allows two AI attempts within about 165 s; give it slightly longer before giving up.
    const abortController = new AbortController();
    const clientTimeout = setTimeout(() => abortController.abort(), 185_000);

    try {
      const preferences = { modes: selectedModes, primaryStyle };
      const res = await fetch('/api/design/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({ site: siteInfo, location: locationInfo, requirements, preferences, engine })
      });

      let data: any = null;
      try { data = await res.json(); } catch { /* handled below */ }

      if (!res.ok || !data?.success) {
        const status = data?.status as string | undefined;
        setGenerationError({
          title: status === 'INFEASIBLE' ? 'This brief does not fit the plot' : status === 'INVALID_DESIGN' ? 'No valid design was produced' : status === 'ENGINE_UNAVAILABLE' ? 'The AI planner is unavailable' : 'Generation failed',
          message: data?.error || `The server answered HTTP ${res.status}. Please try again.`,
          details: Array.isArray(data?.violatedConstraints) ? data.violatedConstraints : [],
          canUseLocalEngine: !!data?.canUseLocalEngine,
          canRetry: status !== 'INFEASIBLE'
        });
        return;
      }

      const design = data.design;
      if (!design || !Array.isArray(design.rooms) || design.rooms.length === 0) {
        setGenerationError({ title: 'Generation failed', message: 'The server returned an incomplete design. Nothing was saved.', details: [], canUseLocalEngine: false, canRetry: true });
        return;
      }

      setLoadingStage('SAVING THE VALIDATED DESIGN');
      const rationale = data.rationale || design.rationale || '';
      const projectTitle = `${primaryStyle} Concept — ${locationInfo.city}`;

      // Signed-in users save to Supabase under their own account (RLS). Guests keep the project in this browser.
      let savedProject = null;
      if (user?.id) {
        savedProject = await createProjectInSupabase(user.id, projectTitle, siteInfo, locationInfo, requirements, preferences, design, rationale);
      }
      const projectId = savedProject?.id || `proj-${Date.now()}`;

      if (!savedProject) {
        const now = new Date().toISOString();
        const localProject: Project = {
          id: projectId,
          userId: user?.id || 'guest',
          title: projectTitle,
          location: locationInfo,
          siteInfo,
          requirements,
          preferences,
          currentVersionId: 'v1',
          storage: 'local',
          versions: [{ id: 'v1', projectId, versionNumber: 1, title: 'Initial Conceptual Floor Plan', structuredDesign: design, rationale, tradeOffs: design.layoutNotes || [], createdAt: now }],
          createdAt: now,
          updatedAt: now
        };
        try {
          localStorage.setItem(`project_${projectId}`, JSON.stringify(localProject));
        } catch {
          setGenerationError({ title: 'The design could not be saved', message: 'The design was generated, but neither your account nor this browser could store it. Please try again.', details: [], canUseLocalEngine: false, canRetry: true });
          return;
        }
      }

      router.push(`/workspace/${projectId}`);
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      setGenerationError({
        title: isTimeout ? 'Generation timed out' : 'Generation failed',
        message: isTimeout ? 'The server did not answer within 3 minutes. Nothing was saved.' : err?.message || 'An unexpected error occurred. Nothing was saved.',
        details: [],
        canUseLocalEngine: isTimeout,
        canRetry: true
      });
    } finally {
      clearInterval(ticker);
      clearTimeout(clientTimeout);
      setIsGenerating(false);
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
                  <option value="NW">North-West Facing Road</option>
                  <option value="SE">South-East Facing Road</option>
                  <option value="SW">South-West Facing Road</option>
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
              <label className="block font-mono text-[10px] uppercase text-stone-600 mb-2 font-bold">Spaces the house must include</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  ['dining', 'Dining Room'],
                  ['balcony', 'Balcony'],
                  ['studyWorkspace', 'Study'],
                  ['storage', 'Store Room'],
                  ['prayerRoom', 'Puja Room'],
                  ['courtyard', 'Courtyard'],
                  ['guestRoom', 'Guest Room'],
                  ['outdoorGarden', 'Garden']
                ] as const).map(([key, label]) => {
                  const active = requirements.spaces[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRequirements({ ...requirements, spaces: { ...requirements.spaces, [key]: !active } })}
                      className={`flex items-center gap-2 px-3 py-2.5 border text-xs font-mono uppercase tracking-wider text-left transition-all ${
                        active ? 'border-terracotta-500 bg-amber-50/40 text-stone-900 font-bold' : 'border-stone-300 bg-white text-stone-600 hover:border-stone-900'
                      }`}
                    >
                      <span className={`flex h-3.5 w-3.5 items-center justify-center border ${active ? 'border-terracotta-500 bg-terracotta-500 text-white' : 'border-stone-400'}`}>
                        {active && <Check className="h-2.5 w-2.5" />}
                      </span>
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="font-sans text-[11px] text-stone-500 mt-2">
                Living room and kitchen are always included. Everything ticked here is a hard requirement: the design is rejected if any is missing.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              <div>
                <label className="block font-mono text-[10px] uppercase text-stone-600 mb-1">Car Parking</label>
                <input
                  type="number"
                  min="0"
                  max="4"
                  value={requirements.spaces.parkingCars}
                  onChange={(e) => setRequirements({ ...requirements, spaces: { ...requirements.spaces, parkingCars: Math.max(0, Number(e.target.value) || 0) } })}
                  className="w-full border border-stone-300 px-4 py-3 font-sans text-sm font-semibold text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase text-stone-600 mb-1">Family Size</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={requirements.familySize}
                  onChange={(e) => setRequirements({ ...requirements, familySize: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-full border border-stone-300 px-4 py-3 font-sans text-sm font-semibold text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase text-stone-600 mb-2 font-bold">Preferences in your own words (optional)</label>
              <textarea
                rows={2}
                value={requirements.customRequirements}
                onChange={(e) => setRequirements({ ...requirements, customRequirements: e.target.value })}
                placeholder="Anything else the architect should know, e.g. large living room, elderly parents live with us, home office used daily..."
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
                  {elapsedSeconds}s elapsed. The planner's room programme is laid out and validated before anything is saved; this usually takes 20–90 seconds.
                </p>
              </div>
            )}

            {/* Error Message & Recovery */}
            {generationError && !isGenerating && (
              <div className="p-5 border border-red-300 bg-red-50 space-y-3">
                <p className="font-mono text-xs uppercase tracking-wider text-red-700 font-bold text-center">
                  {generationError.title}
                </p>
                <p className="font-sans text-xs text-red-700 text-center">{generationError.message}</p>
                {generationError.details.length > 0 && (
                  <ul className="font-sans text-xs text-red-700 list-disc pl-5 space-y-1">
                    {generationError.details.slice(0, 8).map((detail, index) => (
                      <li key={index}>{detail}</li>
                    ))}
                  </ul>
                )}
                {!generationError.canRetry && (
                  <p className="font-sans text-xs text-stone-700 text-center">
                    Reduce the number of rooms, add a floor, or enter a larger plot in the earlier steps, then generate again.
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {generationError.canRetry && (
                    <button
                      onClick={() => handleGenerate('auto')}
                      className="inline-flex items-center gap-2 bg-stone-900 px-6 py-2.5 font-mono text-xs uppercase tracking-widest text-stone-50 hover:bg-stone-800 transition-all"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </button>
                  )}
                  {generationError.canUseLocalEngine && (
                    <button
                      onClick={() => handleGenerate('local')}
                      className="inline-flex items-center gap-2 border border-stone-900 px-6 py-2.5 font-mono text-xs uppercase tracking-widest text-stone-900 hover:bg-stone-100 transition-all"
                    >
                      Use the built-in rule engine instead
                    </button>
                  )}
                </div>
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
                onClick={() => handleGenerate("auto")}
                disabled={isGenerating}
                className="flex items-center gap-3 bg-terracotta-500 px-10 py-4 font-sans text-xs font-semibold uppercase tracking-widest text-white hover:bg-terracotta-600 transition-all shadow-md"
              >
                {isGenerating ? 'Generating…' : 'Generate Design'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
