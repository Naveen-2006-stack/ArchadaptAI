'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/navigation/Navbar';
import { Plus, MapPin, Trash2, ArrowRight } from 'lucide-react';
import { Project } from '@/types/architectural';
import { supabase } from '@/lib/supabase/client';
import { getUserProjectsFromSupabase, deleteProjectFromSupabase } from '@/lib/services/projectService';

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUserProjects() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Query Supabase for real persistent user projects
        const dbProjects = await getUserProjectsFromSupabase(user.id);
        if (dbProjects && dbProjects.length > 0) {
          setProjects(dbProjects);
          setLoading(false);
          return;
        }
      }

      // Fallback: Check local storage for offline / guest creations
      const keys = Object.keys(localStorage).filter(k => k.startsWith('project_'));
      const localLoaded: Project[] = [];
      keys.forEach(k => {
        try {
          const item = JSON.parse(localStorage.getItem(k) || '');
          if (item && item.id) localLoaded.push(item);
        } catch {}
      });

      if (localLoaded.length > 0) {
        setProjects(localLoaded);
      } else {
        // Demo project if no projects exist yet
        setProjects([
          {
            id: 'demo-proj-1',
            userId: user?.id || 'demo-user',
            title: 'Kerala Modern Tropical Residence',
            location: { name: 'Kochi Plot', city: 'Kochi', country: 'India', lat: 9.93, lng: 76.26 },
            siteInfo: { plotWidth: 40, plotDepth: 60, totalArea: 2400, orientation: 'E' },
            requirements: {
              familySize: 4, bedrooms: 3, bathrooms: 2, floors: 2, budgetRange: 'Moderate',
              spaces: { living: true, dining: true, kitchen: true, parkingCars: 1, balcony: true, studyWorkspace: true, storage: true, prayerRoom: false, courtyard: true, guestRoom: false, outdoorGarden: true }
            },
            preferences: { modes: ['climate_adaptive', 'life_stage'], primaryStyle: 'Kerala Traditional' },
            currentVersionId: 'v1',
            versions: [
              {
                id: 'v1',
                projectId: 'demo-proj-1',
                versionNumber: 1,
                title: 'Initial Concept',
                structuredDesign: {
                  plot: { width: 40, depth: 60, totalArea: 2400, orientation: 'E', roadSide: 'N' },
                  totalBuiltUpAreaSqFt: 1850,
                  floorsCount: 2,
                  entranceDirection: 'East Entrance',
                  rooms: [
                    { id: 'r1', name: 'Verandah (Sit-out)', category: 'circulation', dimensions: "12' x 8'", areaSqFt: 96, position: { x: 35, y: 5, width: 30, height: 12, floorLevel: 0 }, connections: [], features: [] },
                    { id: 'r2', name: 'Living Room', category: 'living', dimensions: "18' x 16'", areaSqFt: 288, position: { x: 10, y: 18, width: 42, height: 28, floorLevel: 0 }, connections: [], features: [] },
                    { id: 'r3', name: 'Nadumuttam Courtyard', category: 'outdoor', dimensions: "10' x 10'", areaSqFt: 100, position: { x: 53, y: 18, width: 22, height: 28, floorLevel: 0 }, connections: [], features: [] },
                    { id: 'r4', name: 'Master Suite', category: 'bedroom', dimensions: "16' x 14'", areaSqFt: 224, position: { x: 10, y: 72, width: 42, height: 25, floorLevel: 0 }, connections: [], features: [] }
                  ],
                  walls: [], openings: [], circulationNotes: 'Direct core', rationale: 'Climate-adaptive design.', modeConsiderations: [], styleFeatures: []
                },
                rationale: 'Climate-adaptive concept with passive stack ventilation.',
                tradeOffs: [],
                createdAt: new Date().toISOString()
              }
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]);
      }

      setLoading(false);
    }

    loadUserProjects();
  }, []);

  const handleDelete = async (id: string) => {
    await deleteProjectFromSupabase(id);
    localStorage.removeItem(`project_${id}`);
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] text-stone-900">
      <Navbar />

      <main className="mx-auto max-w-7xl px-6 lg:px-12 py-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-stone-200 pb-8 mb-12 gap-6">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-terracotta-500">Architectural Studio Workspace</span>
            <h1 className="font-serif text-4xl font-normal text-stone-950 mt-1">My Projects</h1>
          </div>

          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 bg-stone-900 px-6 py-3.5 font-sans text-xs font-semibold uppercase tracking-widest text-stone-50 hover:bg-stone-800 transition-all shadow-md self-start sm:self-auto"
          >
            <Plus className="h-4 w-4 text-terracotta-400" />
            Create New Project
          </Link>
        </div>

        {loading ? (
          <div className="text-center font-mono text-xs text-stone-500 uppercase tracking-widest py-12">
            Loading Real User Projects from Supabase...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {projects.map((project) => (
              <div
                key={project.id}
                className="border border-stone-300 bg-white p-6 shadow-sm hover:border-stone-900 transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase text-stone-500 mb-3">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-terracotta-500" />
                      {project.location.city}, {project.location.country}
                    </span>
                    <span className="bg-stone-100 px-2 py-0.5 font-bold text-stone-700">
                      v{project.versions?.length || 1}
                    </span>
                  </div>

                  <h3 className="font-serif text-xl font-medium text-stone-900 group-hover:text-terracotta-600 transition-colors">
                    {project.title}
                  </h3>

                  <div className="mt-4 flex flex-wrap gap-2 font-mono text-[10px] uppercase text-stone-600">
                    <span className="bg-[#F4F1EA] px-2.5 py-1 border border-stone-200">
                      Style: {project.preferences?.primaryStyle || 'Modern'}
                    </span>
                    <span className="bg-[#F4F1EA] px-2.5 py-1 border border-stone-200">
                      Plot: {project.siteInfo?.plotWidth || 40}' × {project.siteInfo?.plotDepth || 60}'
                    </span>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-stone-200 flex items-center justify-between">
                  <button
                    onClick={() => handleDelete(project.id)}
                    className="text-stone-400 hover:text-red-600 transition-colors p-1"
                    title="Delete Project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>

                  <Link
                    href={`/workspace/${project.id}`}
                    className="inline-flex items-center gap-1.5 font-sans text-xs font-semibold uppercase tracking-widest text-stone-900 hover:text-terracotta-500 transition-colors"
                  >
                    Open Workspace
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
