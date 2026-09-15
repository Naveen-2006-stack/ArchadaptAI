# ArchAdapt AI — Visual Design System & Contract (`DESIGN.md`)

## 1. Visual DNA & Design Philosophy
ArchAdapt AI is designed as a **quiet, architectural studio application** inspired by contemporary architectural monograph publications and high-end design agency websites.

Key characteristics:
- **Restrained & Editorial**: Generous whitespace, precise micro-borders, minimal decoration, clear typographic scale.
- **Architectural Color Palette**: Warm neutral stone, deep charcoal slate, architectural cream, and subtle terracotta/copper accenting.
- **Tactile & Structural**: Fine 1px borders (`border-stone-200` / `border-white/10`), subtle card elevations, and geometric grid layouts.
- **High Signal-to-Noise**: Avoid generic saturated AI gradients, purple glow effects, or cartoonish rounded cards (`rounded-xl` / `rounded-2xl` used selectively; default crisp `rounded-none` or `rounded-md`).

---

## 2. Color Tokens

### Primary Palette
- **Canvas / Background (Light)**: `#F9F8F6` (Warm Stone White / Paper)
- **Canvas / Background (Dark / Workspace)**: `#111315` (Deep Charcoal Slate)
- **Surface / Card (Light)**: `#FFFFFF` (Pure White)
- **Surface / Card (Dark)**: `#181A1D` (Obsidian Surface)
- **Border / Divider (Light)**: `#E6E3DE` (Warm Sand Border)
- **Border / Divider (Dark)**: `#2A2D32` (Muted Charcoal Line)

### Text Tokens
- **Text Primary (Light)**: `#121417` (Deep Ink)
- **Text Secondary (Light)**: `#63666A` (Muted Slate)
- **Text Primary (Dark)**: `#F3F4F6` (Off-White)
- **Text Secondary (Dark)**: `#9CA3AF` (Muted Grey)

### Architectural Accent Palette
- **Terracotta Accent**: `#C86A4B` (Warm Clay / Primary CTA accent)
- **Architectural Copper**: `#B87333` (Secondary Highlights)
- **Blueprint Blue**: `#2B5B84` (Structural / Grid annotations)
- **Sage / Environmental**: `#4A6B5D` (Climate-adaptive indicators)

---

## 3. Typography Scale
Powered by **Plus Jakarta Sans** (Sans-serif UI) & **Cinzel** / **Playfair Display** (Editorial Architectural Headers).

- **Display H1**: `font-serif text-4xl sm:text-5xl lg:text-6xl font-light tracking-tight leading-[1.1]`
- **Section H2**: `font-serif text-2xl sm:text-3xl font-normal tracking-tight text-stone-900`
- **Component H3**: `font-sans text-lg font-semibold tracking-wide uppercase text-stone-800`
- **Body Regular**: `font-sans text-sm sm:text-base leading-relaxed text-stone-600`
- **Technical / Code / Annotations**: `font-mono text-xs tracking-wider uppercase text-stone-500`

---

## 4. UI Components Specification

### Navigation Bar
- **Style**: Floating / Sticky minimal top bar with 1px border bottom (`border-stone-200` / `border-white/10`).
- **Brand Mark**: Clean geometric icon with serif typography "ARCHADAPT AI".
- **Actions**: Quiet navigation links + Sharp primary button ("Start Designing").

### Cards & Panels
- **Structure**: Clean 1px border, 0px or 4px subtle rounded corners (`rounded-sm`), padding `p-6` or `p-8`.
- **Hover**: Subtle border color shift (`hover:border-stone-400`), zero noisy drop shadows.

### Buttons
- **Primary**: Solid Deep Charcoal `#121417` with white text, `px-6 py-3 text-xs tracking-widest uppercase font-semibold hover:bg-stone-800 transition-all rounded-none`.
- **Secondary / Outline**: 1px border `#121417`, transparent bg, `px-6 py-3 text-xs tracking-widest uppercase font-semibold hover:bg-stone-100 transition-all rounded-none`.
- **Accent**: Warm Clay `#C86A4B` for primary blueprint/generation actions.

### Architectural Canvas & Floor Plan Renderer
- **Background**: Grid pattern on warm cream `#F4F2EC` or dark blueprint slate `#0F1115`.
- **Walls**: High contrast 2px-4px solid black/white vectors with fill.
- **Room Labels**: Uppercase sans-serif with square footage / metric dimensions (`LIVING ROOM • 18' x 14'`).
- **Circulation & Openings**: Arc door swings, double window cutouts, stair tread indicators.

---

## 5. Responsive & Layout Contract
- **Desktop (Primary Target)**: 3-column workspace layout (Left: 320px sidebar, Center: Flex canvas, Right: 380px AI panel).
- **Tablet**: Collapsible sidebars with drawer toggle.
- **Mobile**: Stacked tabs for Workspace (2D Plan, 3D Preview, What-If Assistant).
