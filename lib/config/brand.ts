/**
 * Single source for the product name. "Keyhold" is a working name; the final brand comes later
 * (see docs/04-brand-handoff.md). Nothing else in the code may hard-code the name.
 */
export const APP_NAME = "Keyhold";
export const APP_TAGLINE = "AI leasing back-office for rental agencies";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://keyhold-app.vercel.app";
