/**
 * Single source for the product name. "AlquilIA" (alquilar + IA) is a provisional working name, pending the
 * team's decision (it replaced "Keyhold" on 2026-10-04; name conflicts are listed in docs/HANDOFF.md). The final brand comes later
 * (see docs/04-brand-handoff.md). Nothing else in the code may hard-code the name.
 */
export const APP_NAME = "AlquilIA";
export const APP_TAGLINE = "AI leasing back-office for rental agencies";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://keyhold-app.vercel.app";
