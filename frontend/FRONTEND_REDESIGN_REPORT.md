# DocFlow — Frontend Redesign Report

**Project:** DocGen Pro / DocFlow  
**Date:** June 19, 2026  
**Stack:** React 18 · Vite 6 · Ant Design 5 · Tailwind CSS 3 · Zustand  
**Scope:** Visual design, animations, layout, styling only — backend/API/routes/auth unchanged

---

## 1. Executive Summary

The DocGen Pro frontend was fully redesigned and elevated into **DocFlow**, a modern document automation interface. The work established a cohesive design system (navy + gold palette), animation framework, redesigned navigation, dashboard landing page, employer master with card grid, 4-step document generation wizard with custom step indicators, document preview panel, and responsive breakpoints for desktop through mobile.

**Build status:** Production build passes (`npm run build` ✓)

---

## 2. Brand & Identity Changes

| Before | After |
|--------|-------|
| App name: **DocGen Pro** | UI brand: **DocFlow** |
| Primary color: `#1677ff` (Ant default blue) | Primary: `#1A3C5E` (deep navy) |
| Accent: none | Accent: `#D4A017` (gold) |
| Generic Ant Design layout | Custom gradient sidebar, card-based UI |
| Table-heavy dashboard | Stats cards + quick actions + trade pills |

Login page, sidebar logo area, and page titles now use the DocFlow identity with gold underline accent.

---

## 3. Design System

### 3.1 Files Created

| File | Purpose |
|------|---------|
| `src/design/tokens.js` | JS design tokens: colors, spacing, radius, shadows, typography, Ant theme config |
| `src/design/animations.js` | Easing curves, keyframe CSS strings, `animateCounter()`, `easeOutExpo()` |
| `src/styles/global.css` | CSS variables, animation classes, component styles, Ant overrides |
| `tailwind.config.js` | Tailwind theme extensions (colors, fonts, shadows) |
| `postcss.config.js` | PostCSS pipeline for Tailwind |

### 3.2 Color Palette

```
--primary:        #1A3C5E   (deep navy)
--primary-light:  #2D5A8E   (medium navy)
--accent:         #D4A017   (gold)
--accent-light:   #F0C040   (light gold)
--surface:        #FFFFFF
--surface-2:      #F7F9FC   (off-white)
--surface-3:      #EEF2F7   (light grey-blue)
--border:         #DDE3EC
--text-primary:   #1A1A2E
--text-secondary: #5A6478
--text-muted:     #9AA3B0
--success:        #0D7C4A
--warning:        #D97706
--error:          #C0392B
--purple:         #2D1B4E
--green:          #1B4332
--preview-bg:     #1E2A3A
```

### 3.3 Typography

- **Display & Body:** Inter (Google Fonts)
- **Monospace:** JetBrains Mono (ref numbers, IDs)
- Loaded in `index.html`

### 3.4 Spacing Scale (4px base)

| Token | Value |
|-------|-------|
| xs | 4px |
| sm | 8px |
| md | 16px |
| lg | 24px |
| xl | 32px |
| 2xl | 48px |

### 3.5 Border Radius

| Token | Value |
|-------|-------|
| sm | 6px |
| md | 10px |
| lg | 16px |
| xl | 24px |
| full | 9999px |

### 3.6 Shadows

| Token | Value |
|-------|-------|
| sm | `0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)` |
| md | `0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)` |
| lg | `0 10px 30px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.08)` |
| xl | `0 20px 60px rgba(0,0,0,0.15), 0 8px 20px rgba(0,0,0,0.10)` |
| glow | `0 0 20px rgba(212,160,23,0.25)` |

### 3.7 Ant Design Theme Integration

`main.jsx` uses `ConfigProvider` with `antTheme` from `tokens.js`:

- Primary color mapped to navy
- Border radius, font family, input/select/table/drawer tokens customized
- `preflight: false` in Tailwind to avoid conflicts with Ant reset CSS

---

## 4. Animation System

### 4.1 Easing Curves

| Name | Value |
|------|-------|
| ease-out-expo | `cubic-bezier(0.16, 1, 0.3, 1)` |
| ease-in-out | `cubic-bezier(0.4, 0, 0.2, 1)` |
| spring | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| smooth | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` |

### 4.2 Keyframe Animations (global.css)

| Animation | Description | Duration |
|-----------|-------------|----------|
| `fadeInUp` | opacity 0 → 1, translateY(16px → 0) | 400ms |
| `fadeInDown` | opacity 0 → 1, translateY(-12px → 0) | 350ms |
| `scaleIn` | opacity 0 → 1, scale(0.94 → 1) | 300ms |
| `slideInRight` | opacity 0 → 1, translateX(24px → 0) | 400ms |
| `slideInLeft` | opacity 0 → 1, translateX(-24px → 0) | 400ms |
| `shimmer` | Loading skeleton gradient sweep | 1.6s infinite |
| `pulse` | opacity 1 → 0.5 → 1 | 2s infinite |
| `float` | translateY(0 → -6px → 0) | 3s infinite |
| `shake` | Form validation shake ±6px | 400ms |
| `slideOutLeft` / `slideInFromRight` | Wizard step transitions | 350ms |
| `connectorFill` | Step indicator line fill | 400ms |
| `spin` | Loading spinner | 0.7s linear |

### 4.3 Utility Classes

`.animate-fade-in-up`, `.animate-scale-in`, `.animate-shimmer`, `.animate-shake`, `.stagger-children` (60ms delay per nth-child), etc.

### 4.4 JavaScript Animation

- **`CounterUp`** component — `requestAnimationFrame` counter from 0 to target over 1200ms with ease-out-expo
- **`animateCounter()`** exported from `animations.js`

### 4.5 Accessibility

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

---

## 5. New UI Components

| Component | Path | Description |
|-----------|------|-------------|
| `CounterUp` | `src/components/ui/CounterUp.jsx` | Animated number counter |
| `StatCard` | `src/components/ui/StatCard.jsx` | Dashboard stat card with icon, counter, trend (memoized) |
| `StepIndicator` | `src/components/ui/StepIndicator.jsx` | 4-step wizard circles with connectors (memoized) |
| `SubStepDots` | `src/components/ui/SubStepDots.jsx` | 8-dot sub-step progress for fill form (memoized) |
| `SkeletonBlock` | `src/components/ui/Skeleton.jsx` | Shimmer loading placeholders |
| `StatCardSkeleton` | same | Stat card loading state |
| `TableRowSkeleton` | same | Table row loading state |
| `EmployerCardSkeleton` | same | Employer card loading state |

---

## 6. Layout & Navigation Redesign

**File:** `src/components/AppLayout.jsx`

### 6.1 Sidebar

| Property | Value |
|----------|-------|
| Expanded width | 240px |
| Collapsed width | 64px |
| Background | `linear-gradient(180deg, #1A3C5E → #0D2137)` |
| Transition | width 280ms ease-out-expo |

**Features:**
- Logo area: 32px icon + "DocFlow" text + 2px gold underline (80px)
- Nav items: icon + label, 12px 16px padding, 10px radius
- Hover: `rgba(255,255,255,0.08)` background + translateX(4px)
- Active: gold tint background + 3px left border + gold text
- Collapse toggle at bottom with chevron rotation
- User avatar circle with initials, name + role (fade on collapse)
- Logout button in expanded state

### 6.2 Responsive Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| Desktop (>1280px) | Full sidebar, expanded by default |
| Laptop (1024–1280px) | Sidebar collapsed by default |
| Tablet (768–1024px) | Sidebar hidden; hamburger opens overlay drawer |
| Mobile (<768px) | Bottom navigation bar (Dashboard, Generate, Employers, Admin) |

### 6.3 Removed

- Old Ant Design `Layout.Sider` + `Menu` hover-expand pattern
- Top header bar with username/tag/logout (moved to sidebar)

---

## 7. Page-by-Page Changes

### 7.1 Login Page

**File:** `src/pages/LoginPage.jsx`

- Full-screen navy → purple gradient background
- Centered card with rounded-xl corners and xl shadow
- Branded logo box with gold icon
- DocFlow title + gold underline
- Design-system form inputs (`.docflow-input`)
- Primary navy sign-in button

### 7.2 Dashboard (New Landing Page)

**File:** `src/pages/DashboardPage.jsx`

#### Hero Stats Row (4 cards, staggered fadeInUp)

| Card | Icon | Data Source |
|------|------|-------------|
| Total Documents Generated | FileText (navy) | `getAdminStats()` or `documents.length` |
| Active Employers | Bank (gold) | `getEmployers()` count or admin stats |
| Trades in Bank | Tool (purple) | Trade bank API / default 55 |
| Formats Available | Layout (green) | `getTemplatesCatalog()` NZ formats |

- Animated counters via `CounterUp`
- Hover: shadow-lg + translateY(-2px)

#### Quick Actions (2-column grid)

| Card | Style | Action |
|------|-------|--------|
| Generate Offer Letter | Navy gradient | Navigate to `/create` |
| Employer Master | Gold gradient | Navigate to `/employers` |

#### Recent Documents Table

Columns: Ref No · Type · Company · Trade · Country · Date · Download  
- Ghost download button (hover fills navy)
- Row hover: `#F7F9FC`
- Empty state: inline SVG illustration + CTA button

#### Trade Bank Preview

- Category pills with count badges
- Hover: navy background, white text

### 7.3 Employer Master Page

**File:** `src/pages/EmployersPage.jsx`

#### Card Grid (3 → 2 → 1 columns)

Each card includes:
- 6px navy→gold gradient top strip
- 56px overlapping logo circle (initials fallback)
- Company name, country + city with flag emoji
- NZBN/registration pill badge
- HR contact mini avatar + name
- Action row: Edit · Delete · View documents icons
- Hover: translateY(-4px) + shadow-lg

#### Custom Drawer (NOT Ant Drawer)

| Property | Value |
|----------|-------|
| Width | 480px |
| Animation | slideInRight 380ms ease-out-expo |
| Overlay | rgba(0,0,0,0.3) fade |
| Structure | Sticky header · scrollable body · sticky footer (Cancel + Save) |

- Empty state: building + plus SVG illustration

### 7.4 Document Generation Flow

**File:** `src/pages/CreateDocPage.jsx`

#### Custom Step Indicator

- 4 circles connected by animated dashed/solid lines
- Active: navy fill + gold glow ring
- Completed: gold fill + checkmark
- Inactive: outline grey circle
- Step labels below circles
- Step content transitions: slide out left / slide in right (350ms)

#### Step 1 — Document Type

**File:** `src/components/StepSelectDoc.jsx`

- Full-width card grid
- Available badge (green pill) on active types from API
- "Coming Soon" cards: Employment Contract, Appointment Letter (greyed, non-clickable)
- Selected: navy border + tinted background + scale(1.02)

#### Step 2 — Country + Category + Format

**File:** `src/components/wizard/StepTemplateSelect.jsx`

- Cascading reveal: Country → Category (fadeInUp) → Format cards (fadeInUp)
- Format as visual cards (not dropdown) with color swatches
- Selected format: glassmorphism summary card
- Country dropdown with flag emojis

#### Step 3 — Employer + Trade

**File:** `src/components/wizard/StepEmployerTrade.jsx`

- Split layout: 55% employers · 45% trade selector
- Employer cards: 40px circle logo, company name, city/country
- Selected: navy border + gold dot top-right
- "Add New" dashed card with plus icon
- Trade: searchable dropdown with ANZSCO codes
- Duties preview: collapsible with maxHeight + opacity animation (300ms)
- Custom employer drawer (480px)

#### Step 4 — Fill Form + Preview

**File:** `src/components/wizard/StepSmartFillForm.jsx`

- 8 sub-step dots via `SubStepDots` in bottom bar
- Gold 3px progress bar (updates per sub-step)
- Glassmorphism summary card (company, trade, ref number)
- Shimmer skeleton loading state
- `.docflow-input` styled form fields
- Side preview panel (desktop ≥1100px)
- Mobile preview via modal button

#### Wizard Bottom Bar

**File:** `src/components/wizard/WizardBottomBar.jsx`

- Ghost back button + primary continue button
- Center slot for sub-step dots on fill step

### 7.5 Document Preview Panel

**File:** `src/components/wizard/DocumentPreviewPanel.jsx`

| Property | Value |
|----------|-------|
| Background | `#1E2A3A` |
| Page size | 300 × 424px (A4 ratio) |
| Page gap | 16px |
| Page shadow | `0 4px 20px rgba(0,0,0,0.4)` |
| Load animation | scaleIn + 80ms stagger per page |

- Header: "Preview" label · "Page X / Y" counter · fullscreen button
- Fullscreen button: glassmorphism + scale(1.08) hover
- IntersectionObserver for current page tracking

---

## 8. Files Modified

### Created (New)

```
src/design/tokens.js
src/design/animations.js
src/styles/global.css          (major expansion)
src/components/ui/CounterUp.jsx
src/components/ui/StatCard.jsx
src/components/ui/StepIndicator.jsx
src/components/ui/SubStepDots.jsx
src/components/ui/Skeleton.jsx
tailwind.config.js
postcss.config.js
FRONTEND_REDESIGN_REPORT.md    (this file)
```

### Modified (Redesigned)

```
index.html                     — Google Fonts, DocFlow title
src/main.jsx                   — antTheme, global.css import
src/components/AppLayout.jsx   — Full sidebar redesign + responsive
src/pages/DashboardPage.jsx    — Complete dashboard rebuild
src/pages/EmployersPage.jsx    — Card grid + custom drawer
src/pages/CreateDocPage.jsx    — StepIndicator + step transitions
src/pages/LoginPage.jsx        — Branded login screen
src/components/StepSelectDoc.jsx
src/components/wizard/StepTemplateSelect.jsx
src/components/wizard/StepEmployerTrade.jsx
src/components/wizard/StepSmartFillForm.jsx
src/components/wizard/DocumentPreviewPanel.jsx
src/components/wizard/WizardBottomBar.jsx
package.json                   — tailwindcss, postcss, autoprefixer added
```

### Unchanged (Preserved as Required)

```
src/App.jsx                    — Routes, auth logic
src/api/client.js              — All API endpoints
src/store/useDocStore.js       — State management
src/components/EmployerForm.jsx — Form fields & validation
src/components/wizard/smartFormConfig.js
src/components/wizard/subStepMeta.js
src/components/form/*          — Field components
src/components/AdminPanel.jsx  — Not restyled in this pass
src/hooks/useAppMessage.js
Backend (all)                  — No changes
```

### Legacy (Still Present, Superseded)

```
src/components/wizard/CompactWizardDots.jsx  — Replaced by StepIndicator / SubStepDots
src/components/StepCompany.jsx               — Old wizard steps (unused in current flow)
src/components/StepCountryTrade.jsx
src/components/StepFillForm.jsx
src/components/StepPreview.jsx
```

---

## 9. CSS Class Reference

### Layout

| Class | Usage |
|-------|-------|
| `.docflow-sidebar` | Gradient sidebar container |
| `.docflow-nav-item` | Sidebar navigation link/button |
| `.docflow-nav-item.active` | Active nav state |
| `.mobile-bottom-nav` | Mobile bottom navigation |
| `.page-enter` | Route/page fade-in |

### Cards

| Class | Usage |
|-------|-------|
| `.stat-card` | Dashboard stat cards |
| `.action-card-navy` | Navy gradient CTA |
| `.action-card-gold` | Gold gradient CTA |
| `.doc-type-card` | Document type selection |
| `.format-card` | Template format selection |
| `.employer-master-card` | Employer grid cards |
| `.glass-summary` | Glassmorphism summary panel |

### Forms

| Class | Usage |
|-------|-------|
| `.docflow-input` | Styled Ant inputs/selects/pickers |
| `.docflow-form-label` | 13px semibold navy labels |
| `.form-progress-bar` | Gold sub-step progress |
| `.form-progress-fill` | Progress fill with smooth width transition |

### Wizard

| Class | Usage |
|-------|-------|
| `.wizard-step-circle` | Main step circles |
| `.wizard-connector` | Step connector lines |
| `.substep-dot` | Sub-step progress dots |

### Preview

| Class | Usage |
|-------|-------|
| `.preview-panel` | Dark preview sidebar |
| `.preview-page-frame` | A4 page frame |
| `.preview-fullscreen-btn` | Glassmorphism fullscreen button |

### Drawer

| Class | Usage |
|-------|-------|
| `.docflow-drawer-overlay` | 30% black backdrop |
| `.docflow-drawer-panel` | 480px right slide-in panel |

### Loading

| Class | Usage |
|-------|-------|
| `.animate-shimmer` | Skeleton shimmer effect |
| `.docflow-spinner` | 16px navy loading arc |
| `.stagger-children` | Staggered list animation delays |

---

## 10. Dependencies Added

```json
"devDependencies": {
  "tailwindcss": "^3.4.19",
  "postcss": "^8.5.15",
  "autoprefixer": "^10.5.0"
}
```

No new runtime dependencies. Icons remain `@ant-design/icons`.

---

## 11. Performance Considerations

| Rule | Status |
|------|--------|
| CSS animations over JS where possible | ✅ Implemented |
| GPU-composited transform/opacity | ✅ Used for animations |
| `React.memo` on card components | ✅ StatCard, StepIndicator, SubStepDots, TradePill, EmployerCard |
| `prefers-reduced-motion` support | ✅ Global CSS rule |
| Debounced preview refresh | ✅ 900ms in DocumentPreviewPanel |
| Lazy load non-critical components | ⚠️ Not yet (single bundle ~2.3MB) |
| Search input debounce 300ms | ⚠️ Uses onSearch/onPressEnter, not live debounce |

**Build output:**
- CSS: ~22 KB gzip
- JS: ~700 KB gzip (main chunk — candidate for code-splitting)

---

## 12. Implementation Checklist

| # | Task | Status |
|---|------|--------|
| 1 | Design tokens + global CSS | ✅ Done |
| 2 | Animation keyframes + utility classes | ✅ Done |
| 3 | Sidebar redesign | ✅ Done |
| 4 | Dashboard page | ✅ Done |
| 5 | Employer master page + drawer | ✅ Done |
| 6 | Document generation step indicator | ✅ Done |
| 7 | Step 1–3 visual upgrades | ✅ Done |
| 8 | Step 4 sub-step form + preview panel | ✅ Done |
| 9 | Micro-interactions (buttons, inputs, toasts) | ⚠️ Partial — Ant buttons themed; custom toasts/tooltips not fully custom |
| 10 | Loading skeletons | ✅ Done |
| 11 | Responsive fixes | ✅ Done |
| 12 | Performance pass | ⚠️ Partial — memo applied; code-splitting pending |

---

## 13. Known Limitations & Future Work

1. **Admin Panel** — Not restyled; still uses previous Ant Design styling
2. **Custom toasts** — Ant Design `message` used; spec called for slide-in toasts with progress bar
3. **Custom tooltips** — Ant Design `Tooltip` still used in some places
4. **Form shake on error** — CSS class exists (`.animate-shake`) but not wired to validation submit
5. **Button success state** — Spec animation (scale + checkmark) not implemented
6. **Route transitions** — `.page-enter` on main content only; no full fadeOut/fadeIn on route change
7. **Document table columns** — API returns limited fields; "Ref No" uses document ID, no candidate name in API response
8. **Trade pill counts** — Approximated when API doesn't return per-category counts
9. **Code splitting** — Main JS bundle is large; lazy loading recommended for admin/editor routes
10. **CompactWizardDots.jsx** — Legacy file retained but unused

---

## 14. How to Run

```bash
cd docgen/frontend
npm install
npm run dev        # Development server (proxies /api → localhost:8000)
npm run build      # Production build
npm run preview    # Preview production build
```

**Demo login:** `admin` / `admin123`

---

## 15. Architecture Diagram

```
docgen/frontend/
├── index.html                 ← Google Fonts, DocFlow title
├── tailwind.config.js
├── postcss.config.js
├── FRONTEND_REDESIGN_REPORT.md
└── src/
    ├── main.jsx               ← ConfigProvider + global.css
    ├── App.jsx                ← Routes (unchanged)
    ├── design/
    │   ├── tokens.js          ← Design tokens + Ant theme
    │   └── animations.js      ← Keyframes + counter util
    ├── styles/
    │   ├── global.css         ← All design system CSS
    │   └── docx-preview.css
    ├── components/
    │   ├── AppLayout.jsx      ← Sidebar + responsive shell
    │   ├── ui/                ← Reusable design components
    │   │   ├── CounterUp.jsx
    │   │   ├── StatCard.jsx
    │   │   ├── StepIndicator.jsx
    │   │   ├── SubStepDots.jsx
    │   │   └── Skeleton.jsx
    │   ├── wizard/            ← Generation flow steps
    │   └── form/              ← Form fields (unchanged logic)
    └── pages/
        ├── DashboardPage.jsx
        ├── EmployersPage.jsx
        ├── CreateDocPage.jsx
        └── LoginPage.jsx
```

---

## 16. Summary

The DocFlow frontend redesign delivers a production-ready visual overhaul with a consistent navy/gold design language, animated dashboard, card-based employer management, and a polished 4-step document generation wizard. All backend contracts, form validation, and routing remain intact. The build passes successfully and the app is responsive across desktop, laptop, tablet, and mobile viewports.

**Total new files:** 11  
**Total modified files:** 15  
**Backend changes:** 0

---

*Report generated for DocGen Pro frontend redesign — June 2026*
