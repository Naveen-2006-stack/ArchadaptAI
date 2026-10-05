'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import FloorPlan2DRenderer from '@/components/canvas/FloorPlan2DRenderer';
import Massing3DViewer from '@/components/canvas/Massing3DViewer';
import VersionComparisonModal from '@/components/workspace/VersionComparisonModal';
import { Layers, Box, Send, Sparkles, ArrowLeft, History, Download, GitCompare, CheckCircle, AlertTriangle } from 'lucide-react';
import { Project, FloorPlanVersion, StructuredDesignJSON, WhatIfMessage } from '@/types/architectural';
import { supabase, authHeaders } from '@/lib/supabase/client';
import { getUserProjectsFromSupabase, setCurrentVersionInSupabase } from '@/lib/services/projectService';
import { validateFloorPlan } from '@/lib/design/validateFloorPlan';
import { checkRenderConsistency } from '@/lib/geometry/buildHouseGeometry';
import { countBedrooms, countRoomsOfType } from '@/lib/design/roomTypes';

const timeNow = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const isValidDesign = (design?: StructuredDesignJSON | null): design is StructuredDesignJSON => !!design && Array.isArray(design.rooms) && design.rooms.length > 0 && !!design.plot;
const WELCOME: WhatIfMessage = {
  id: 'msg-welcome',
  sender: 'assistant',
  content: 'Ask for a change to this design and I will apply it to the existing plan, check that it still fits, and save it as a new version. For example: "Add a bedroom upstairs", "Make the kitchen 20% larger", "Move the study next to the living room", or "Generate another concept".',
  timestamp: ''
};

type LoadState = 'loading' | 'ready' | 'not_found';

export default function WorkspacePage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [project, setProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<'2d' | '3d'>('2d');
  const [currentVersion, setCurrentVersion] = useState<FloorPlanVersion | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(undefined);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [compareVersionA, setCompareVersionA] = useState<FloorPlanVersion | null>(null);
  const [chatMessages, setChatMessages] = useState<WhatIfMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    async function load() {
      let found: Project | null = null;
      let signedIn = false;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          signedIn = true;
          const projects = await getUserProjectsFromSupabase(user.id);
          const match = projects.find((p) => p.id === projectId);
          if (match) found = { ...match, storage: 'supabase' };
        }
      } catch (err) {
        console.warn('[Workspace] Supabase load failed, checking this browser:', err);
      }

      if (!found) {
        try {
          const stored = localStorage.getItem(`project_${projectId}`);
          if (stored) found = { ...JSON.parse(stored), storage: 'local' };
        } catch { /* unreadable local copy */ }
      }
      if (cancelled) return;

      const versions = (found?.versions || []).filter((v) => isValidDesign(v.structuredDesign)).sort((a, b) => a.versionNumber - b.versionNumber);
      if (!found || versions.length === 0) {
        setLoadState('not_found');
        return;
      }
      found = { ...found, versions };
      setProject(found);
      setCurrentVersion(versions.find((v) => v.id === found!.currentVersionId) || versions[versions.length - 1]);

      // Conversation history: from Supabase for account projects, from this browser for local ones.
      let history: WhatIfMessage[] = [];
      if (found.storage === 'supabase' && signedIn) {
        try {
          const { data } = await supabase.from('design_conversations').select('*').eq('project_id', projectId).order('created_at', { ascending: true });
          history = (data || []).map((c) => ({
            id: c.id,
            sender: c.sender as 'user' | 'assistant',
            content: c.content,
            timestamp: new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            versionIdResult: c.resulting_version_id || undefined
          }));
        } catch { /* history is optional */ }
      } else {
        try { history = JSON.parse(localStorage.getItem(`chat_${projectId}`) || '[]'); } catch { /* ignore */ }
      }
      if (cancelled) return;
      setChatMessages(history.length ? history : [{ ...WELCOME, timestamp: timeNow() }]);
      setLoadState('ready');
    }

    load();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isProcessing]);

  const activeDesign = currentVersion && isValidDesign(currentVersion.structuredDesign) ? currentVersion.structuredDesign : null;

  // The same checks the server ran before saving, re-run on what is actually on screen.
  const checks = useMemo(() => {
    if (!activeDesign) return null;
    return { validation: validateFloorPlan(activeDesign), consistency: checkRenderConsistency(activeDesign) };
  }, [activeDesign]);

  const pushMessages = (messages: WhatIfMessage[], localProjectId?: string) => {
    setChatMessages((prev) => {
      const next = [...prev, ...messages];
      if (localProjectId) {
        try { localStorage.setItem(`chat_${localProjectId}`, JSON.stringify(next.filter((m) => m.id !== 'msg-welcome'))); } catch { /* storage full */ }
      }
      return next;
    });
  };

  const handleWhatIfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputPrompt.trim();
    if (!text || !currentVersion || !project || !activeDesign || isProcessing) return;

    const isLocal = project.storage !== 'supabase';
    const localKey = isLocal ? project.id : undefined;
    setInputPrompt('');
    pushMessages([{ id: `user-${Date.now()}`, sender: 'user', content: text, timestamp: timeNow() }], localKey);
    setIsProcessing(true);
    setElapsed(0);
    const startedAt = Date.now();
    const ticker = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 185_000);
    const reply = (content: string, versionIdResult?: string) =>
      pushMessages([{ id: `assistant-${Date.now()}`, sender: 'assistant', content, timestamp: timeNow(), versionIdResult }], localKey);

    try {
      const res = await fetch('/api/design/what-if', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        signal: controller.signal,
        body: JSON.stringify({
          projectId: project.id,
          currentVersionId: currentVersion.id,
          message: text,
          currentDesign: activeDesign,
          location: project.location
        })
      });

      let data: any = null;
      try { data = await res.json(); } catch { /* handled below */ }
      if (!data) {
        reply(`The request failed (HTTP ${res.status}). Your design was not changed.`);
        return;
      }

      if (!data.success) {
        const list = (data.violatedConstraints || []).map((c: string) => `• ${c}`).join('\n');
        const heading =
          data.status === 'INFEASIBLE' ? 'Not feasible. Your design was not changed.'
          : data.status === 'NOT_UNDERSTOOD' ? 'I could not act on that request. Your design was not changed.'
          : data.status === 'INVALID_DESIGN' ? 'No valid design was produced. Your design was not changed.'
          : data.status === 'ENGINE_UNAVAILABLE' ? 'The AI planner is unavailable. Your design was not changed.'
          : 'The request failed. Your design was not changed.';
        reply(`${heading}\n\n${data.explanation || data.error || ''}${list ? `\n\n${list}` : ''}`.trim());
        return;
      }

      const updatedDesign: StructuredDesignJSON = data.updatedDesign;
      if (!isValidDesign(updatedDesign)) {
        reply('The server answered without a usable design. Your design was not changed.');
        return;
      }

      const versionNumber = data.versionNumber || Math.max(0, ...project.versions.map((v) => v.versionNumber)) + 1;
      const newVersion: FloorPlanVersion = {
        id: data.versionId || `v${versionNumber}`,
        projectId: project.id,
        versionNumber,
        title: data.title || data.summary || `Version ${versionNumber}`,
        structuredDesign: updatedDesign,
        rationale: updatedDesign.rationale || data.summary,
        tradeOffs: data.tradeOffs || [],
        parentVersionId: currentVersion.id,
        createdByPrompt: text,
        createdAt: new Date().toISOString()
      };
      const updatedProject: Project = { ...project, currentVersionId: newVersion.id, versions: [...project.versions, newVersion], updatedAt: new Date().toISOString() };
      setProject(updatedProject);
      setCurrentVersion(newVersion);
      setSelectedRoomId(undefined);
      if (isLocal) {
        try { localStorage.setItem(`project_${project.id}`, JSON.stringify(updatedProject)); } catch { /* storage full */ }
      }

      const lines = [
        data.intent === 'GENERATE_ALTERNATIVE_CONCEPT' ? data.summary : `Applied as version ${versionNumber}: ${data.summary}`,
        (data.tradeOffs || []).length ? `\nWhat this changes:\n${data.tradeOffs.map((t: string) => `• ${t}`).join('\n')}` : '',
        (data.validationWarnings || []).length ? `\nNotes from validation:\n${data.validationWarnings.slice(0, 4).map((t: string) => `• ${t}`).join('\n')}` : '',
        data.notice ? `\n${data.notice}` : '',
        !isLocal && !data.persisted ? `\nThis version could not be saved to your account${data.persistError ? ` (${data.persistError})` : ''}. It is only held in this browser tab.` : ''
      ];
      reply(lines.filter(Boolean).join('\n'), newVersion.id);
    } catch (err: any) {
      reply(err?.name === 'AbortError' ? 'The server did not answer within 3 minutes. Your design was not changed.' : `The request failed: ${err?.message || 'network error'}. Your design was not changed.`);
    } finally {
      clearInterval(ticker);
      clearTimeout(timeout);
      setIsProcessing(false);
    }
  };

  /** Makes a version the active one, here and wherever the project is stored. */
  const activateVersion = async (version: FloorPlanVersion) => {
    setCurrentVersion(version);
    setSelectedRoomId(undefined);
    if (!project) return;
    const updated = { ...project, currentVersionId: version.id };
    setProject(updated);
    if (project.storage === 'supabase') {
      await setCurrentVersionInSupabase(project.id, version.id);
    } else {
      try { localStorage.setItem(`project_${project.id}`, JSON.stringify(updated)); } catch { /* storage full */ }
    }
  };

  const handleExport = () => {
    if (!project || !currentVersion || !activeDesign) return;
    const blob = new Blob([JSON.stringify({ project: project.title, version: currentVersion.versionNumber, design: activeDesign }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-v${currentVersion.versionNumber}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loadState === 'loading') {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center font-mono text-xs uppercase tracking-wider text-stone-500">
        Loading project…
      </div>
    );
  }

  if (loadState === 'not_found' || !project || !currentVersion || !activeDesign) {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-serif text-2xl text-stone-900">Project not found</h1>
        <p className="font-sans text-sm text-stone-600 max-w-md">
          No saved design exists for this project in your account or in this browser. If you created it while signed in, sign in again to open it.
        </p>
        <div className="flex gap-3">
          <Link href="/dashboard" className="border border-stone-900 px-6 py-3 font-mono text-xs uppercase tracking-widest text-stone-900 hover:bg-stone-100">My Projects</Link>
          <Link href="/onboarding" className="bg-stone-900 px-6 py-3 font-mono text-xs uppercase tracking-widest text-stone-50 hover:bg-stone-800">Create a Project</Link>
        </div>
      </div>
    );
  }

  const meta = activeDesign.generationMetadata;
  const engineLabel = !meta ? 'Legacy design' : meta.engine === 'gemini' ? `Gemini · ${meta.modelId}` : 'Built-in rule engine';
  const bedroomCount = countBedrooms(activeDesign);
  const bathroomCount = countRoomsOfType(activeDesign, 'bathroom');
  const notes = activeDesign.layoutNotes || [];

  return (
    <div className="flex flex-col h-screen bg-[#111315] text-stone-100 overflow-hidden select-none">
      {/* Workspace Top Bar */}
      <header className="min-h-16 border-b border-stone-800 bg-[#15181C] px-6 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/dashboard" className="text-stone-400 hover:text-stone-100 transition-colors" title="Back to My Projects">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="h-5 w-px bg-stone-800"></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-serif text-lg font-medium text-stone-100">
              <span className="truncate">{project.title}</span>
              <span className="font-mono text-[10px] uppercase bg-stone-800 text-terracotta-400 px-2 py-0.5 border border-stone-700">
                Version {currentVersion.versionNumber}
              </span>
              <span className={`font-mono text-[10px] uppercase px-2 py-0.5 border flex items-center gap-1 ${meta?.engine === 'gemini' ? 'bg-amber-950/80 text-amber-300 border-amber-700/50' : 'bg-stone-800 text-stone-300 border-stone-700'}`}>
                <Sparkles className="h-3 w-3" />
                {engineLabel}
              </span>
              {project.storage !== 'supabase' && (
                <span className="font-mono text-[10px] uppercase bg-stone-800 text-stone-300 px-2 py-0.5 border border-stone-700" title="Sign in before creating a project to save it to your account">
                  Saved in this browser only
                </span>
              )}
            </div>
            <div className="font-mono text-[10px] uppercase text-stone-500 flex flex-wrap items-center gap-x-3">
              <span>{project.location.city}, {project.location.country}</span>
              <span>•</span>
              <span>{activeDesign.plot.width}' × {activeDesign.plot.depth}' Plot</span>
              <span>•</span>
              <span>{project.preferences.primaryStyle}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center border border-stone-700 bg-stone-900 p-1">
          <button
            onClick={() => setActiveTab('2d')}
            className={`flex items-center gap-1.5 px-4 py-1.5 font-mono text-xs uppercase tracking-wider transition-all ${activeTab === '2d' ? 'bg-stone-100 text-stone-950 font-bold' : 'text-stone-400 hover:text-stone-100'}`}
          >
            <Layers className="h-3.5 w-3.5" />
            2D Floor Plan
          </button>
          <button
            onClick={() => setActiveTab('3d')}
            className={`flex items-center gap-1.5 px-4 py-1.5 font-mono text-xs uppercase tracking-wider transition-all ${activeTab === '3d' ? 'bg-stone-100 text-stone-950 font-bold' : 'text-stone-400 hover:text-stone-100'}`}
          >
            <Box className="h-3.5 w-3.5" />
            3D Model
          </button>
        </div>

        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 border border-stone-700 px-3 py-1.5 font-mono text-xs text-stone-300 hover:border-stone-500 hover:text-stone-100 transition-all"
          title="Download this version's design data as JSON"
        >
          <Download className="h-3.5 w-3.5" />
          Export JSON
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* PANEL 1 (LEFT): Design facts, validation, version history */}
        <aside className="w-80 border-r border-stone-800 bg-[#15181C] flex flex-col shrink-0 overflow-y-auto">
          <div className="p-6 border-b border-stone-800 space-y-3">
            <h3 className="font-mono text-xs uppercase font-semibold text-stone-400 tracking-wider">This Version</h3>
            <div className="space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between"><span className="text-stone-500">BEDROOMS</span><span className="text-stone-200">{bedroomCount}</span></div>
              <div className="flex items-center justify-between"><span className="text-stone-500">BATHROOMS</span><span className="text-stone-200">{bathroomCount}</span></div>
              <div className="flex items-center justify-between"><span className="text-stone-500">FLOORS</span><span className="text-stone-200">{activeDesign.floorsCount}</span></div>
              <div className="flex items-center justify-between"><span className="text-stone-500">BUILT-UP AREA</span><span className="text-stone-200">{activeDesign.totalBuiltUpAreaSqFt || 0} SQ FT</span></div>
            </div>
            {project.preferences.modes.length > 0 && (
              <div className="pt-1 flex flex-wrap gap-1.5">
                {project.preferences.modes.map((m) => (
                  <span key={m} className="bg-stone-800 border border-stone-700 text-terracotta-400 px-2 py-0.5 font-mono text-[9px] uppercase">
                    {m.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </div>

          {checks && (
            <div className="p-6 border-b border-stone-800 space-y-2">
              <h3 className="font-mono text-xs uppercase font-semibold text-stone-400 tracking-wider">Validation</h3>
              <div className={`flex items-start gap-2 font-sans text-xs ${checks.validation.isValid ? 'text-emerald-400' : 'text-red-400'}`}>
                {checks.validation.isValid ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                <span>{checks.validation.isValid ? 'Requirements, geometry and circulation checks pass.' : `${checks.validation.errors.length} problem(s) found in this version.`}</span>
              </div>
              <div className={`flex items-start gap-2 font-sans text-xs ${checks.consistency.consistent ? 'text-emerald-400' : 'text-red-400'}`}>
                {checks.consistency.consistent ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                <span>{checks.consistency.consistent ? '2D plan and 3D model contain the same rooms.' : checks.consistency.problems[0]}</span>
              </div>
              {[...checks.validation.errors, ...checks.validation.warnings, ...notes].slice(0, 6).map((line, index) => (
                <p key={index} className="font-sans text-[11px] text-stone-400 leading-snug">• {line}</p>
              ))}
            </div>
          )}

          <div className="p-6 border-b border-stone-800">
            <h3 className="font-mono text-xs uppercase font-semibold text-stone-400 tracking-wider mb-2">Architectural Rationale</h3>
            <p className="font-sans text-xs text-stone-300 leading-relaxed">{activeDesign.rationale || currentVersion.rationale}</p>
            {(activeDesign.modeConsiderations || []).map((item) => (
              <p key={item.mode} className="font-sans text-[11px] text-stone-400 leading-snug mt-2">
                <span className="font-mono uppercase text-terracotta-400">{item.mode.replace(/_/g, ' ')}: </span>
                {item.note}
              </p>
            ))}
          </div>

          <div className="p-6 flex-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono text-xs uppercase font-semibold text-stone-400 tracking-wider flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-terracotta-500" />
                Version History
              </h3>
              <span className="font-mono text-[10px] text-stone-500">{project.versions.length} {project.versions.length === 1 ? 'Version' : 'Versions'}</span>
            </div>

            <div className="space-y-3">
              {project.versions.slice().reverse().map((ver) => {
                const isActive = ver.id === currentVersion.id;
                return (
                  <div key={ver.id} className={`p-3 border transition-all ${isActive ? 'border-terracotta-500 bg-stone-900 text-stone-100' : 'border-stone-800 bg-[#111315] text-stone-400 hover:border-stone-700'}`}>
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase font-bold">
                      <span className={isActive ? 'text-terracotta-400' : 'text-stone-500'}>VERSION {ver.versionNumber} {isActive && '(VIEWING)'}</span>
                      <span className="text-stone-500">{countBedrooms(ver.structuredDesign)} BED · {ver.structuredDesign.floorsCount} FL</span>
                    </div>
                    <p className="font-serif text-sm font-normal text-stone-200 mt-1">{ver.title}</p>
                    {!isActive && (
                      <div className="mt-3 flex items-center gap-2 pt-2 border-t border-stone-800 font-mono text-[10px]">
                        <button onClick={() => activateVersion(ver)} className="px-2.5 py-1 uppercase border border-stone-700 text-stone-300 hover:border-stone-500">
                          View
                        </button>
                        <button
                          onClick={() => { setCompareVersionA(ver); setIsCompareOpen(true); }}
                          className="flex items-center gap-1 px-2 py-1 text-stone-400 hover:text-stone-100 uppercase"
                        >
                          <GitCompare className="h-3 w-3" />
                          Compare
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* PANEL 2 (CENTER): both views render the same canonical design object */}
        <main className="flex-1 bg-[#0F1115] relative overflow-hidden flex flex-col">
          {activeTab === '2d' ? (
            <FloorPlan2DRenderer design={activeDesign} selectedRoomId={selectedRoomId} onRoomSelect={(room) => setSelectedRoomId(room.id)} />
          ) : (
            <Massing3DViewer design={activeDesign} />
          )}
        </main>

        {/* PANEL 3 (RIGHT): What-If Assistant */}
        <aside className="w-96 border-l border-stone-800 bg-[#15181C] flex flex-col shrink-0">
          <div className="p-4 border-b border-stone-800 flex items-center gap-2 bg-[#181A1D]">
            <div className="flex h-7 w-7 items-center justify-center bg-terracotta-500 text-stone-950 font-bold">
              <Sparkles className="h-4 w-4 stroke-[2]" />
            </div>
            <div>
              <h3 className="font-serif text-sm font-medium text-stone-100">What-If Assistant</h3>
              <span className="font-mono text-[9px] uppercase tracking-wider text-stone-500">Edits version {currentVersion.versionNumber}</span>
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4 font-sans text-xs select-text">
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[90%] p-3.5 rounded-none border ${msg.sender === 'user' ? 'bg-stone-800 border-stone-700 text-stone-100' : 'bg-[#111315] border-stone-800 text-stone-300'}`}>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-stone-500 mb-1 flex items-center justify-between gap-4">
                    <span>{msg.sender === 'user' ? 'You' : 'ArchAdapt'}</span>
                    <span>{msg.timestamp}</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex items-center gap-2 text-stone-500 font-mono text-xs">
                <Sparkles className="h-3.5 w-3.5 animate-spin text-terracotta-400" />
                Working out the change and re-checking the plan… {elapsed}s
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleWhatIfSubmit} className="p-4 border-t border-stone-800 bg-[#181A1D]">
            <div className="relative flex items-center">
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                disabled={isProcessing}
                maxLength={2000}
                placeholder="e.g. Add a bedroom upstairs"
                className="w-full border border-stone-700 bg-stone-900 px-4 py-3 text-xs text-stone-100 placeholder-stone-500 focus:border-stone-500 focus:outline-none pr-10 font-sans disabled:opacity-60"
              />
              <button type="submit" disabled={isProcessing || !inputPrompt.trim()} className="absolute right-2 p-1.5 text-stone-400 hover:text-terracotta-400 disabled:opacity-40 transition-colors" title="Send">
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 font-mono text-[9px] text-stone-500">
              Each accepted change becomes a new version; earlier versions are kept.
            </div>
          </form>
        </aside>
      </div>

      <VersionComparisonModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        versionA={compareVersionA}
        versionB={currentVersion}
        onRestoreVersion={(ver) => activateVersion(ver)}
      />
    </div>
  );
}
