---
name: Kinetic Precision
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#464555'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#575e70'
  on-secondary: '#ffffff'
  secondary-container: '#d9dff5'
  on-secondary-container: '#5c6274'
  tertiary: '#7e3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#dce2f7'
  secondary-fixed-dim: '#c0c6db'
  on-secondary-fixed: '#141b2b'
  on-secondary-fixed-variant: '#404758'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  h1:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.02em
  body-main:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-mono:
    fontFamily: Space Grotesk
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.05em
  table-cell:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  panel-width: 280px
  header-height: 48px
---

## Brand & Style

The design system is engineered for high-performance internal workflows where clarity and density are paramount. It draws inspiration from the disciplined utility of Linear and the structural purity of Notion. The aesthetic is strictly flat, prioritizing information architecture over decorative elements. 

The emotional response should be one of "calm control"—reducing cognitive load through a restrained color palette and precise alignment. By utilizing a 1440x900 fixed viewport, the system treats the screen as a single, unified workspace rather than a scrolling document. 

Key attributes include:
- **Monochromatic core** with a singular, purposeful accent.
- **Structural integrity** through 1px hairlines rather than shadows.
- **High data density** achieved through tight vertical rhythm and small, legible type.
- **Functional whitespace** used to group information without physical containers.

## Colors

The palette is restricted to ensure the Indigo accent remains the primary driver of action and focus. 

- **Backgrounds:** Use `#FFFFFF` for the main content area and `#F8F9FA` for sidebars and utility panels to create subtle depth without shadows.
- **Accents:** Indigo (`#4F46E5`) is reserved exclusively for primary buttons, active states, and critical indicators.
- **Borders:** A consistent `#E5E7EB` is used for all structural separators.
- **Interactive States:** Hover states should utilize a subtle shift to `#F3F4F6` or a 10% opacity overlay of the accent color.

## Typography

This design system utilizes a high-density typographic scale. **Inter** serves as the primary driver for readability and interface logic. **Space Grotesk** (monospaced feel) is employed for metadata, IDs, and small status labels to provide a technical, precise counterpoint to the sans-serif UI.

- **Scale:** Font sizes are intentionally small to maximize data visibility within the fixed viewport.
- **Hierarchy:** Contrast is created through weight (Semibold vs. Regular) and color (Text Primary vs. Text Secondary) rather than large jumps in scale.
- **Anti-aliasing:** Ensure `-webkit-font-smoothing: antialiased` is applied for crisp rendering of small-scale Inter.

## Layout & Spacing

The layout is a **fixed 1440x900 viewport** divided into functional zones. It follows a "No-Scroll" philosophy where internal modules (like lists or code blocks) may contain overflow, but the global frame remains static.

- **Grid:** A 4px baseline grid governs all spacing.
- **Zones:** 
    - **Sidebar:** Fixed 240px-280px width, `#F8F9FA` background.
    - **Header:** Fixed 48px height, 1px bottom border.
    - **Main Content:** Flexible area with 24px-32px internal padding.
- **Density:** Elements are packed tightly. Gutters between cards or modules should not exceed 16px to maintain the "tool" feel.

## Elevation & Depth

In keeping with the flat aesthetic, elevation is communicated through **tonal layering and 1px borders** rather than shadows.

- **Level 0 (Base):** `#FFFFFF` - The canvas.
- **Level 1 (Sub-navigation/Sidebar):** `#F8F9FA` - Surrounds the base.
- **Level 2 (Modals/Overlays):** `#FFFFFF` with a 1px `#E5E7EB` border and a very tight 2px/4px blur shadow (`rgba(0,0,0,0.05)`) only to separate floating elements from the background.
- **Separators:** All logical divisions are marked by 1px solid lines. No gradients or bevels are permitted.

## Shapes

The design system uses a "Soft" rounding logic to take the edge off the high-density layout without appearing overly consumer-focused.

- **Components:** Buttons, inputs, and small tags use a `4px` (0.25rem) radius.
- **Containers:** Larger panels or cards use a `6px` or `8px` radius.
- **Icons:** Use Lucide/Heroicons with a 1.5px or 2px stroke weight to match the technicality of the monospaced labels.

## Components

- **Buttons:** 
    - *Primary:* Indigo background, white text, no shadow. 
    - *Secondary:* White background, 1px border, no shadow. 
    - *Size:* Compact (28px height) for most actions.
- **Inputs:** 1px border, 4px radius. On focus, the border changes to Indigo with no outer glow. Placeholders use Text Secondary.
- **Chips/Badges:** Monospace type, 2px radius, light gray background (`#F3F4F6`). Status-specific colors (Success/Warning) should be desaturated.
- **Lists:** Rows are 32px-36px high. 1px bottom border. Hover state triggers a background change to `#F8F9FA`.
- **Command Menu:** A central component (Cmd+K) styled with a 1px border, utilizing the monospaced label font for shortcuts.
- **Navigation:** Vertical navigation in the sidebar uses 12px Inter Medium with 16px Lucide icons, using a 4px left-accent bar for the active state.