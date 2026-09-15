-- ArchAdapt AI Database Schema & RLS Policies

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PROJECTS TABLE
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location_name TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  current_version_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SITE INPUTS TABLE
CREATE TABLE IF NOT EXISTS public.site_inputs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  file_url TEXT,
  file_type TEXT,
  plot_width NUMERIC(8, 2), -- in feet/meters
  plot_depth NUMERIC(8, 2),
  plot_area NUMERIC(10, 2),
  orientation TEXT, -- N, S, E, W, NE, NW, SE, SW
  extracted_details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. DESIGN REQUIREMENTS TABLE
CREATE TABLE IF NOT EXISTS public.design_requirements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  family_size INT DEFAULT 4,
  bedrooms INT DEFAULT 3,
  bathrooms INT DEFAULT 3,
  floors INT DEFAULT 2,
  budget_range TEXT,
  must_have_spaces JSONB DEFAULT '[]'::jsonb, -- ['study', 'courtyard', 'puja_room', 'parking']
  special_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. DESIGN MODES & PREFERENCES TABLE
CREATE TABLE IF NOT EXISTS public.design_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  modes JSONB DEFAULT '[]'::jsonb, -- ['climate_adaptive', 'life_stage', 'budget_first', 'renovation']
  architectural_style TEXT DEFAULT 'Modern',
  secondary_style TEXT,
  custom_style_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. FLOOR PLAN VERSIONS TABLE
CREATE TABLE IF NOT EXISTS public.floor_plan_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  version_number INT NOT NULL,
  title TEXT DEFAULT 'Conceptual Version',
  structured_design JSONB NOT NULL, -- Core authoritative JSON floorplan schema
  rationale TEXT NOT NULL,
  trade_offs JSONB DEFAULT '[]'::jsonb,
  parent_version_id UUID REFERENCES public.floor_plan_versions(id) ON DELETE SET NULL,
  created_by_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. DESIGN CONVERSATIONS TABLE (What-If Assistant)
CREATE TABLE IF NOT EXISTS public.design_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  sender TEXT NOT NULL, -- 'user' | 'assistant'
  content TEXT NOT NULL,
  intent TEXT,
  resulting_version_id UUID REFERENCES public.floor_plan_versions(id) ON DELETE SET NULL,
  applied_changes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. THREE D MODELS TABLE
CREATE TABLE IF NOT EXISTS public.three_d_models (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  floor_plan_version_id UUID REFERENCES public.floor_plan_versions(id) ON DELETE CASCADE NOT NULL,
  geometry_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. SAVED DESIGNS TABLE
CREATE TABLE IF NOT EXISTS public.saved_designs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  floor_plan_version_id UUID REFERENCES public.floor_plan_versions(id) ON DELETE CASCADE NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floor_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.three_d_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_designs ENABLE ROW LEVEL SECURITY;

-- Profiles: user can read/update their own profile
CREATE POLICY "Users can access own profile" ON public.profiles FOR ALL USING (auth.uid() = id);

-- Projects: user can access their own projects
CREATE POLICY "Users can access own projects" ON public.projects FOR ALL USING (auth.uid() = user_id);

-- Sub-entities inherit access check via project_id / auth.uid()
CREATE POLICY "Users access own site inputs" ON public.site_inputs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = site_inputs.project_id AND projects.user_id = auth.uid())
);

CREATE POLICY "Users access own requirements" ON public.design_requirements FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = design_requirements.project_id AND projects.user_id = auth.uid())
);

CREATE POLICY "Users access own preferences" ON public.design_preferences FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = design_preferences.project_id AND projects.user_id = auth.uid())
);

CREATE POLICY "Users access own versions" ON public.floor_plan_versions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = floor_plan_versions.project_id AND projects.user_id = auth.uid())
);

CREATE POLICY "Users access own conversations" ON public.design_conversations FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = design_conversations.project_id AND projects.user_id = auth.uid())
);

CREATE POLICY "Users access own saved designs" ON public.saved_designs FOR ALL USING (auth.uid() = user_id);

-- AUTOMATIC PROFILE CREATION TRIGGER FOR GOOGLE SIGN-IN
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Safe Trigger Cleanup & Creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- STORAGE BUCKET & PERMISSIONS FOR SITE UPLOADS
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-plans', 'site-plans', true)
ON CONFLICT (id) DO NOTHING;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can upload site plans') THEN
    CREATE POLICY "Users can upload site plans" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'site-plans' AND auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can view site plans') THEN
    CREATE POLICY "Users can view site plans" ON storage.objects
      FOR SELECT USING (bucket_id = 'site-plans' AND auth.uid() IS NOT NULL);
  END IF;
END $$;


