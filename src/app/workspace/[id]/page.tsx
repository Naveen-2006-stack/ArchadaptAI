'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/navigation/Navbar';
import FloorPlan2DRenderer from '@/components/canvas/FloorPlan2DRenderer';
import Massing3DViewer from '@/components/canvas/Massing3DViewer';
import VersionComparisonModal from '@/components/workspace/VersionComparisonModal';
import {
  Compass, Layers, Box, Send, Sparkles, ArrowLeft, History, CheckCircle, AlertTriangle, RefreshCw, Download, GitCompare, RotateCcw
} from 'lucide-react';
import { Project, FloorPlanVersion, StructuredDesignJSON, WhatIfMessage } from '@/types/architectural';
import { supabase } from '@/lib/supabase/client';
import { getUserProjectsFromSupabase } from '@/lib/services/projectService';

export default function WorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;

  const getValidDesign = (version?: FloorPlanVersion | null): StructuredDesignJSON | null => {
    if (!version) return null;
    const design = version.structuredDesign;
    if (!design || !Array.isArray(design.rooms)) return null;
    return design;
  };

  const [project, setProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<'2d' | '3d'>('2d');
  const [currentVersion, setCurrentVersion] = useState<FloorPlanVersion | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(undefined);

  // Version Comparison State
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [compareVersionA, setCompareVersionA] = useState<FloorPlanVersion | null>(null);

  // What-If Chat State
  const [chatMessages, setChatMessages] = useState<WhatIfMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!projectId) return;

    async function fetchProjectData() {
      let matchedProject: Project | null = null;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const userProjects = await getUserProjectsFromSupabase(user.id);
          matchedProject = userProjects.find(p => p.id === projectId) || null;
        }
      } catch (err) {
        console.warn('Supabase project fetch skipped or timed out, loading local state:', err);
      }

      if (!matchedProject) {
        const stored = localStorage.getItem(`project_${projectId}`);
        if (stored) {
          try { matchedProject = JSON.parse(stored); } catch {}
        }
      }

      if (matchedProject) {
        const validVersions = (matchedProject.versions || []).filter((version) => !!getValidDesign(version));
        setProject(matchedProject);
        if (validVersions.length > 0) {
          setCurrentVersion(validVersions[validVersions.length - 1]);
        } else {
          const sampleDesign: StructuredDesignJSON = {
            plot: { width: 40, depth: 60, totalArea: 2400, orientation: 'E', roadSide: 'N' },
            totalBuiltUpAreaSqFt: 1850,
            floorsCount: 2,
            entranceDirection: 'East Entrance',
            rooms: [
              { id: 'r-sitout', name: 'Verandah (Sit-out)', category: 'circulation', dimensions: "12' x 8'", areaSqFt: 96, position: { x: 35, y: 5, width: 30, height: 12, floorLevel: 0 }, connections: [], features: [] },
              { id: 'r-living', name: 'Living Room', category: 'living', dimensions: "18' x 16'", areaSqFt: 288, position: { x: 10, y: 18, width: 42, height: 28, floorLevel: 0 }, connections: [], features: [] },
              { id: 'r-courtyard', name: 'Nadumuttam Courtyard', category: 'outdoor', dimensions: "10' x 10'", areaSqFt: 100, position: { x: 53, y: 18, width: 22, height: 28, floorLevel: 0 }, connections: [], features: [] },
              { id: 'r-dining', name: 'Dining Hall', category: 'living', dimensions: "14' x 14'", areaSqFt: 196, position: { x: 10, y: 47, width: 38, height: 24, floorLevel: 0 }, connections: [], features: [] },
              { id: 'r-kitchen', name: 'Kitchen & Pantry', category: 'kitchen', dimensions: "12' x 14'", areaSqFt: 168, position: { x: 49, y: 47, width: 41, height: 24, floorLevel: 0 }, connections: [], features: [] },
              { id: 'r-master', name: 'Master Suite', category: 'bedroom', dimensions: "16' x 14'", areaSqFt: 224, position: { x: 10, y: 72, width: 42, height: 25, floorLevel: 0 }, connections: [], features: [] },
              { id: 'r-bed-2', name: 'Bedroom 2', category: 'bedroom', dimensions: "12' x 12'", areaSqFt: 144, position: { x: 12, y: 18, width: 18, height: 20, floorLevel: 1 }, connections: [], features: [] },
              { id: 'r-bed-3', name: 'Bedroom 3', category: 'bedroom', dimensions: "12' x 12'", areaSqFt: 144, position: { x: 52, y: 18, width: 18, height: 20, floorLevel: 1 }, connections: [], features: [] }
            ],
            walls: [], openings: [], circulationNotes: 'Central core', rationale: 'Initial Kerala Traditional concept with Nadumuttam stack ventilation and 3-bedroom upper-floor program.', modeConsiderations: [], styleFeatures: []
          };

          const sampleVer: FloorPlanVersion = {
            id: 'v1',
            projectId,
            versionNumber: 1,
            title: 'Initial Conceptual Floor Plan',
            structuredDesign: sampleDesign,
            rationale: 'Initial Kerala Traditional concept with central Nadumuttam stack ventilation.',
            tradeOffs: ['Includes central courtyard for passive stack ventilation.'],
            createdAt: new Date().toISOString()
          };

          setCurrentVersion(sampleVer);
          setProject({ ...matchedProject, versions: [sampleVer] });
        }
      } else {
        // Fallback sample design if project ID is new or temporary
        const sampleDesign: StructuredDesignJSON = {
          plot: { width: 40, depth: 60, totalArea: 2400, orientation: 'E', roadSide: 'N' },
          totalBuiltUpAreaSqFt: 1850,
          floorsCount: 2,
          entranceDirection: 'East Entrance',
          rooms: [
            { id: 'r-sitout', name: 'Verandah (Sit-out)', category: 'circulation', dimensions: "12' x 8'", areaSqFt: 96, position: { x: 35, y: 5, width: 30, height: 12, floorLevel: 0 }, connections: [], features: [] },
            { id: 'r-living', name: 'Living Room', category: 'living', dimensions: "18' x 16'", areaSqFt: 288, position: { x: 10, y: 18, width: 42, height: 28, floorLevel: 0 }, connections: [], features: [] },
            { id: 'r-courtyard', name: 'Nadumuttam Courtyard', category: 'outdoor', dimensions: "10' x 10'", areaSqFt: 100, position: { x: 53, y: 18, width: 22, height: 28, floorLevel: 0 }, connections: [], features: [] },
            { id: 'r-dining', name: 'Dining Hall', category: 'living', dimensions: "14' x 14'", areaSqFt: 196, position: { x: 10, y: 47, width: 38, height: 24, floorLevel: 0 }, connections: [], features: [] },
            { id: 'r-kitchen', name: 'Kitchen & Pantry', category: 'kitchen', dimensions: "12' x 14'", areaSqFt: 168, position: { x: 49, y: 47, width: 41, height: 24, floorLevel: 0 }, connections: [], features: [] },
            { id: 'r-master', name: 'Master Suite', category: 'bedroom', dimensions: "16' x 14'", areaSqFt: 224, position: { x: 10, y: 72, width: 42, height: 25, floorLevel: 0 }, connections: [], features: [] },
            { id: 'r-bed-2', name: 'Bedroom 2', category: 'bedroom', dimensions: "12' x 12'", areaSqFt: 144, position: { x: 12, y: 18, width: 18, height: 20, floorLevel: 1 }, connections: [], features: [] },
            { id: 'r-bed-3', name: 'Bedroom 3', category: 'bedroom', dimensions: "12' x 12'", areaSqFt: 144, position: { x: 52, y: 18, width: 18, height: 20, floorLevel: 1 }, connections: [], features: [] }
          ],
          walls: [], openings: [], circulationNotes: 'Central core', rationale: 'Initial Kerala Traditional concept with Nadumuttam stack ventilation and 3-bedroom upper-floor program.', modeConsiderations: [], styleFeatures: []
        };

        const sampleVer: FloorPlanVersion = {
          id: 'v1',
          projectId,
          versionNumber: 1,
          title: 'Initial Conceptual Floor Plan',
          structuredDesign: sampleDesign,
          rationale: 'Initial Kerala Traditional concept with central Nadumuttam stack ventilation.',
          tradeOffs: ['Includes central courtyard for passive stack ventilation.'],
          createdAt: new Date().toISOString()
        };

        const sampleProj: Project = {
          id: projectId,
          userId: 'user',
          title: 'Kerala Modern Residence Concept',
          location: { name: 'Kochi Plot', city: 'Kochi', country: 'India', lat: 9.93, lng: 76.26 },
          siteInfo: { plotWidth: 40, plotDepth: 60, totalArea: 2400, orientation: 'E' },
          requirements: { familySize: 4, bedrooms: 3, bathrooms: 2, floors: 2, budgetRange: 'Moderate', spaces: { living: true, dining: true, kitchen: true, parkingCars: 1, balcony: true, studyWorkspace: true, storage: true, prayerRoom: false, courtyard: true, guestRoom: false, outdoorGarden: true } },
          preferences: { modes: ['climate_adaptive', 'life_stage'], primaryStyle: 'Kerala Traditional' },
          currentVersionId: 'v1',
          versions: [sampleVer],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        setProject(sampleProj);
        setCurrentVersion(sampleVer);
      }

      // Fetch persistent conversation history safely
      try {
        const { data: convData } = await supabase
          .from('design_conversations')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true });

        if (convData && convData.length > 0) {
          setChatMessages(convData.map(c => ({
            id: c.id,
            sender: c.sender as 'user' | 'assistant',
            content: c.content,
            timestamp: new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            delta: c.applied_changes
          })));
        } else {
          setChatMessages([
            {
              id: 'msg-welcome',
              sender: 'assistant',
              content: 'Welcome to your ArchAdapt What-If Engine! I can help you iteratively modify your design. Try prompts like: "Add another bedroom", "Make the kitchen 20% larger", or "Change style to Kerala + Modern".',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
        }
      } catch {
        setChatMessages([
          {
            id: 'msg-welcome',
            sender: 'assistant',
            content: 'Welcome to your ArchAdapt What-If Engine! I can help you iteratively modify your design. Try prompts like: "Add another bedroom", "Make the kitchen 20% larger", or "Change style to Kerala + Modern".',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    }

    fetchProjectData();
  }, [projectId]);

  const handleWhatIfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || !currentVersion || !project || isProcessing) return;

    const userPromptText = inputPrompt;
    setInputPrompt('');

    // Append user message
    const userMsg: WhatIfMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      content: userPromptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      // POST to /api/design/what-if route
      const res = await fetch('/api/design/what-if', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          currentVersionId: currentVersion.id,
          message: userPromptText
        })
      });

      const data = await res.json();

      if (!data.isFeasible) {
        // Render feasibility rejection message
        const rejMsg: WhatIfMessage = {
          id: `assistant-${Date.now()}`,
          sender: 'assistant',
          content: `Modification Infeasible: ${data.explanation}\n\nConstraints:\n${data.delta.tradeoffs.map((t: string) => `• ${t}`).join('\n')}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages(prev => [...prev, rejMsg]);
        setIsProcessing(false);
        return;
      }

      // The route returns either an incremental modification or a separate alternative concept.
      const updatedDesign: StructuredDesignJSON = data.updatedDesign;
      const newVerNum = data.versionNumber || (project.versions?.length || 1) + 1;
      const newVersionId = data.versionId || `v${newVerNum}`;

      const newVersion: FloorPlanVersion = {
        id: newVersionId,
        projectId: project.id,
        versionNumber: newVerNum,
        title: data.title || `v${newVerNum}: ${data.summary}`,
        structuredDesign: updatedDesign,
        rationale: updatedDesign.rationale || data.summary,
        tradeOffs: data.tradeOffs || [],
        parentVersionId: currentVersion.id,
        createdByPrompt: userPromptText,
        createdAt: new Date().toISOString()
      };

      // Update project state
      const updatedVersions = [...(project.versions || []), newVersion];
      const updatedProject: Project = {
        ...project,
        currentVersionId: newVersionId,
        versions: updatedVersions,
        updatedAt: new Date().toISOString()
      };

      setProject(updatedProject);
      setCurrentVersion(newVersion);
      localStorage.setItem(`project_${project.id}`, JSON.stringify(updatedProject));

      const isAlternativeConcept = data.intent === 'GENERATE_ALTERNATIVE_CONCEPT';
      const assistantMsg: WhatIfMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        content: isAlternativeConcept
          ? `${data.summary}\n\nKey architectural differences:\n${(data.diversity?.reasons || data.tradeOffs || []).map((t: string) => `• ${t}`).join('\n')}`
          : `Change Applied: ${data.summary}\n\nDesign Impact & Trade-offs:\n${(data.tradeOffs || []).map((t: string) => `• ${t}`).join('\n')}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        versionIdResult: newVersionId
      };
      setChatMessages(prev => [...prev, assistantMsg]);
    } catch {
      // Error handling
    } finally {
      setIsProcessing(false);
    }
  };

  const switchVersion = (ver: FloorPlanVersion) => {
    setCurrentVersion(ver);
  };

  const handleOpenCompare = (verA: FloorPlanVersion) => {
    setCompareVersionA(verA);
    setIsCompareOpen(true);
  };

  const activeDesign = getValidDesign(currentVersion);

  if (!project || !currentVersion || !activeDesign) {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center font-mono text-xs uppercase tracking-wider text-stone-500">
        Loading What-If Architecture Workspace...
      </div>
    );
  }

  const bedroomCount = activeDesign.rooms.filter((room) => room.category === 'bedroom').length || project.requirements?.bedrooms || 0;

  return (
    <div className="flex flex-col h-screen bg-[#111315] text-stone-100 overflow-hidden select-none">
      {/* Workspace Top Bar */}
      <header className="h-16 border-b border-stone-800 bg-[#15181C] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-stone-400 hover:text-stone-100 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <div className="h-5 w-px bg-stone-800"></div>

          <div>
            <div className="flex items-center gap-2 font-serif text-lg font-medium text-stone-100">
              {project.title}
              <span className="font-mono text-[10px] uppercase bg-stone-800 text-terracotta-400 px-2 py-0.5 border border-stone-700">
                Version {currentVersion.versionNumber}
              </span>
              <span className="font-mono text-[10px] uppercase bg-amber-950/80 text-amber-300 px-2 py-0.5 border border-amber-700/50 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-400" />
                MODEL: GEMINI 2.5 PRO
              </span>
            </div>
            <div className="font-mono text-[10px] uppercase text-stone-500 flex items-center gap-3">
              <span>{project.location.city}, {project.location.country}</span>
              <span>•</span>
              <span>{project.siteInfo.plotWidth}' × {project.siteInfo.plotDepth}' Plot</span>
              <span>•</span>
              <span>{project.preferences.primaryStyle}</span>
            </div>
          </div>
        </div>

        {/* Center: 2D / 3D Toggle */}
        <div className="flex items-center border border-stone-700 bg-stone-900 p-1">
          <button
            onClick={() => setActiveTab('2d')}
            className={`flex items-center gap-1.5 px-4 py-1.5 font-mono text-xs uppercase tracking-wider transition-all ${
              activeTab === '2d' ? 'bg-stone-100 text-stone-950 font-bold' : 'text-stone-400 hover:text-stone-100'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            2D Floor Plan
          </button>
          <button
            onClick={() => setActiveTab('3d')}
            className={`flex items-center gap-1.5 px-4 py-1.5 font-mono text-xs uppercase tracking-wider transition-all ${
              activeTab === '3d' ? 'bg-stone-100 text-stone-950 font-bold' : 'text-stone-400 hover:text-stone-100'
            }`}
          >
            <Box className="h-3.5 w-3.5" />
            3D Preview
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <button
            onClick={() => alert('Design exported to PDF blueprint!')}
            className="flex items-center gap-1.5 border border-stone-700 px-3 py-1.5 text-stone-300 hover:border-stone-500 hover:text-stone-100 transition-all"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </header>

      {/* 3-Panel Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* PANEL 1 (LEFT): Project Info & Version History */}
        <aside className="w-80 border-r border-stone-800 bg-[#15181C] flex flex-col shrink-0 overflow-y-auto">
          <div className="p-6 border-b border-stone-800 space-y-4">
            <h3 className="font-mono text-xs uppercase font-semibold text-stone-400 tracking-wider">
              Project DNA & Modes
            </h3>

            <div className="space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-stone-500">STYLE</span>
                <span className="font-serif text-stone-200">{project.preferences.primaryStyle}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">BEDROOMS</span>
                <span className="text-stone-200">{bedroomCount} BHK</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">BUILT-UP AREA</span>
                <span className="text-stone-200">{activeDesign.totalBuiltUpAreaSqFt || 0} SQ FT</span>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap gap-1.5">
              {project.preferences.modes.map((m) => (
                <span key={m} className="bg-stone-800 border border-stone-700 text-terracotta-400 px-2 py-0.5 font-mono text-[9px] uppercase">
                  {m.replace('_', ' ')}
                </span>
              ))}
            </div>
          </div>

          <div className="p-6 border-b border-stone-800">
            <h3 className="font-mono text-xs uppercase font-semibold text-stone-400 tracking-wider mb-2">
              Architectural Rationale
            </h3>
            <p className="font-sans text-xs text-stone-300 leading-relaxed italic">
              "{currentVersion.rationale}"
            </p>
          </div>

          {/* Version Stack */}
          <div className="p-6 flex-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono text-xs uppercase font-semibold text-stone-400 tracking-wider flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-terracotta-500" />
                Version History
              </h3>
              <span className="font-mono text-[10px] text-stone-500">
                {project.versions?.length || 1} Revisions
              </span>
            </div>

            <div className="space-y-3">
              {project.versions?.map((ver) => {
                const isActive = ver.id === currentVersion.id;
                return (
                  <div
                    key={ver.id}
                    className={`p-3 border transition-all ${
                      isActive
                        ? 'border-terracotta-500 bg-stone-900 text-stone-100'
                        : 'border-stone-800 bg-[#111315] text-stone-400 hover:border-stone-700'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase font-bold">
                      <span className={isActive ? 'text-terracotta-400' : 'text-stone-500'}>
                        VERSION {ver.versionNumber} {isActive && '(ACTIVE)'}
                      </span>
                      <span className="text-stone-500">
                        {new Date(ver.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="font-serif text-sm font-normal text-stone-200 mt-1">
                      {ver.title}
                    </p>

                    <div className="mt-3 flex items-center gap-2 pt-2 border-t border-stone-800 font-mono text-[10px]">
                      <button
                        onClick={() => switchVersion(ver)}
                        className={`px-2.5 py-1 uppercase border ${
                          isActive ? 'border-terracotta-500 text-terracotta-400' : 'border-stone-700 text-stone-300 hover:border-stone-500'
                        }`}
                      >
                        View
                      </button>

                      {project.versions && project.versions.length > 1 && ver.id !== currentVersion.id && (
                        <button
                          onClick={() => handleOpenCompare(ver)}
                          className="flex items-center gap-1 px-2 py-1 text-stone-400 hover:text-stone-100 uppercase"
                        >
                          <GitCompare className="h-3 w-3" />
                          Compare
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* PANEL 2 (CENTER): 2D Canvas or 3D Massing Viewer */}
        <main className="flex-1 bg-[#0F1115] relative overflow-hidden flex flex-col">
          {activeTab === '2d' ? (
            <FloorPlan2DRenderer
              design={activeDesign}
              selectedRoomId={selectedRoomId}
              onRoomSelect={(room) => setSelectedRoomId(room.id)}
            />
          ) : (
            <Massing3DViewer design={activeDesign} />
          )}
        </main>

        {/* PANEL 3 (RIGHT): What-If Assistant */}
        <aside className="w-96 border-l border-stone-800 bg-[#15181C] flex flex-col shrink-0">
          <div className="p-4 border-b border-stone-800 flex items-center justify-between bg-[#181A1D]">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center bg-terracotta-500 text-stone-950 font-bold">
                <Sparkles className="h-4 w-4 stroke-[2]" />
              </div>
              <div>
                <h3 className="font-serif text-sm font-medium text-stone-100">What-If Assistant</h3>
                <span className="font-mono text-[9px] uppercase tracking-wider text-stone-500">
                  Conversational Design Engine
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4 font-sans text-xs">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] p-3.5 rounded-none border ${
                    msg.sender === 'user'
                      ? 'bg-stone-800 border-stone-700 text-stone-100'
                      : 'bg-[#111315] border-stone-800 text-stone-300'
                  }`}
                >
                  <div className="font-mono text-[9px] uppercase tracking-wider text-stone-500 mb-1 flex items-center justify-between">
                    <span>{msg.sender === 'user' ? 'You' : 'ArchAdapt Engine'}</span>
                    <span>{msg.timestamp}</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}

            {isProcessing && (
              <div className="flex items-center gap-2 text-stone-500 font-mono text-xs italic">
                <Sparkles className="h-3.5 w-3.5 animate-spin text-terracotta-400" />
                Analyzing What-If structural delta & updating floor plan...
              </div>
            )}
          </div>

          <form onSubmit={handleWhatIfSubmit} className="p-4 border-t border-stone-800 bg-[#181A1D]">
            <div className="relative flex items-center">
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder="e.g. Add another bedroom, expand kitchen..."
                className="w-full border border-stone-700 bg-stone-900 px-4 py-3 text-xs text-stone-100 placeholder-stone-500 focus:border-stone-500 focus:outline-none pr-10 font-sans"
              />
              <button
                type="submit"
                disabled={isProcessing || !inputPrompt.trim()}
                className="absolute right-2 p-1.5 text-stone-400 hover:text-terracotta-400 disabled:opacity-40 transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-stone-500">
              <span>Press Enter to generate version</span>
              <span>Saves to Supabase</span>
            </div>
          </form>
        </aside>
      </div>

      {/* Version Comparison Modal */}
      <VersionComparisonModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        versionA={compareVersionA}
        versionB={currentVersion}
        onRestoreVersion={(ver) => switchVersion(ver)}
      />
    </div>
  );
}
