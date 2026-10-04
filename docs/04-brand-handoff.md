# 04 — Brand handoff via Claude Design

Owners:
- **Ani + design partner:** brand identity.
- **Mauro:** Claude Design session.
- **ui-motion-engineer:** applies the result in code.

## Until the brand arrives
- The code uses neutral placeholder tokens in `styles/tokens.css`.
- No component may hard-code colors, fonts or radii. Swapping the brand must be a token change plus a logo file.

## What Ani's team delivers (minimum)
1. Final name, wordmark and isotype (SVG). Light and dark versions.
2. Palette:
   - primary;
   - secondary;
   - neutrals (at least 5 steps);
   - semantic colors: success / warning / danger.
3. Typography: display and body, with Google Fonts or licensed files.
4. Tone of voice in 3–5 bullets, in English and Spanish.
5. Optional: illustration or iconography style, and motion personality (calm / snappy).

## Steps in Claude Design (claude.ai)
1. In claude.ai, ask Claude to create a **Design System** artifact from the brand package. Upload the SVGs and palette and describe the tone. Result: tokens for color, type, spacing, radii and shadows, plus components.
2. Ask for **Design** mockups of the 4 key screens using that design system:
   - chat with lease timeline;
   - prequal results;
   - two-price payment screen with QR;
   - agency panel (NEEDS_INFO queue + release deposit).
3. Iterate with Ani in the canvas. Ani approves.
4. Export:
   - tokens, as CSS variables or JSON → paste into `styles/tokens.css` / `docs/brand/tokens.json`;
   - mockups, as PNG/PDF → `docs/brand/mockups/`.
5. Give the ui-motion-engineer both `docs/brand/` and this file. It maps the tokens to the Tailwind theme and rebuilds the screens to match the mockups with Framer Motion presets.
6. Optional: the Vercel connector exposes an "import Claude Design from URL" tool ([VERIFY] whether it fits a Next.js repo flow before relying on it).

## Brand checklist for the submission
- Logo PNG 512×512 for the Colosseum and pre-selection forms.
- Favicon and OG image.
- 3 product screenshots for README and Earn.
- One slide template for the pitch video.
