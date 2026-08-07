# Ledger Mist — DocGen Pro design exploration (Stitch)

> Status: **design review only** — not applied to application code.  
> Source: Google Stitch project `DocGen Pro — Audit Log test` (`7621577980415612266`)  
> Design system asset: `assets/5993942569783878613`  
> Preview screen: `Audit Log - Ledger Mist Redesign` (`787c360116ae43308c2845452a319c2e`)  
> Generated: 2026-08-07

## Intent

Fresh modern B2B theme for a document-automation SaaS platform. Explicitly **not** the live maroon/gold platform theme and **not** the earlier Stitch “Institutional Warmth” burgundy proposal. Avoid generic purple/blue SaaS defaults and neon/consumer looks.

## Brand palette (authoritative)

| Role | Hex | Use |
|------|-----|-----|
| Primary teal | `#0F766E` | CTAs, active nav, focus rings |
| Primary dark | `#115E59` / generated `#005C55` | Hover / deeper primary text |
| Secondary slate | `#1E293B` | Sidebar, structural chrome |
| Neutral ink | `#0F172A` | Strong text / on-surface intent |
| Tertiary clay | `#C2410C` | Sparse emphasis only (warnings) |
| Background mist | `#F8FAFC` | Page canvas intent |
| Surface | `#FFFFFF` | Cards / table |
| Border | `#E2E8F0` | Dividers / input borders |
| Muted text | `#64748B` | Metadata, secondary labels |
| Error | `#BA1A1A` | Destructive / error states |

## Generated Material tokens (from Stitch FIDELITY)

These expand from the teal seed; surfaces may read slightly cool/lavender-tinted vs pure `#F8FAFC`. Prefer the **brand palette** above when implementing.

| Token | Hex |
|-------|-----|
| primary | `#005C55` |
| primary_container | `#0F766E` |
| on_primary | `#FFFFFF` |
| secondary | `#545F73` |
| secondary_container | `#D5E0F8` |
| tertiary | `#952C00` |
| tertiary_container | `#BD3D07` |
| background / surface | `#FAF8FF` |
| surface_container | `#EAEDFF` |
| on_surface | `#131B2E` |
| outline | `#6E7977` |
| error | `#BA1A1A` |

## Typography

- **Headlines:** Manrope (600/700)
- **Body / labels:** IBM Plex Sans (400/500)
- Base body: 16px / 24px line-height
- Headline lg: 32px / 40px

## Shape & elevation

- Corner radius: **8px** (`ROUND_EIGHT`)
- Prefer 1px borders + tonal layers over heavy shadows
- No glassmorphism, glow, or neon

## Components (guidance)

- **Primary button:** teal fill, white text
- **Secondary / Export:** outline or ghost on slate/mist
- **Sidebar:** dark slate; active item teal
- **Tables:** dense, clear headers, quiet row hover; role chips for Org Admin / Staff
- **Toolbars:** low-profile; one primary action max per region

## Preview artifacts (local, outside app)

- Image: `C:\Users\neeru\.cursor\projects\z-Projects-DocGen-Pro\stitch-previews\audit-log-ledger-mist-v2.png`
- HTML: `C:\Users\neeru\.cursor\projects\z-Projects-DocGen-Pro\stitch-previews\audit-log-ledger-mist-v2.html`

## Out of scope (for now)

Do **not** wire this into `frontend/` CSS variables, Ant Design theme, or PlatformLayout until explicit approval.
